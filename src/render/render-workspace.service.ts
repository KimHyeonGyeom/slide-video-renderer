import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { copyFile, mkdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';
import { downloadToFile } from '../common/utils/download.util.js';
import configuration from '../config/configuration.js';
import type { CompositionFile, InputKind, RenderInputs } from '../hyperframes/composition.builder.js';

const DEFAULT_EXT: Record<InputKind, string> = { slide: '.png', audio: '.mp3' };

export interface DownloadLimits {
  downloadTimeoutMs: number;
  maxDownloadBytes: number;
}

/** 요청별 작업 폴더를 만든다. 파일시스템 일은 전부 Workspace 가 맡는다. */
@Injectable()
export class RenderWorkspaceService {
  constructor(
    @Inject(configuration.KEY) private readonly config: ConfigType<typeof configuration>,
    @InjectPinoLogger(RenderWorkspaceService.name) private readonly logger: PinoLogger,
  ) {}

  /** @param outputPath 요청의 outputPath. 렌더 결과 파일명은 여기서 온다 */
  async create(jobId: string, outputPath: string): Promise<Workspace> {
    const { workDir, downloadTimeoutMs, maxDownloadBytes } = this.config.render;
    const dir = path.resolve(workDir, jobId);
    await mkdir(path.join(dir, 'input'), { recursive: true });
    return new Workspace(dir, jobId, outputPath, { downloadTimeoutMs, maxDownloadBytes }, this.logger);
  }
}

/**
 * work/<jobId>/
 *   input/                 호출 측이 준 입력을 받아둔 곳 (URL 다운로드 또는 로컬 복사)
 *   index.html, assets/    CompositionBuilder 가 정한 프로젝트 파일
 *   <outputPath 의 파일명>  렌더 결과. 렌더는 여기(로컬 디스크)에 쓰고 deliver() 가 outputPath 로 옮긴다.
 *                          outputPath 에 직접 쓰지 않는 이유: NAS 에 쓰다 만 파일이 보이거나 실패한 파일이 남지 않게
 */
export class Workspace {
  readonly inputDir: string;
  /** 렌더 결과가 쓰이는 임시 위치. 파일명은 요청의 outputPath 와 같다 */
  readonly renderedFile: string;

  constructor(
    readonly dir: string,
    readonly jobId: string,
    readonly outputPath: string,
    private readonly limits: DownloadLimits,
    private readonly logger: PinoLogger,
  ) {
    this.inputDir = path.join(dir, 'input');
    this.renderedFile = path.join(dir, path.basename(outputPath));
  }

  /**
   * 입력들을 한꺼번에 받아 같은 모양으로 로컬 경로를 돌려준다.
   * 예: { slide: 'https://nas/s3.png', audio: '/abs/s3.mp3' } → { slide: '<dir>/input/slide.png', audio: '<dir>/input/audio.mp3' }
   */
  async fetchInputs(sources: RenderInputs): Promise<RenderInputs> {
    const kinds = Object.keys(sources) as InputKind[];
    const paths = await Promise.all(kinds.map((kind) => this.fetchInput(sources[kind], kind)));
    return Object.fromEntries(kinds.map((kind, i) => [kind, paths[i]])) as RenderInputs;
  }

  /** URL 이면 다운로드, 아니면 절대경로 복사. 원본 확장자를 유지해 input/<kind><ext> 로 둔다. 실패는 INPUT_NOT_READABLE(400). */
  private async fetchInput(src: string, kind: InputKind): Promise<string> {
    const dest = path.join(this.inputDir, `${kind}${extOf(src) || DEFAULT_EXT[kind]}`);
    try {
      if (/^https?:\/\//i.test(src)) {
        await downloadToFile(src, dest, { timeoutMs: this.limits.downloadTimeoutMs, maxBytes: this.limits.maxDownloadBytes });
      } else {
        if (!path.isAbsolute(src) || !(await stat(src)).isFile()) {
          throw new Error('not an absolute path to an existing file');
        }
        await copyFile(src, dest);
      }
    } catch (err) {
      throw new AppException(ErrorCode.INPUT_NOT_READABLE, {
        jobId: this.jobId,
        message: `cannot read ${kind} '${src}': ${(err as Error).message}`,
        cause: err,
      });
    }
    return dest;
  }

  /** 빌더가 정한 파일 계획을 디스크에 쓴다 */
  async materialize(files: CompositionFile[]): Promise<void> {
    await Promise.all(
      files.map(async (f) => {
        const target = path.join(this.dir, f.path);
        await mkdir(path.dirname(target), { recursive: true });
        if (f.content !== undefined) await writeFile(target, f.content);
        else if (f.copyFrom) await copyFile(f.copyFrom, target);
      }),
    );
  }

  /** 렌더 결과를 요청의 outputPath 로 옮긴다. rename 이 안 되면(작업 폴더와 NAS 마운트가 다른 볼륨) copy + unlink. */
  async deliver(): Promise<void> {
    await mkdir(path.dirname(this.outputPath), { recursive: true });
    try {
      await rename(this.renderedFile, this.outputPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      await copyFile(this.renderedFile, this.outputPath);
      await unlink(this.renderedFile);
    }
  }

  /** 작업 폴더 삭제. keep 이면 남기고 위치를 로그에 남긴다 (개발 환경에서 렌더 실패 진단용). */
  async cleanup(keep: boolean): Promise<void> {
    if (keep) {
      this.logger.warn({ jobId: this.jobId, dir: this.dir }, 'work dir kept for debugging');
      return;
    }
    await rm(this.dir, { recursive: true, force: true });
  }
}

/** URL 이든 절대경로든 확장자만 뽑는다 (쿼리스트링 제외) */
function extOf(src: string): string {
  return path.extname(new URL(src, 'file:///').pathname).toLowerCase();
}
