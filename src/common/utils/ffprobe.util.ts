import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** ffprobe 로 오디오 파일 길이(초)를 읽는다. ffprobe 는 PATH 에 있어야 한다 (로컬 brew, 이미지 apt). */
export async function audioDurationSec(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const sec = parseFloat(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`ffprobe returned no duration for ${file}`);
  }
  return Math.round(sec * 1000) / 1000;
}
