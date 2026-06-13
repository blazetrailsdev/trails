#!/usr/bin/env bash
# Driver for `pnpm api:compare`. Forwards any extra args ("$@") to the
# orchestrator, which passes them through to compare's main() so flags like
# `--package`, `--public-only`, `--privates-only`, `--files`, `--incomplete`,
# `--missing`, `--inheritance` reach the comparison step.
#
# orchestrate.ts runs the whole DAG (fetch → ruby∥ts extract → compare +
# manifests) in a SINGLE tsx process. The previous version spawned a fresh
# `pnpm tsx` per step (7 total, including a duplicate fetch for
# --print-lib-paths) and paid the ~1.7s cold start each time. See
# orchestrate.ts for the phase ordering and FORCE/REFRESH semantics.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pnpm tsx "$DIR/orchestrate.ts" "$@"
