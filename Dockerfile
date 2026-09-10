# syntax=docker/dockerfile:1
# hyperframes 공식 packages/cli/src/docker/Dockerfile.render 를 바탕으로 한 실행 이미지.
#   빌드:   docker build -t slide-video-renderer .            (이 Mac 에서는 arm64 이미지가 된다)
#           docker build --platform linux/amd64 -t ... .       (운영 노드가 amd64 면)
#   실행:   docker run --rm -p 8080:8080 -e NODE_ENV=production -e RENDER_WORKERS=2 --shm-size=1g slide-video-renderer

# ── 1. 빌드: TypeScript → dist (devDependencies 필요) ──────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
# puppeteer 가 npm install 때 Chrome 을 내려받지 않게 한다 (런타임 이미지가 따로 설치)
ENV PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ── 2. 런타임: ffmpeg + chrome-headless-shell + dist ─────────────────────────
FROM node:22-bookworm-slim
ARG TARGETARCH
ARG PLAYWRIGHT_VERSION=1.61.1

# Debian 저장소를 HTTPS 로 (일부 네트워크가 평문 HTTP 를 막는다). slim 이미지에는 CA 인증서가 없어서
# ca-certificates 를 설치할 때까지만 검증을 끈다. 평문 HTTP 가 되는 환경이면 이 두 줄은 없어도 된다.
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::Verify-Peer=false update \
    && apt-get -o Acquire::https::Verify-Peer=false install -y --no-install-recommends ca-certificates \
    && apt-get update && apt-get install -y --no-install-recommends \
      curl ffmpeg tini fonts-liberation \
      libgbm1 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
      libxrandr2 libxfixes3 libxkbcommon0 libxshmfence1 libcups2 libasound2 libdbus-1-3 \
      libglib2.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# chrome-headless-shell: amd64 는 chrome-for-testing, arm64 는 Playwright 의 pinned 빌드
# (Debian 의 chromium arm64 패키지는 headless 에서 크래시 — hyperframes 이슈 #2039)
ENV CHROME_DIR=/opt/chrome
RUN mkdir -p "$CHROME_DIR" && \
    if [ "$TARGETARCH" = "amd64" ]; then \
      npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path "$CHROME_DIR"; \
    else \
      PLAYWRIGHT_BROWSERS_PATH="$CHROME_DIR" npx --yes playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell; \
    fi && \
    rm -rf /root/.npm

WORKDIR /app
ENV NODE_ENV=production PORT=8080 PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8080
# tini: PID 1 로 신호(SIGTERM)를 node 에 정확히 전달하고 좀비 프로세스(Chrome)를 정리한다
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
