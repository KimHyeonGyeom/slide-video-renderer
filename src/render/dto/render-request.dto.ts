import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * box      객체 주위 테두리가 나타났다 사라진다
 * zoom     객체 영역을 오려낸 조각이 제자리에서 서서히 커졌다가 되돌아온다
 * shake    오려낸 조각이 살짝 떠서 좌우로 짧게 흔들린다
 * zoom-box zoom + 조각에 테두리
 * marker   객체 위에 형광펜을 긋는다. 넓고 높은 상자(여러 줄 텍스트)는 줄마다 왼쪽에서 오른쪽으로
 * circle   펜으로 객체 둘레를 한 바퀴 조금 넘게 둘러 그린다
 * underline 객체 아래쪽에 손글씨 밑줄을 왼쪽에서 오른쪽으로 긋는다
 * glow     부드러운 빛 테두리가 숨 쉬듯 커졌다 작아진다 (약한 강조)
 * spotlight 객체만 남기고 화면 전체를 어둡게 덮는다. 같은 시간에 두 객체에 걸면 서로를 어둡게 하니 겹치지 않게
 */
export const EFFECTS = ['box', 'zoom', 'shake', 'zoom-box', 'marker', 'circle', 'underline', 'glow', 'spotlight'] as const;
export type Effect = (typeof EFFECTS)[number];

/** 강조할 슬라이드 객체 하나. 좌표는 EMU (python-pptx 의 shape.left/top/width/height 그대로). */
export class SlideObjectDto {
  /** 식별자. 로그/경고 메시지에만 쓰인다. 없으면 obj-<index> */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  /** 왼쪽 (EMU) */
  @IsInt()
  @Min(0)
  left: number;

  /** 위 (EMU) */
  @IsInt()
  @Min(0)
  top: number;

  /** 너비 (EMU) */
  @IsInt()
  @Min(1)
  width: number;

  /** 높이 (EMU) */
  @IsInt()
  @Min(1)
  height: number;

  /** 강조 시작 (초) */
  @IsNumber()
  @Min(0)
  start: number;

  /** 강조 끝 (초). 음성 길이보다 크면 음성 길이로 잘리고 warnings 에 기록된다 */
  @IsNumber()
  @IsPositive()
  end: number;

  /** 효과: box | zoom | shake | zoom-box | marker | circle | underline | glow | spotlight. 객체끼리 시간이 겹쳐도 된다 (spotlight 끼리만 피할 것) */
  @ApiProperty({ enum: EFFECTS })
  @IsIn(EFFECTS)
  effect: Effect;

  /** 색 (#RRGGBB). box/zoom-box 테두리, marker 형광펜, circle/underline 펜, glow 빛. 없으면 효과별 서버 기본색 (테두리·펜 빨강, 형광펜 노랑, 글로우 호박). zoom/shake/spotlight 는 무시 */
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

/** POST /render 본문 */
export class RenderRequestDto {
  /** 로그/응답 식별용 (선택) */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  slideId?: string;

  /** 슬라이드 이미지(1920×1080 PNG/JPG). http(s) URL 이면 다운로드, 아니면 서버의 절대경로 */
  @IsString()
  @IsNotEmpty()
  slideImage: string;

  /** 음성 파일(mp3). http(s) URL 또는 서버의 절대경로. 영상 길이가 이 파일 길이로 정해진다 */
  @IsString()
  @IsNotEmpty()
  audio: string;

  /** 결과 mp4 절대경로 (서버/파드 기준). 폴더가 없으면 만들고 같은 파일이 있으면 덮어쓴다 */
  @IsString()
  @Matches(/^\/.+\.mp4$/, { message: 'outputPath must be an absolute path ending with .mp4' })
  outputPath: string;

  /** 강조할 객체 목록 (1개 이상) */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SlideObjectDto)
  objects: SlideObjectDto[];
}
