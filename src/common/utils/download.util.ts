import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface DownloadOptions {
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
}

/** URL 을 스트리밍으로 파일에 받는다. 시간/크기 상한을 넘으면 실패한다. */
export async function downloadToFile(url: string, dest: string, opts: DownloadOptions): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs), headers: opts.headers });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > opts.maxBytes) {
    throw new Error(`file too large: ${declared} bytes (limit ${opts.maxBytes})`);
  }

  let received = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > opts.maxBytes) {
        throw new Error(`file too large: exceeded ${opts.maxBytes} bytes`);
      }
      controller.enqueue(chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(res.body.pipeThrough(limiter) as import('node:stream/web').ReadableStream<Uint8Array>),
    createWriteStream(dest),
  );
}
