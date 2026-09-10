#!/usr/bin/env python3
"""PDF 의 각 페이지를 PNG 로 렌더한다 (macOS 내장 PyObjC Quartz 사용, 추가 설치 없음).
사용: python3 scripts/pdf-to-png.py deck.pdf outDir [width=1920]
출력: outDir/slide-1.png, slide-2.png, ...   (슬라이드 이미지 픽스처를 만들 때 쓴다)
"""
import os
import sys

import Quartz
from Foundation import NSURL

pdf_path, out_dir = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
os.makedirs(out_dir, exist_ok=True)

pdf = Quartz.PDFDocument.alloc().initWithURL_(NSURL.fileURLWithPath_(os.path.abspath(pdf_path)))
if pdf is None:
    sys.exit(f"cannot open {pdf_path}")

for i in range(pdf.pageCount()):
    page = pdf.pageAtIndex_(i)
    box = page.boundsForBox_(Quartz.kPDFDisplayBoxMediaBox)
    scale = width / box.size.width
    w, h = int(round(box.size.width * scale)), int(round(box.size.height * scale))
    cs = Quartz.CGColorSpaceCreateDeviceRGB()
    ctx = Quartz.CGBitmapContextCreate(None, w, h, 8, w * 4, cs, Quartz.kCGImageAlphaPremultipliedLast)
    Quartz.CGContextSetRGBFillColor(ctx, 1, 1, 1, 1)
    Quartz.CGContextFillRect(ctx, Quartz.CGRectMake(0, 0, w, h))
    Quartz.CGContextScaleCTM(ctx, scale, scale)
    Quartz.CGContextTranslateCTM(ctx, -box.origin.x, -box.origin.y)
    page.drawWithBox_toContext_(Quartz.kPDFDisplayBoxMediaBox, ctx)
    image = Quartz.CGBitmapContextCreateImage(ctx)
    out = os.path.join(out_dir, f"slide-{i + 1}.png")
    dest = Quartz.CGImageDestinationCreateWithURL(NSURL.fileURLWithPath_(os.path.abspath(out)), "public.png", 1, None)
    Quartz.CGImageDestinationAddImage(dest, image, None)
    Quartz.CGImageDestinationFinalize(dest)
    print(f"{out}  {w}x{h}")
