#!/usr/bin/env bash
# CPU·메모리를 제한한 컨테이너에서 같은 슬라이드 세트를 렌더해 파드 크기의 근거를 만든다.
# 사용: bash scripts/docker-bench.sh "<cpus> <memory> <workers> <shm>" ...
#   예: bash scripts/docker-bench.sh "1 1g 1 256m" "2 2g 2 512m" "4 4g 4 1g"
# env: IMAGE(기본 slide-video-renderer) DECK(기본 fixtures/deck/sample) SLIDES(기본 1,6)
# Redis 는 docker compose 의 것을 쓴다 (없으면 띄운다). 워커 컨테이너를 redis 컨테이너의 네트워크에 붙여 센티널이 알려주는 127.0.0.1 주소가 그대로 통하게 한다.
# 조건마다: 컨테이너 기동 → deck:render(큐에 전부 투입, 워커 1개라 순차) → 벽시계 시간, 결과의 renderMs, 메모리 피크, OOM/종료코드 → work/bench/<조건>.log
set -u
IMAGE=${IMAGE:-slide-video-renderer}
DECK=${DECK:-fixtures/deck/sample}
SLIDES=${SLIDES:-1,6}
NAME=svr-bench
cd "$(dirname "$0")/.."
mkdir -p work/bench
docker compose up -d >/dev/null 2>&1
REDIS_CTN=$(docker compose ps -q redis)
[ -n "$REDIS_CTN" ] || { echo "redis container not running (docker compose up -d)"; exit 1; }
health() { docker exec $NAME node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; }
echo "image=$IMAGE deck=$DECK slides=$SLIDES"
printf '%-6s %-7s %-7s %-6s | %-8s %-10s %-12s %-6s %-6s %s\n' cpus memory workers shm wall peakMem cpu%avg/max exit oom renders
for cond in "$@"; do
  read -r CPUS MEM WORKERS SHM <<< "$cond"
  tag="s${SLIDES//,/_}-c${CPUS}-m${MEM}-w${WORKERS}-shm${SHM}"
  docker rm -f $NAME >/dev/null 2>&1
  docker run -d --name $NAME --cpus "$CPUS" --memory "$MEM" --memory-swap "$MEM" --shm-size "$SHM" \
    -e NODE_ENV=production -e LOG_LEVEL=info -e RENDER_WORKERS="$WORKERS" -e REDIS_SENTINELS=127.0.0.1:26379 \
    --network "container:$REDIS_CTN" -v "$PWD/fixtures:$PWD/fixtures" "$IMAGE" >/dev/null || { echo "$tag: docker run failed"; continue; }
  for i in $(seq 1 60); do health && break; sleep 1; done
  if ! health; then
    echo "$tag: worker did not start"; docker logs $NAME 2>&1 | tail -5; docker rm -f $NAME >/dev/null; continue
  fi
  # 메모리 샘플러 (1초 간격, MiB 로 환산)
  : > "work/bench/$tag.mem"
  ( while docker ps -q -f name=$NAME | grep -q .; do
      docker stats --no-stream --format '{{.MemUsage}} {{.CPUPerc}}' $NAME 2>/dev/null | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); v=v*1024} else if (v ~ /MiB/) {sub(/MiB/,"",v)} else if (v ~ /KiB/) {sub(/KiB/,"",v); v=v/1024} c=$4; sub(/%/,"",c); print int(v), c+0}'
      sleep 1
    done ) >> "work/bench/$tag.mem" &
  SAMPLER=$!
  start=$(date +%s)
  node scripts/deck-render.mjs "$DECK" "$SLIDES" > "work/bench/$tag.log" 2>&1
  wall=$(( $(date +%s) - start ))
  kill $SAMPLER 2>/dev/null; wait $SAMPLER 2>/dev/null
  # cgroup v2 의 memory.peak 가 정확한 최고치 (샘플링은 짧은 피크를 놓친다). 없으면 샘플 최대값
  peak=$(docker exec $NAME sh -c 'cat /sys/fs/cgroup/memory.peak 2>/dev/null' 2>/dev/null | awk '{print int($1/1048576)}')
  [ -n "$peak" ] || peak=$(awk '{print $1}' "work/bench/$tag.mem" | sort -n | tail -1)
  # CPU 사용률: 100% = 코어 1개를 꽉 쓴 것. 할당 코어수로 나누면 포화도
  cpu=$(awk '{s+=$2; n++; if($2>m) m=$2} END{if(n) printf "%d/%d", s/n, m; else printf "?"}' "work/bench/$tag.mem")
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' $NAME 2>/dev/null)
  running=$(docker inspect -f '{{.State.Running}}' $NAME 2>/dev/null)
  oom=$(docker inspect -f '{{.State.OOMKilled}}' $NAME 2>/dev/null)
  docker logs $NAME > "work/bench/$tag.server.log" 2>&1
  renders=$(grep -E '^\s+[0-9]+\s+(ok|error)' "work/bench/$tag.log" | awk '{printf "%s:%s/%s ", $1, $2, ($2=="ok" ? $3 : "-")}')
  [ "$running" = "true" ] && exit_code="run"
  printf '%-6s %-7s %-7s %-6s | %-8s %-10s %-12s %-6s %-6s %s\n' "$CPUS" "$MEM" "$WORKERS" "$SHM" "${wall}s" "${peak:-?}MiB" "${cpu:-?}" "$exit_code" "$oom" "$renders"
  docker rm -f $NAME >/dev/null 2>&1
done
