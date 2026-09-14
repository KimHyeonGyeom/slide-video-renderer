import type { ErrorCodeDef } from './error-code.js';

export interface AppExceptionOptions {
  /** 기본 메시지 대신 쓸 메시지 */
  message?: string;
  /** 렌더 작업 id. 출력 메시지에 실려 워커 로그와 대조할 수 있다 */
  jobId?: string;
  /** 추가 정보 (검증 실패 목록 등) */
  details?: unknown;
  /** 원인 예외 */
  cause?: unknown;
}

/**
 * 서비스 계층이 던지는 유일한 예외 타입. 출력 큐 메시지로의 변환은 RenderConsumer 가 한다.
 * Spring 의 BusinessException(ErrorCode) 에 해당.
 */
export class AppException extends Error {
  readonly code: string;
  readonly status: number;
  readonly jobId?: string;
  readonly details?: unknown;

  constructor(def: ErrorCodeDef, options: AppExceptionOptions = {}) {
    super(options.message ?? def.message, { cause: options.cause });
    this.name = 'AppException';
    this.code = def.code;
    this.status = def.status;
    this.jobId = options.jobId;
    this.details = options.details;
  }

  /** jobId 없이 던져진 예외에 jobId 를 붙인 사본 */
  withJobId(jobId: string): AppException {
    return new AppException(
      { code: this.code, status: this.status, message: this.message },
      { jobId, details: this.details, cause: this.cause },
    );
  }
}
