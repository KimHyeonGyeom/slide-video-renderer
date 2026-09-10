import { describe, expect, it } from 'vitest';
import { AppException } from '../common/exceptions/app.exception.js';
import type { SlideObjectDto } from './dto/render-request.dto.js';
import { mapSlideObjects } from './slide-objects.mapper.js';

const EMU_PER_PX = 6350; // 16:9 표준 슬라이드, 1920px

function obj(overrides: Partial<SlideObjectDto> = {}): SlideObjectDto {
  return { left: 838200, top: 365125, width: 10515600, height: 1325563, start: 0.5, end: 3.0, effect: 'box', ...overrides };
}

describe('mapSlideObjects', () => {
  it('EMU 를 px 로 바꾸고 domId 를 index 기준으로 붙인다', () => {
    const { objects, warnings } = mapSlideObjects([obj({ id: 'title' })], 10, EMU_PER_PX);
    expect(objects[0]).toMatchObject({ id: 'title', domId: 'hl-0', left: 132, top: 58, width: 1656, height: 209 });
    expect(warnings).toEqual([]);
  });

  it('end 가 음성 길이를 넘으면 잘라내고 경고를 남긴다', () => {
    const { objects, warnings } = mapSlideObjects([obj({ end: 12 })], 10.4, EMU_PER_PX);
    expect(objects[0].end).toBe(10.4);
    expect(warnings[0]).toContain('clamped');
  });

  it('start >= end 이면 INVALID_HIGHLIGHT 를 던진다', () => {
    expect(() => mapSlideObjects([obj({ start: 5, end: 5 })], 10, EMU_PER_PX)).toThrowError(AppException);
    try {
      mapSlideObjects([obj({ start: 5, end: 5 })], 10, EMU_PER_PX);
    } catch (e) {
      expect((e as AppException).code).toBe('INVALID_HIGHLIGHT');
      expect((e as AppException).status).toBe(400);
    }
  });

  it('클램프 뒤 구간이 0.3초보다 짧으면 거절한다', () => {
    expect(() => mapSlideObjects([obj({ start: 10.3, end: 12 })], 10.4, EMU_PER_PX)).toThrowError(/at least 0.3s/);
  });

  it('효과가 서로 시간이 겹쳐도 된다', () => {
    const { objects } = mapSlideObjects([obj({ effect: 'zoom' }), obj({ effect: 'zoom-box' })], 10, EMU_PER_PX);
    expect(objects).toHaveLength(2);
  });
});
