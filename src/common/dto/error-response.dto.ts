import { ApiProperty } from '@nestjs/swagger';

/** 모든 에러 응답의 형태. GlobalExceptionFilter 가 만든다 */
export class ErrorResponseDto {
  /** HTTP 상태 코드 */
  statusCode: number;

  /** 기계용 에러 코드 (common/exceptions/error-code.ts) */
  error: string;

  /** 사람용 메시지. 검증 실패는 항목별 문자열 배열 */
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message: string | string[];

  /** 렌더 작업 id. 서버 로그의 jobId 와 같다 */
  jobId?: string;

  /** 추가 정보 */
  @ApiProperty({ required: false, type: Object })
  details?: unknown;
}
