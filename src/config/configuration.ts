import { registerAs } from '@nestjs/config';

export type RenderQuality = 'draft' | 'standard' | 'high';

const int = (value: string | undefined, fallback: number): number => (value ? parseInt(value, 10) : fallback);

/**
 * 설정. 값은 .env(로컬) 또는 Deployment env(운영)에서 오고, 없으면 여기 기본값. 키 설명은 .env.example
 * 서비스에서는 `@Inject(configuration.KEY) private readonly config: ConfigType<typeof configuration>` 로 받는다.
 */
export default registerAs('config', () => {
  const width = int(process.env.RENDER_WIDTH, 1920);
  const slideWidthEmu = int(process.env.SLIDE_WIDTH_EMU, 12_192_000);
  return {
    app: {
      port: int(process.env.PORT, 8080),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      isProduction: process.env.NODE_ENV === 'production',
      logLevel: process.env.LOG_LEVEL ?? 'info',
    },
    render: {
      width,
      height: int(process.env.RENDER_HEIGHT, 1080),
      fps: int(process.env.RENDER_FPS, 30),
      quality: (process.env.RENDER_QUALITY ?? 'standard') as RenderQuality,
      /** hyperframes 캡처 워커 수. 파드 CPU 수에 맞춘다 (벤치: 2 면 충분) */
      workers: int(process.env.RENDER_WORKERS, 2),
      /** 파드당 동시 렌더 수. 쿠버네티스에서는 1 로 두고 replica 로 늘린다 */
      rendersPerPod: int(process.env.RENDERS_PER_POD, 1),
      /** 렌더 1건 상한(ms). 대기 시간은 포함하지 않는다 */
      timeoutMs: int(process.env.RENDER_TIMEOUT_MS, 600_000),
      /** 요청별 작업 폴더의 루트 (파드 로컬 디스크) */
      workDir: process.env.WORK_DIR ?? './work',
      downloadTimeoutMs: int(process.env.DOWNLOAD_TIMEOUT_MS, 60_000),
      maxDownloadBytes: int(process.env.MAX_DOWNLOAD_MB, 200) * 1024 * 1024,
      /** PPT 슬라이드 폭(EMU). 16:9 표준 = 12,192,000 */
      slideWidthEmu,
      /** 1px 당 EMU. 16:9 기본값이면 6350 */
      emuPerPx: slideWidthEmu / width,
    },
  };
});
