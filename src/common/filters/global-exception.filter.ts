import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ErrorResponseDto } from '../dto/error-response.dto.js';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../exceptions/error-code.js';

/**
 * 예외 → HTTP 응답을 만드는 유일한 곳. Spring 의 @RestControllerAdvice 에 해당.
 * - AppException: 코드 표의 status/code 그대로
 * - HttpException (ValidationPipe 의 400 등 Nest 가 던지는 것): 같은 응답 형태로 맞춘다
 * - 그 외: 500 INTERNAL_ERROR, 스택은 로그에만
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(GlobalExceptionFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const body = toErrorResponse(exception);

    const fields = { statusCode: body.statusCode, error: body.error, jobId: body.jobId, method: req.method, url: req.url };
    const text = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    // 클라이언트 이탈은 호출 측 사정이라 서버 오류로 세지 않는다
    if (body.statusCode >= 500 && body.error !== ErrorCode.CLIENT_DISCONNECTED.code) {
      this.logger.error({ ...fields, err: exception }, text);
    } else {
      this.logger.warn(fields, text);
    }
    res.status(body.statusCode).json(body);
  }
}

export function toErrorResponse(exception: unknown): ErrorResponseDto {
  if (exception instanceof AppException) {
    return {
      statusCode: exception.status,
      error: exception.code,
      message: exception.message,
      jobId: exception.jobId,
      details: exception.details,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'object' && response !== null && 'message' in response
        ? (response as { message: string | string[] }).message
        : exception.message;
    const error = status === 400 ? ErrorCode.VALIDATION_FAILED.code : snakeUpper(exception.name.replace(/Exception$/, ''));
    return { statusCode: status, error, message };
  }
  return { statusCode: 500, error: ErrorCode.INTERNAL_ERROR.code, message: ErrorCode.INTERNAL_ERROR.message };
}

/** NotFound → NOT_FOUND */
function snakeUpper(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}
