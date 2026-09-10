#!/usr/bin/env bash
# API 동작 검증. 서버를 먼저 띄운 뒤 실행한다:  bash scripts/api-test.sh
#  - 400 케이스 3종 (스키마 위반 / 없는 입력 파일 / 줌 겹침·start>=end)
#  - 정상 렌더 1건
#  - 동시 요청 3건 (1개 렌더 + 2개 대기 → 전부 200)
#  - 대기 중 연결 끊김 (끊은 요청의 렌더는 건너뜀)
#  - 렌더 도중 SIGTERM (진행 중 요청은 200, 서버는 그 뒤 종료)  ※ SIGTERM_TEST=0 이면 생략
set -u
BASE=${BASE:-http://localhost:8080}
REQ=fixtures/sample/request.json
cd "$(dirname "$0")/.."
mkdir -p work/api-test
# 픽스처는 머신별 절대경로가 들어가므로 없으면 여기서 만든다
[ -f "$REQ" ] || node scripts/make-fixture.mjs fixtures/sample

post() { curl -s -X POST "$BASE/render" -H 'Content-Type: application/json' "$@"; }
json() { node -e "const r=JSON.parse(require('fs').readFileSync('$1','utf8')); console.log(JSON.stringify({status:r.error??'ok', queuedMs:r.queuedMs, renderMs:r.renderMs, message:r.message}))"; }
starts() { grep -c 'render start' work/server.log 2>/dev/null || echo 0; }

for i in $(seq 1 60); do curl -sf "$BASE/health" >/dev/null && break; sleep 0.5; done
echo "== health: $(curl -s "$BASE/health")"

echo "== 400 cases"
for f in request-schema request-missing request-bad; do
  printf '%-16s → ' "$f"; post -d @fixtures/sample/$f.json -o work/api-test/$f.json -w '%{http_code}\n'
done

echo "== single render"
rm -f fixtures/sample/out.mp4
post -d @$REQ -o work/api-test/single.json -w 'status=%{http_code}  '; json work/api-test/single.json
ls -la fixtures/sample/out.mp4

echo "== 3 concurrent renders (expect rendering=1 queued=2 during, then all 200)"
for n in 1 2 3; do post -d @$REQ -o work/api-test/r$n.json -w "r$n status=%{http_code}\n" & done
sleep 3; echo "health during: $(curl -s "$BASE/health")"
wait
for n in 1 2 3; do printf 'r%s ' $n; json work/api-test/r$n.json; done

echo "== client disconnects while queued (c2 gives up after 2s → its render is skipped)"
before=$(starts)
post -d @$REQ -o work/api-test/c1.json -w 'c1 status=%{http_code}\n' &
sleep 1
post -d @$REQ --max-time 2 -o /dev/null -w 'c2 status=%{http_code} (000 = client gave up)\n'
wait
echo "render starts: $before → $(starts) (expect +1)"; grep -o 'client disconnected while queued' work/server.log | tail -1

if [ "${SIGTERM_TEST:-1}" = 1 ]; then
  echo "== SIGTERM during an in-flight render (request must still get 200, then the server exits)"
  PID=$(pgrep -f 'node dist/main.js' | head -1)
  post -d @$REQ -o work/api-test/s1.json -w 's1 status=%{http_code}\n' &
  sleep 2; kill -TERM "$PID" && echo "SIGTERM → pid $PID"
  sleep 0.5; curl -s --max-time 3 -o /dev/null -w 'health during shutdown: %{http_code} (000 = refused)\n' "$BASE/health"
  wait; printf 's1 '; json work/api-test/s1.json
  for i in $(seq 1 20); do pgrep -f 'node dist/main.js' >/dev/null || break; sleep 0.5; done
  pgrep -f 'node dist/main.js' >/dev/null && echo "server still running after 10s (unexpected)" || echo "server exited after the in-flight render completed"
  grep -E 'shutdown' work/server.log | tail -1
fi
