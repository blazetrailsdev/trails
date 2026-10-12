#!/usr/bin/env bash
# What does Node actually load to reach a binding?
#
#   ./perry/module-graph.sh                     # the default comparison table
#   ./perry/module-graph.sh <entry.js> [name]   # one entry point
#
# Counts modules via a resolver hook and times `await import()` on a warm
# cache. Perry's own "Found N module(s)" is inflated by eager collection of
# lazy imports, so it is not a usable proxy for runtime cost — this is.
set -uo pipefail
cd "$(dirname "$0")/.."

ROOT=$(cd ../.. && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/resolve-hook.mjs" <<'EOF'
let port;
export function initialize(data) { port = data.port; }
export async function resolve(spec, ctx, next) {
  const r = await next(spec, ctx);
  try { port.postMessage(r.url); } catch {}
  return r;
}
EOF

cat > "$WORK/hook.mjs" <<'EOF'
import { register } from "node:module";
import { MessageChannel } from "node:worker_threads";
const { port1, port2 } = new MessageChannel();
const seen = new Set();
port1.on("message", (u) => seen.add(u));
port1.unref();
register("./resolve-hook.mjs", import.meta.url, { data: { port: port2 }, transferList: [port2] });
process.on("exit", () => {
  const app = [...seen].filter((u) => !u.startsWith("node:"));
  const by = {};
  for (const u of app) {
    const m = u.match(/\/packages\/([^/]+)\//);
    const k = m ? "@blazetrails/" + m[1]
      : (u.match(/node_modules\/(?:\.pnpm\/)?((?:@[^/]+[+/])?[^/]+)/) || [, "(entry)"])[1];
    by[k] = (by[k] || 0) + 1;
  }
  const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`);
  console.log(`MODULES ${app.length} | ${parts.join(" ")}`);
});
EOF

measure() { # <label> <entry> <binding>
  local label=$1 entry=$2 binding=${3:-}
  local imp
  if [ -n "$binding" ]; then imp="import {$binding} from '$entry'; void $binding;"
  else imp="await import('$entry');"; fi

  printf '%-52s ' "$label"
  printf '%s\n' "$imp" > "$WORK/probe.mjs"
  local mods
  mods=$(node --import "$WORK/hook.mjs" "$WORK/probe.mjs" 2>/dev/null | sed -n 's/^MODULES //p')

  printf '%s\n' "const s=process.hrtime.bigint(); await import('$entry'); console.log(Number(process.hrtime.bigint()-s)/1e6);" > "$WORK/t.mjs"
  local ms
  ms=$(for _ in 1 2 3 4 5; do node "$WORK/t.mjs" 2>/dev/null; done | sort -n | awk 'NR==3{printf "%.0f",$1}')

  printf '%6s ms  %s\n' "${ms:-?}" "${mods:-(failed)}"
}

if [ $# -ge 1 ]; then
  measure "$(basename "$1")" "$1" "${2:-}"
  exit
fi

A="$ROOT/packages/activesupport/dist"
R="$ROOT/packages/ruby-compat/dist"
measure "activesupport barrel  → camelize"     "$A/index.js"     camelize
measure "activesupport inflector.js → camelize" "$A/inflector.js" camelize
measure "ruby-compat barrel  → regexpEscape"   "$R/index.js"     regexpEscape
measure "ruby-compat regexp.js → regexpEscape" "$R/regexp.js"    regexpEscape
