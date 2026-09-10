import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';
import { emuToPx } from '../common/utils/emu.util.js';
import type { PxObject } from '../hyperframes/composition.builder.js';
import type { SlideObjectDto } from './dto/render-request.dto.js';

/** 강조 구간 최소 길이 (초). 이보다 짧으면 페이드가 보이지 않는다 */
export const MIN_HIGHLIGHT_SEC = 0.3;

export interface MappedObjects {
  objects: PxObject[];
  /** 클램프 등 요청은 받아들이되 알려야 할 것 */
  warnings: string[];
}

/**
 * 요청 객체(EMU, 초) → px 객체. DTO 검증(필드 단위) 뒤에 오는 필드 간 검증:
 * - start < end, 구간 최소 길이
 * - end 가 음성 길이를 넘으면 잘라내고 경고 (호출 시점에 음성 길이를 정확히 모를 수 있음)
 * 실패는 INVALID_HIGHLIGHT(400). 순수 함수라 단위 테스트 대상이다.
 */
export function mapSlideObjects(input: SlideObjectDto[], durationSec: number, emuPerPx: number): MappedObjects {
  const errors: string[] = [];
  const warnings: string[] = [];

  const objects = input.map((o, i): PxObject => {
    const id = o.id ?? `obj-${i}`;
    let end = o.end;
    if (o.start >= o.end) {
      errors.push(`object '${id}': start (${o.start}) must be less than end (${o.end})`);
    } else {
      if (end > durationSec) {
        warnings.push(`object '${id}': end ${end} clamped to audio length ${durationSec}`);
        end = durationSec;
      }
      if (end - o.start < MIN_HIGHLIGHT_SEC) {
        errors.push(
          `object '${id}': highlight must last at least ${MIN_HIGHLIGHT_SEC}s (got ${(end - o.start).toFixed(2)}s after clamping)`,
        );
      }
    }
    return {
      id,
      domId: `hl-${i}`,
      left: emuToPx(o.left, emuPerPx),
      top: emuToPx(o.top, emuPerPx),
      width: emuToPx(o.width, emuPerPx),
      height: emuToPx(o.height, emuPerPx),
      start: o.start,
      end,
      effect: o.effect,
      color: o.color,
    };
  });

  if (errors.length > 0) {
    throw new AppException(ErrorCode.INVALID_HIGHLIGHT, { details: errors, message: errors.join('; ') });
  }
  return { objects, warnings };
}
