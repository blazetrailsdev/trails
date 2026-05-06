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
# When this script is invoked from a child worktree (its scripts/ dir may be
# symlinked from main), `git rev-parse --show-toplevel` returns the *child*
# worktree, where `.git` is a file (not a dir), so any path under .git
# errors with "Not a directory". Use --git-common-dir to find the shared
# gitdir (the main worktree's .git) and walk up one to get the main repo.
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"
GIT_COMMON_DIR="$(cd "$WORKTREE_ROOT" && git rev-parse --git-common-dir)"
# git-common-dir is relative when invoked from the main worktree, absolute
# (under .git/worktrees/<name>) when from a child. Normalise either way.
case "$GIT_COMMON_DIR" in
  /*) MAIN_GIT_DIR="$GIT_COMMON_DIR" ;;
  *)  MAIN_GIT_DIR="$WORKTREE_ROOT/$GIT_COMMON_DIR" ;;
esac
MAIN_REPO="$(cd "$MAIN_GIT_DIR/.." && pwd)"
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
exec 9>"$MAIN_GIT_DIR/start-worktree.lock"
# 60s timeout so a crashed prior run doesn't hang future spawns forever.
# Stale lock file is harmless (flock holds an OS-level advisory lock that
# releases on process exit); the file just sits there until next run.
if ! flock -w 60 9; then
  echo "Could not acquire $MAIN_GIT_DIR/start-worktree.lock within 60s." >&2
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

# If anything below this point fails (e.g. a required link_source missing,
# pnpm install dying), tear down the half-created worktree so the operator
# can re-run the script after fixing the underlying issue. Cleared on the
# successful exit at the bottom of the file.
WORKTREE_CREATED=1
cleanup_partial_worktree() {
  if [[ "${WORKTREE_CREATED:-0}" != 1 ]]; then return; fi
  echo "==> Removing partial worktree $TARGET" >&2
  if ! git -C "$MAIN_REPO" worktree remove --force "$TARGET" 2>/dev/null; then
    # `git worktree remove` can fail if the worktree got into an inconsistent
    # state (eg. worktree dir was deleted out of band, lock files left over).
    # Fall back to manually removing the directory and pruning so the next
    # invocation of this script doesn't hit "Target already exists".
    echo "    git worktree remove failed; falling back to rm -rf + git worktree prune" >&2
    rm -rf "$TARGET"
    git -C "$MAIN_REPO" worktree prune 2>/dev/null || true
  fi
  if ! git -C "$MAIN_REPO" branch -D "$NAME" 2>/dev/null; then
    # Branch may not exist (worktree add failed before branch creation) or be
    # already gone — log and continue rather than masking the EXIT status.
    echo "    note: branch $NAME was not deletable (already gone or never created)" >&2
  fi
}
trap cleanup_partial_worktree EXIT

link_source() {
  # Symlink a path from the main worktree into the new worktree.
  # `required` (default) — exit 1 with a recovery hint if the source is missing.
  # `optional`            — log a skip and continue.
  #
  # Required because PR #1260 demonstrated this class of silent failure:
  # `.claude/skills` was untracked from git but no longer present in main,
  # so new worktrees got a "skip" log line and agents launched without
  # prompt-agent / link / copilot-review skills. Failing fast forces the
  # operator to restore the source before spawning agents that depend on it.
  local rel="$1"
  local mode="${2:-required}"
  local src="$MAIN_REPO/$rel"
  local dst="$TARGET/$rel"
  if [[ ! -e "$src" ]]; then
    if [[ "$mode" == "optional" ]]; then
      echo "    skip $rel (not present in main worktree, optional)"
      return
    fi
    echo "    ERROR: required source $rel is missing from main worktree at $src" >&2
    echo "    The new worktree cannot be set up without it." >&2
    # Look for a sibling worktree that still has this path so we can suggest
    # a precise recovery command rather than a placeholder.
    local donor=""
    for candidate in "$WORKTREES_ROOT"/*/"$rel"; do
      if [[ -e "$candidate" ]]; then
        donor="$candidate"
        break
      fi
    done
    echo "    Recovery:" >&2
    if [[ -n "$donor" ]]; then
      # Prepend `rm -rf` so the recovery works whether $src is missing OR a
      # broken self-referential symlink. `[[ ! -e ]]` is true for broken
      # symlinks (the link exists but the target doesn't), and `cp` would
      # otherwise fail to overwrite the dangling link with a directory.
      echo "      rm -rf $(printf %q "$src") && cp -r $(printf %q "$donor") $(printf %q "$src")" >&2
    else
      echo "      No sibling worktree has $rel either. Re-run the appropriate fetch" >&2
      echo "      script (e.g. scripts/api-compare/fetch-rails.sh for .rails-source)" >&2
      echo "      or copy from a backup." >&2
    fi
    exit 1
  fi
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  ln -s "$src" "$dst"
  echo "    linked $rel -> $src"
}

echo "==> Linking Rails and Rack source from main worktree"
link_source "scripts/api-compare/.rails-source"
link_source "scripts/api-compare/.rack-source" optional

echo "==> Linking .claude config from main worktree (skills + per-machine permissions)"
link_source ".claude/skills"
link_source ".claude/settings.local.json" optional

echo "==> Running pnpm install"
( cd "$TARGET" && pnpm install )

WORKTREE_CREATED=0  # success — disable EXIT-trap cleanup

echo
echo "Done. New worktree:"
echo "  $TARGET"
echo "  branch: $NAME (tracking nothing yet — push with: git push -u origin $NAME)"
