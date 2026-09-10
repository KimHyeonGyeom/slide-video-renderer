#!/bin/sh
# 이미지에 설치된 chrome-headless-shell 을 찾아 hyperframes 가 읽는 env 로 넘긴 뒤 서버를 띄운다.
set -e
if [ -z "${PRODUCER_HEADLESS_SHELL_PATH:-}" ]; then
  PRODUCER_HEADLESS_SHELL_PATH="$(find "${CHROME_DIR:-/opt/chrome}" -type f \( -name chrome-headless-shell -o -name headless_shell \) 2>/dev/null | head -n 1)"
  export PRODUCER_HEADLESS_SHELL_PATH
fi
if [ ! -x "$PRODUCER_HEADLESS_SHELL_PATH" ]; then
  echo "entrypoint: chrome-headless-shell not found under ${CHROME_DIR:-/opt/chrome}" >&2
  exit 1
fi
echo "entrypoint: PRODUCER_HEADLESS_SHELL_PATH=$PRODUCER_HEADLESS_SHELL_PATH RENDER_WORKERS=${RENDER_WORKERS:-2(default)}"
exec node dist/main.js
