#!/usr/bin/env bash
# Runs each ladder rung under Node (tsx) and under Perry (compile + execute),
# and prints one row per rung. The ladder climbs from a bare `console.log` to a
# full trails boot, so the first Perry failure names the layer that blocks a
# native build.
#
#   PERRY=/path/to/perry ./perry/run-ladder.sh
#
# Requires clang for Perry codegen; see perry/README.md.
#
# Perry is capped at MEM and TIMEOUT per rung, and both caps are load-bearing
# rather than tidiness: compiling a rung that imports a @blazetrails package
# drove Perry past 27GB RSS and exhausted this machine's swap. Uncapped, a run
# takes the box down instead of reporting a result. A rung that trips a cap is
# reported as MEM or TIMEOUT, which is a finding, not an error in the harness.
set -uo pipefail
cd "$(dirname "$0")/.."

PERRY="${PERRY:-perry}"
OUT="${OUT:-tmp/perry}"
MEM="${MEM:-8G}"
TIMEOUT="${TIMEOUT:-600}"
mkdir -p "$OUT"
: > "$OUT/ladder.log"

# Run Perry inside a transient scope so MemoryMax applies to the whole process
# tree; without systemd, fall back to uncapped and say so.
# `timeout` goes INSIDE the scope: it is a real binary systemd-run can exec,
# whereas a shell function is not something `timeout` could have called.
if systemd-run --user --scope -q -p MemoryMax=1M -- /bin/true >/dev/null 2>&1; then
  CAP=(systemd-run --user --scope -q -p MemoryMax="$MEM" -p MemorySwapMax=0 --)
else
  echo "warning: systemd-run unavailable — Perry runs uncapped and may exhaust memory" >&2
  CAP=()
fi

printf '%-22s %-8s %-8s %s\n' RUNG NODE PERRY NOTE
printf '%-22s %-8s %-8s %s\n' ---- ---- ----- ----

for f in perry/ladder/*.ts; do
  rung=$(basename "$f" .ts)
  bin="$OUT/$rung"
  run_out=""

  if node_out=$(timeout "$TIMEOUT" ./node_modules/.bin/tsx "$f" 2>&1); then
    node_res=ok
  else
    node_res=FAIL
  fi

  start=$SECONDS
  perry_out=$("${CAP[@]}" timeout "$TIMEOUT" "$PERRY" compile "$f" -o "$bin" 2>&1)
  rc=$?
  elapsed=$(( SECONDS - start ))

  if [[ $rc -eq 0 ]]; then
    if run_out=$(timeout "$TIMEOUT" "$bin" 2>&1); then
      perry_res=ok
      note="${elapsed}s, $(du -h "$bin" | cut -f1) — $run_out"
    else
      perry_res=RUNTIME
      note=$(grep -iEm1 'error|panic|abort|unsupported' <<<"$run_out" || head -1 <<<"$run_out")
    fi
  elif [[ $rc -eq 124 ]]; then
    perry_res=TIMEOUT
    note="no result in ${TIMEOUT}s"
  elif [[ $rc -eq 137 ]] || grep -qiE 'out of memory|oom|killed|Cannot allocate' <<<"$perry_out"; then
    perry_res=MEM
    note="killed at MemoryMax=$MEM after ${elapsed}s"
  else
    perry_res=COMPILE
    note=$(grep -iEm1 'unsupported|not supported|unimplemented|error' <<<"$perry_out" || tail -1 <<<"$perry_out")
  fi

  printf '%-22s %-8s %-8s %s\n' "$rung" "$node_res" "$perry_res" "${note:0:110}"
  printf '%s\n' "=== $rung: node=$node_res perry=$perry_res (${elapsed}s) ===" \
    "--- node ---" "$node_out" "--- perry ---" "$perry_out" "$run_out" >> "$OUT/ladder.log"
done
