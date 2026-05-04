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

echo "==> Updating main repo at $MAIN_REPO"
git -C "$MAIN_REPO" fetch origin --prune
CURRENT_BRANCH="$(git -C "$MAIN_REPO" symbolic-ref --short HEAD 2>/dev/null || echo "")"
if [[ "$CURRENT_BRANCH" == "main" ]]; then
  git -C "$MAIN_REPO" pull --ff-only origin main
else
  echo "    (main worktree is on '$CURRENT_BRANCH'; fetched only — skipping pull)"
fi

mkdir -p "$WORKTREES_ROOT"

echo "==> Creating worktree at $TARGET on new branch '$NAME' from origin/main"
git -C "$MAIN_REPO" worktree add -b "$NAME" "$TARGET" origin/main

link_source() {
  local rel="$1"
  local src="$MAIN_REPO/$rel"
  local dst="$TARGET/$rel"
  if [[ ! -d "$src" ]]; then
    echo "    skip $rel (not fetched in main worktree — run pnpm api:compare there first)"
    return
  fi
  rm -rf "$dst"
  ln -s "$src" "$dst"
  echo "    linked $rel -> $src"
}

echo "==> Linking Rails and Rack source from main worktree"
link_source "scripts/api-compare/.rails-source"
link_source "scripts/api-compare/.rack-source"

echo "==> Running pnpm install"
( cd "$TARGET" && pnpm install )

echo
echo "Done. New worktree:"
echo "  $TARGET"
echo "  branch: $NAME (tracking nothing yet — push with: git push -u origin $NAME)"
