#!/usr/bin/env bash
# The slim harness's plain pass (RFC 0241, "Slim profile harness"), scaled to
# a CI runner. Writes $OUT/record.json plus the raw k6 summary and GC logs.
#
#   CHALLENGE_DIR=~/tdsc OUT=/tmp/perf bash bench/run.sh
#
# Needs: a built trails checkout, the challenge repo with seed/make-seed.sh
# run, k6, jq, curl, and sudo + systemd-run (falls back to taskset).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(dirname "$HERE")"
TRAILS="$(cd "$APP/../.." && pwd)"
CHALLENGE_DIR="${CHALLENGE_DIR:?set CHALLENGE_DIR to the challenge checkout}"
OUT="${OUT:-$(mktemp -d)}"
VUS="${VUS:-200}"
WARMUP="${WARMUP:-30s}"
DURATION="${DURATION:-2m}"
RAMP_UP="${RAMP_UP:-10s}"
PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:$PORT"
NCPU="$(nproc)"
K6_CPUS="1-$((NCPU - 1))"
mkdir -p "$OUT/run" "$OUT/prof"
UNIT=sut-$$
USE_SYSTEMD=0
if command -v systemd-run >/dev/null && sudo -n true 2>/dev/null; then USE_SYSTEMD=1; fi

start_server() {
  rm -f "$OUT/run/feed.db"*
  cp "$CHALLENGE_DIR/seed/feed.db" "$OUT/run/feed.db"
  local no="--import $HERE/prof-hooks.mjs"
  if [ "$USE_SYSTEMD" = 1 ]; then
    sudo systemd-run --unit "$UNIT" --uid "$(id -u)" -p AllowedCPUs=0 -p MemoryMax=2G \
      -E JWT_SECRET=twelve-dollar-challenge -E HOST=127.0.0.1 -E PORT="$PORT" \
      -E SQLITE_PATH="$OUT/run/feed.db" -E PROF_DIR="$OUT/prof" -E "NODE_OPTIONS=$no" \
      -E PATH="$PATH" bash -c "$APP/start.sh"
  else
    JWT_SECRET=twelve-dollar-challenge HOST=127.0.0.1 PORT="$PORT" \
      SQLITE_PATH="$OUT/run/feed.db" PROF_DIR="$OUT/prof" NODE_OPTIONS="$no" \
      taskset -c 0 bash "$APP/start.sh" >"$OUT/server.log" 2>&1 &
    SERVER_PID=$!
  fi
  for _ in $(seq 1 120); do
    curl -fs -o /dev/null "$BASE_URL/posts/1" && return 0
    sleep 0.5
  done
  echo "server did not come up" >&2
  return 1
}

stop_server() {
  if [ "$USE_SYSTEMD" = 1 ]; then
    sudo systemctl kill -s SIGINT "$UNIT" || true
    for _ in $(seq 1 40); do systemctl is-active --quiet "$UNIT" || break; sleep 0.25; done
    sudo journalctl -u "$UNIT" --no-pager >"$OUT/server.log" 2>&1 || true
    sudo systemctl reset-failed "$UNIT" 2>/dev/null || true
  else
    pkill -INT -P "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

cgroup_stat() {
  local dir="/sys/fs/cgroup/system.slice/$UNIT.service"
  [ "$USE_SYSTEMD" = 1 ] && [ -r "$dir/$1" ] && cat "$dir/$1" || echo ""
}

trap stop_server EXIT

# The challenge's checks first, on a fresh seed copy: a failure ends the run.
start_server
bash "$CHALLENGE_DIR/test/test.sh" "$BASE_URL" | tee "$OUT/test.log"
stop_server
rm -f "$OUT"/prof/gc-*.json

start_server
cd "$CHALLENGE_DIR/bench"
taskset -c "$K6_CPUS" k6 run -q -e BASE_URL="$BASE_URL" -e VUS="$VUS" \
  -e DURATION="$WARMUP" -e RAMP_UP="$RAMP_UP" load.js >"$OUT/k6-warmup.log" 2>&1
before="$(cgroup_stat cpu.stat | awk '$1=="usage_usec"{print $2}')"
start_ms="$(($(date +%s%N) / 1000000))"
taskset -c "$K6_CPUS" k6 run -q -e BASE_URL="$BASE_URL" -e VUS="$VUS" \
  -e DURATION="$DURATION" -e RAMP_UP="$RAMP_UP" \
  --summary-export "$OUT/k6-summary.json" load.js >"$OUT/k6.log" 2>&1
after="$(cgroup_stat cpu.stat | awk '$1=="usage_usec"{print $2}')"
wall_ms="$(($(date +%s%N) / 1000000 - start_ms))"
peak="$(cgroup_stat memory.peak)"
stop_server
trap - EXIT

node "$HERE/summarize.mjs" "$OUT" \
  "${before:-}" "${after:-}" "${peak:-}" "$wall_ms" "$VUS" \
  "$(git -C "$TRAILS" rev-parse HEAD)" "$(git -C "$CHALLENGE_DIR" rev-parse HEAD)" \
  >"$OUT/record.json"
cat "$OUT/record.json"
