#!/usr/bin/env bash
# Driver for `pnpm parity:test`. Forwards any extra args ("$@") to the
# orchestrator, which passes them through to test-compare's main() so flags
# like `--package`, `--missing`, `--json`, `--incomplete` reach the comparison
# step. `--cached` is consumed by the orchestrator (skip extraction when both
# manifests exist).
#
# orchestrate.ts runs the whole DAG (fetch → ruby∥ts extract → compare) in a
# SINGLE tsx process. The previous version spawned a fresh process per step
# (4 total, including a duplicate fetch for --print-test-paths) and paid the
# ~1.7s cold start each time. See orchestrate.ts for the phase ordering and
# TEST_COMPARE_FORCE semantics.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pnpm tsx "$DIR/orchestrate.ts" "$@"
