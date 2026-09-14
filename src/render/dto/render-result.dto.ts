/** 렌더 1건의 결과. 출력 큐 메시지(status: ok)에 그대로 실린다 */
export interface RenderResultDto {
  /** 입력 메시지의 slideId 그대로 */
  slideId?: string;
  /** 결과 mp4 경로 (입력의 outputPath) */
  outputPath: string;
  /** 영상 길이 = 음성 길이 (초) */
  durationSec: number;
  /** 렌더에 걸린 시간 (ms) */
  renderMs: number;
  /** 치명적이지 않은 경고 (end 클램프, 엔진 경고) */
  warnings: string[];
}
