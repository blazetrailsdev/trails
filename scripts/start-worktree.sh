#!/usr/bin/env bash
# start-worktree.sh — spin up a fresh trails worktree ready to develop in.
#
# Usage: scripts/start-worktree.sh <name>
#
#   1. Fast-forwards the main worktree's `main` branch.
#   2. Creates ~/github/blazetrailsdev/worktrees/<name> on a new branch <name>
#      branched off origin/main.
#   3. Runs `pnpm install` inside the new worktree.
#   4. Symlinks the fetched Rails and Rack source directories from the main
#      worktree so api:compare / test:compare don't have to refetch.
set -euo pipefail

if [[ $# -ne 1 || -z "${1:-}" ]]; then
  echo "Usage: $0 <name>" >&2
  exit 2
fi

NAME="$1"
case "$NAME" in
  */*|*..*|"") echo "Invalid worktree name: $NAME" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_REPO="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"
WORKTREES_ROOT="$HOME/github/blazetrailsdev/worktrees"
TARGET="$WORKTREES_ROOT/$NAME"

if [[ -e "$TARGET" ]]; then
  echo "Target already exists: $TARGET" >&2
  exit 1
fi

echo "==> Fetching origin/main at $MAIN_REPO"
# Serialize fetch across concurrent start-worktree.sh invocations — git's ref
# locks fail loudly when two `git fetch` runs race the same ref. The flock
# also covers the worktree add below so two spawns don't compete on the
# packed-refs file.
exec 9>"$MAIN_REPO/.git/start-worktree.lock"
# 60s timeout so a crashed prior run doesn't hang future spawns forever.
# Stale lock file is harmless (flock holds an OS-level advisory lock that
# releases on process exit); the file just sits there until next run.
if ! flock -w 60 9; then
  echo "Could not acquire $MAIN_REPO/.git/start-worktree.lock within 60s." >&2
  echo "Another start-worktree run may be stuck. Investigate, then retry." >&2
  exit 1
fi
git -C "$MAIN_REPO" fetch origin --prune

# We branch off origin/main, NOT local main. The main worktree's local
# branch can lag freely; users can `git pull` when they want. Skipping the
# ff-merge avoids two failure modes that have bitten us:
#   1. Dirty working tree — even unrelated uncommitted changes block ff.
#   2. Untracked files that match what just landed in upstream (e.g. a doc
#      that another spawn or a freshly-merged PR added) — git refuses ff
#      because the merge would "overwrite" the untracked file.

mkdir -p "$WORKTREES_ROOT"

echo "==> Creating worktree at $TARGET on new branch '$NAME' from origin/main"
git -C "$MAIN_REPO" worktree add -b "$NAME" "$TARGET" origin/main
flock -u 9
exec 9>&-

link_source() {
  local rel="$1"
  local src="$MAIN_REPO/$rel"
  local dst="$TARGET/$rel"
  if [[ ! -e "$src" ]]; then
    echo "    skip $rel (not present in main worktree)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  ln -s "$src" "$dst"
  echo "    linked $rel -> $src"
}

echo "==> Linking Rails and Rack source from main worktree"
link_source "scripts/api-compare/.rails-source"
link_source "scripts/api-compare/.rack-source"

echo "==> Linking .claude config from main worktree (skills + per-machine permissions)"
link_source ".claude/skills"
link_source ".claude/settings.local.json"

echo "==> Running pnpm install"
( cd "$TARGET" && pnpm install )

echo
echo "Done. New worktree:"
echo "  $TARGET"
echo "  branch: $NAME (tracking nothing yet — push with: git push -u origin $NAME)"
