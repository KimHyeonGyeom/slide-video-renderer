import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiGatewayTimeoutResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { RenderRequestDto } from './dto/render-request.dto.js';
import { RenderResponseDto } from './dto/render-response.dto.js';
import { RenderService } from './render.service.js';

@ApiTags('render')
@Controller()
export class RenderController {
  constructor(private readonly service: RenderService) {}

  /** 슬라이드 1장을 렌더한다. 렌더가 끝날 때까지 응답하지 않는다 (대기 포함 수 분 가능). */
  @Post('render')
  @HttpCode(200)
  @ApiOperation({ summary: '슬라이드 강조 영상 렌더 (동기)' })
  @ApiOkResponse({ type: RenderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED | INPUT_NOT_READABLE | INVALID_HIGHLIGHT' })
  @ApiGatewayTimeoutResponse({ type: ErrorResponseDto, description: 'RENDER_TIMEOUT' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'RENDER_FAILED | COMPOSITION_NOT_ANIMATED' })
  render(@Body() dto: RenderRequestDto, @Res({ passthrough: true }) res: Response): Promise<RenderResponseDto> {
    return this.service.render(dto, clientAbortSignal(res));
  }
}

/** 호출 측이 응답을 받기 전에 연결을 끊으면 abort 된다 (대기 중이면 렌더를 건너뛴다). */
function clientAbortSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort(new Error('client disconnected'));
  });
  return controller.signal;
}
