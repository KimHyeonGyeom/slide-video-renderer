/**
 * EMU(English Metric Unit) → px.
 * 16:9 표준 슬라이드는 12,192,000 × 6,858,000 EMU 이고 출력이 1920×1080 이면 6350 EMU = 1px.
 * emuPerPx 는 AppConfigService.slide.emuPerPx (SLIDE_WIDTH_EMU / RENDER_WIDTH) 에서 온다.
 */
export function emuToPx(emu: number, emuPerPx: number): number {
  return Math.round(emu / emuPerPx);
}
