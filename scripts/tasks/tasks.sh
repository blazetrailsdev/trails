#!/usr/bin/env bash
# tasks.sh — trails' `pnpm tasks` shim.
#
# The CLI itself lives in the tasks repo (src/cli.ts, entered through
# bin/tasks); this script only finds a tasks checkout and hands off. It does
# NOT set $TASKS_DIR — which working tree the CLI acts on is resolved by
# resolveTasksDir() in the CLI from the caller's cwd, and setting the env var
# here would suppress the per-worktree branch that pushes `HEAD:main`.
set -euo pipefail

has_bin() { [[ -n "${1:-}" && -x "$1/bin/tasks" ]]; }

DIR=""
for candidate in "${TASKS_DIR:-}" "${RFCS_DIR:-}" "$PWD/tasks" "$HOME/github/blazetrailsdev/tasks"; do
  if has_bin "$candidate"; then DIR="$candidate"; break; fi
done

if [[ -z "$DIR" ]]; then
  echo "tasks: no tasks checkout with bin/tasks found." >&2
  echo "       Re-run scripts/start-worktree.sh, set \$TASKS_DIR, or clone" >&2
  echo "       blazetrailsdev/tasks to ~/github/blazetrailsdev/tasks." >&2
  exit 1
fi

exec "$DIR/bin/tasks" "$@"
