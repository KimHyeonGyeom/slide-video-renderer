#!/usr/bin/env bash
# CPU·메모리를 제한한 컨테이너에서 같은 슬라이드 세트를 렌더해 파드 크기의 근거를 만든다.
# 사용: bash scripts/docker-bench.sh "<cpus> <memory> <workers> <shm>" ...
#   예: bash scripts/docker-bench.sh "1 1g 1 256m" "2 2g 2 512m" "4 4g 4 1g"
# env: IMAGE(기본 slide-video-renderer) DECK(기본 fixtures/deck/sample) SLIDES(기본 1,6) PARALLEL(기본 1, 동시 요청 수)
# 조건마다: 컨테이너 기동 → deck:render → 벽시계 시간, 응답의 renderMs, 메모리 피크, OOM/종료코드 기록 → work/bench/<조건>.log
set -u
IMAGE=${IMAGE:-slide-video-renderer}
DECK=${DECK:-fixtures/deck/sample}
SLIDES=${SLIDES:-1,6}
PARALLEL=${PARALLEL:-1}
PORT=${PORT:-18080}
NAME=svr-bench
cd "$(dirname "$0")/.."
mkdir -p work/bench
echo "image=$IMAGE deck=$DECK slides=$SLIDES parallel=$PARALLEL"
printf '%-6s %-7s %-7s %-6s | %-8s %-10s %-9s %-6s %s\n' cpus memory workers shm wall peakMem exit oom renders
for cond in "$@"; do
  read -r CPUS MEM WORKERS SHM <<< "$cond"
  tag="c${CPUS}-m${MEM}-w${WORKERS}-shm${SHM}"
  docker rm -f $NAME >/dev/null 2>&1
  docker run -d --name $NAME --cpus "$CPUS" --memory "$MEM" --memory-swap "$MEM" --shm-size "$SHM" \
    -e NODE_ENV=production -e LOG_LEVEL=info -e RENDER_WORKERS="$WORKERS" \
    -p "$PORT:8080" -v "$PWD/fixtures:$PWD/fixtures" "$IMAGE" >/dev/null || { echo "$tag: docker run failed"; continue; }
  for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done
  if ! curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "$tag: server did not start"; docker logs $NAME 2>&1 | tail -5; docker rm -f $NAME >/dev/null; continue
  fi
  # 메모리 샘플러 (1초 간격, MiB 로 환산)
  : > "work/bench/$tag.mem"
  ( while docker ps -q -f name=$NAME | grep -q .; do
      docker stats --no-stream --format '{{.MemUsage}}' $NAME 2>/dev/null | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); v=v*1024} else if (v ~ /MiB/) {sub(/MiB/,"",v)} else if (v ~ /KiB/) {sub(/KiB/,"",v); v=v/1024} print int(v)}'
      sleep 1
    done ) >> "work/bench/$tag.mem" &
  SAMPLER=$!
  start=$(date +%s)
  node scripts/deck-render.mjs "$DECK" "$SLIDES" --server "http://localhost:$PORT" --parallel "$PARALLEL" > "work/bench/$tag.log" 2>&1
  wall=$(( $(date +%s) - start ))
  kill $SAMPLER 2>/dev/null; wait $SAMPLER 2>/dev/null
  # cgroup v2 의 memory.peak 가 정확한 최고치 (샘플링은 짧은 피크를 놓친다). 없으면 샘플 최대값
  peak=$(docker exec $NAME sh -c 'cat /sys/fs/cgroup/memory.peak 2>/dev/null' 2>/dev/null | awk '{print int($1/1048576)}')
  [ -n "$peak" ] || peak=$(sort -n "work/bench/$tag.mem" | tail -1)
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' $NAME 2>/dev/null)
  running=$(docker inspect -f '{{.State.Running}}' $NAME 2>/dev/null)
  oom=$(docker inspect -f '{{.State.OOMKilled}}' $NAME 2>/dev/null)
  docker logs $NAME > "work/bench/$tag.server.log" 2>&1
  renders=$(grep -E '^\s+[0-9]+\s+(200|[0-9]{3}|ERR)' "work/bench/$tag.log" | awk '{printf "%s:%s/%s ", $1, $2, ($2==200 ? $4 : "-")}')
  [ "$running" = "true" ] && exit_code="run"
  printf '%-6s %-7s %-7s %-6s | %-8s %-10s %-9s %-6s %s\n' "$CPUS" "$MEM" "$WORKERS" "$SHM" "${wall}s" "${peak:-?}MiB" "$exit_code" "$oom" "$renders"
  docker rm -f $NAME >/dev/null 2>&1
done
