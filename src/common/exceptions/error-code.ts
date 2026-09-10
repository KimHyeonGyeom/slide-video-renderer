/**
 * 에러 코드 표. 새 에러는 여기에 한 줄 추가하고 `throw new AppException(ErrorCode.X, {...})` 로 던진다.
 * HTTP 상태와 기본 메시지를 함께 정의한다. Spring 의 ErrorCode enum 에 해당.
 */
export const ErrorCode = {
  VALIDATION_FAILED: { code: 'VALIDATION_FAILED', status: 400, message: 'request validation failed' },
  INPUT_NOT_READABLE: { code: 'INPUT_NOT_READABLE', status: 400, message: 'input file is not readable' },
  INVALID_HIGHLIGHT: { code: 'INVALID_HIGHLIGHT', status: 400, message: 'invalid highlight timing' },
  RENDER_TIMEOUT: { code: 'RENDER_TIMEOUT', status: 504, message: 'render timed out' },
  COMPOSITION_NOT_ANIMATED: {
    code: 'COMPOSITION_NOT_ANIMATED',
    status: 500,
    message: 'composition timeline was not registered; the video would have no highlight',
  },
  CLIENT_DISCONNECTED: { code: 'CLIENT_DISCONNECTED', status: 500, message: 'client disconnected before the render finished' },
  RENDER_FAILED: { code: 'RENDER_FAILED', status: 500, message: 'render failed' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'internal error' },
} as const;

export interface ErrorCodeDef {
  code: string;
  status: number;
  message: string;
}
