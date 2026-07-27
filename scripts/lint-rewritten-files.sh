#!/usr/bin/env bash
# Lint files whose working-tree content was produced by a rebase/merge auto-merge.
#
# Those files never pass through `lint-staged`: a rebase replays commits without
# running the pre-commit hook, so a defect that exists in neither parent branch
# (e.g. an import orphaned by two sibling deletions) first surfaces in CI.
#
# Reads "<old-sha> <new-sha>" commit pairs on stdin (the post-rewrite format) and
# lints the files each *replayed* commit touches. Reports only — never blocks,
# since a rebase is not a commit the user can amend in flight.
#
# Scope is `<new>^..<new>`, NOT `<old>..<new>`: the latter is a tree diff across
# the base move, so it also names every file the new upstream changed and the
# rewritten commit never touched (main edits `upstream.ts`, the feature edits
# only `feature.ts`, and `upstream.ts` shows up anyway). Those files are
# byte-identical to upstream, which CI already linted. A defect that exists in
# neither parent needs both sides to have touched the file, so it always appears
# in the replayed commit's own diff.
#
# Usage: lint-rewritten-files.sh [kind]   # kind: rebase | amend | merge
set -uo pipefail

# `git commit --amend` also fires post-rewrite, but its files were staged and so
# were already linted by pre-commit; re-linting them buys nothing.
[ "${1:-}" = "amend" ] && exit 0

ranges=$(cat)
[ -n "$ranges" ] || exit 0

# Read loop rather than `mapfile`: stock macOS ships Bash 3.2, which has no
# `mapfile`, and husky runs hooks on the contributor's own bash.
# Paths a later commit in the rewrite deleted, or renamed away, are not lintable.
existing=()
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] && existing+=("$f")
done < <(
  while read -r _old new _rest; do
    [ -n "${new:-}" ] || continue
    # `<sha>^!` is "this commit against its parent(s)" — empty for a root commit.
    git diff --name-only --diff-filter=ACMR "$new^!" 2>/dev/null
  done <<<"$ranges" |
    grep -E '\.(js|jsx|mjs|cjs|ts|tsx)$' |
    grep -v '__fixtures__' |
    sort -u
)
[ "${#existing[@]}" -gt 0 ] || exit 0

# A clone without `pnpm install` has no eslint; stay silent rather than cry wolf.
# Probe the installed binary directly instead of `pnpm exec eslint --version`:
# that would hand control to pnpm's dependency-status path, which can install
# into an uninstalled clone as a side effect of a hook that promised only to
# report. Invoking the binary also skips a pnpm spawn on every rewrite.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
eslint="$root/node_modules/.bin/eslint"
[ -x "$eslint" ] || exit 0

printf '\n\033[1mlinting %s file(s) rewritten by this %s...\033[0m\n' \
  "${#existing[@]}" "${1:-rewrite}"

if "$eslint" "${existing[@]}"; then
  printf '\033[32m✔ rewritten files lint clean\033[0m\n\n'
  exit 0
fi

printf '\n\033[41;97m ✖ LINT ERRORS IN FILES AUTO-MERGED BY THIS REBASE/MERGE \033[0m\n'
printf '\033[1;31mThese files were never seen by the pre-commit hook.\033[0m\n'
printf '\033[1;31mFix them and commit before pushing — CI will fail otherwise.\033[0m\n\n'
exit 0
