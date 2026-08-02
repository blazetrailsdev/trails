#!/usr/bin/env bash
# RFC 0083. Called by the `Wide ratchet baseline reseed (main)` step in ci.yml
# once a reseed has already been written into the working tree and shown to
# differ from the committed baseline.
#
# Failing the step is only half the fix: until somebody hand-reseeds, every
# branch cut from `main` inherits the wide-gate failure (#5869 paid for that
# diagnosis). So carry the reseed onto a single, fixed maintenance branch and
# open/refresh one PR for it. The branch is force-pushed to exactly one commit
# on top of the drifting merge, so N consecutive drifting merges collapse into
# one PR that always reflects the newest baseline rather than N stale ones.
#
# The caller still exits non-zero afterwards — the PR is the remedy, the red
# run is the signal, and losing the signal to a PR nobody opens is the failure
# mode this whole step exists to avoid.

set -euo pipefail

readonly BRANCH="maintenance/wide-ratchet-baseline"
readonly BASELINE_DIR="scripts/api-compare/call-mismatches-wide-exclude"
readonly UNREVIEWED="scripts/api-compare/call-mismatches-wide-unreviewed.json"

sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
shortSha="${sha:0:12}"

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "::warning title=Wide baseline maintenance PR skipped::No GitHub token available; reseed was not published." >&2
  exit 0
fi

# The runner's checkout is detached at the merge SHA; commit the reseed on a
# throwaway local ref so nothing depends on the checkout's branch state.
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "$BRANCH" "$sha"
git add -- "$BASELINE_DIR" "$UNREVIEWED"
git commit --message "chore(api-compare): reseed the wide ratchet baseline for ${shortSha}

The \`Wide ratchet baseline reseed (main)\` step found the committed wide
call-mismatch baseline out of sync with a clean reseed after ${sha}. This
commit is that reseed, produced by \`pnpm api:calls:wide:reseed\`."

# Force — the branch is a rolling snapshot, not a history. If a previous
# drifting merge left a commit here, its baseline is already superseded by
# this one, and a merge/rebase would only manufacture conflicts between two
# generated files.
git push --force origin "$BRANCH"

readonly TITLE="chore(api-compare): reseed the wide ratchet baseline (${shortSha})"
body=$(
  cat <<EOF
Automated maintenance PR from the \`Wide ratchet baseline reseed (main)\` step
(RFC 0083).

Merge commit \`${sha}\` left \`${BASELINE_DIR}/\` and \`${UNREVIEWED}\` out of
sync with a clean reseed, so every branch cut from \`main\` afterwards inherits
the wide call-mismatches ratchet failure. This PR carries the reseed.

Regenerated locally with \`pnpm api:calls:wide:reseed\`. The branch is rebuilt
from scratch on each drifting merge, so this PR always reflects the newest
baseline — review the diff as it stands rather than commit by commit.
EOF
)

existing=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [[ -n "$existing" ]]; then
  gh pr edit "$existing" --title "$TITLE" --body "$body"
  echo "::notice title=Wide baseline maintenance PR updated::#${existing} now carries the reseed for ${shortSha}."
else
  # Deliberately not a draft: this is mechanical, ready to merge, and a draft
  # would sit unreviewable while `main` stays stale.
  url=$(gh pr create --base main --head "$BRANCH" --title "$TITLE" --body "$body")
  echo "::notice title=Wide baseline maintenance PR opened::${url}"
fi
