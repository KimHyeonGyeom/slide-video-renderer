/** POST /render 응답 (200) */
export class RenderResponseDto {
  /** 요청의 slideId 그대로 */
  slideId?: string;

  /** 결과 mp4 경로 (요청의 outputPath) */
  outputPath: string;

  /** 영상 길이 = 음성 길이 (초) */
  durationSec: number;

  /** 파드 안 대기열에서 기다린 시간 (ms). 크면 replica 를 늘릴 신호 */
  queuedMs: number;

  /** 실제 렌더에 걸린 시간 (ms) */
  renderMs: number;

  /** 치명적이지 않은 경고 (end 클램프, 엔진 경고) */
  warnings: string[];
}
