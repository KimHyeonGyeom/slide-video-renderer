/**
 * 에러 코드 표. 새 에러는 여기에 한 줄 추가하고 `throw new AppException(ErrorCode.X, {...})` 로 던진다.
 * status 는 성격 구분(400 = 입력 문제, 5xx = 우리/엔진 문제)이고, 출력 큐 메시지에는 code 와 message 가 실린다.
 * Spring 의 ErrorCode enum 에 해당.
 */
export const ErrorCode = {
  VALIDATION_FAILED: { code: 'VALIDATION_FAILED', status: 400, message: 'input message validation failed' },
  INPUT_NOT_READABLE: { code: 'INPUT_NOT_READABLE', status: 400, message: 'input file is not readable' },
  INVALID_HIGHLIGHT: { code: 'INVALID_HIGHLIGHT', status: 400, message: 'invalid highlight timing' },
  RENDER_TIMEOUT: { code: 'RENDER_TIMEOUT', status: 504, message: 'render timed out' },
  COMPOSITION_NOT_ANIMATED: {
    code: 'COMPOSITION_NOT_ANIMATED',
    status: 500,
    message: 'composition timeline was not registered; the video would have no highlight',
  },
  RENDER_FAILED: { code: 'RENDER_FAILED', status: 500, message: 'render failed' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'internal error' },
} as const;

export interface ErrorCodeDef {
  code: string;
  status: number;
  message: string;
}
