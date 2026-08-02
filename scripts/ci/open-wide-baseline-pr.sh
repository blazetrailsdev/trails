#!/usr/bin/env bash
# RFC 0083. Called by the `Wide ratchet baseline reseed (main)` step in ci.yml
# once a reseed has been written into the working tree and shown to differ from
# the committed baseline.
#
# Failing the step is only half the fix: until somebody hand-reseeds, every
# branch cut from `main` inherits the wide-gate failure (#5869 paid for that
# diagnosis). So carry the reseed onto one fixed maintenance branch and
# open/refresh a single PR for it.
#
# The branch is force-pushed to exactly one commit on top of the drifting
# merge — it is a rolling snapshot, not a history. N consecutive drifting
# merges therefore collapse into one PR carrying the newest baseline, and two
# generated files never have to be merged against each other. The PR is opened
# ready rather than draft: it is mechanical, and a draft would sit unmergeable
# while `main` stays stale. The caller still exits non-zero afterwards, so the
# drift stays visible even if nobody looks at the PR.
#
# `pnpm install` earlier in the job has already run husky's `prepare`, so the
# commit below neutralises core.hooksPath: a full lint-staged/tsc pre-commit
# run over generated JSON would cost minutes and can only fail the publish.

set -euo pipefail

readonly BRANCH="maintenance/wide-ratchet-baseline"
readonly BASELINE_DIR="scripts/api-compare/call-mismatches-wide-exclude"
readonly UNREVIEWED="scripts/api-compare/call-mismatches-wide-unreviewed.json"

sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
shortSha="${sha:0:12}"

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "::warning title=Wide baseline maintenance PR skipped::No GitHub token available; the reseed for ${shortSha} was not published." >&2
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "$BRANCH" "$sha"
git add -- "$BASELINE_DIR" "$UNREVIEWED"
git -c core.hooksPath=/dev/null commit --message "chore(api-compare): reseed the wide ratchet baseline for ${shortSha}

The \`Wide ratchet baseline reseed (main)\` step found the committed wide
call-mismatch baseline out of sync with a clean reseed after ${sha}. This
commit is that reseed, produced by \`pnpm api:calls:wide:reseed\`."

# Push under the same token that will open the PR, not the checkout's
# persisted credentials, so a configured MAINTENANCE_PR_TOKEN also owns the
# push event and the branch's own workflow runs.
remote="origin"
if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
  remote="https://x-access-token:${GH_TOKEN:-$GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi
git push --force "$remote" "HEAD:refs/heads/${BRANCH}"

readonly TITLE="chore(api-compare): reseed the wide ratchet baseline (${shortSha})"
body=$(
  cat <<EOF
Automated maintenance PR from the \`Wide ratchet baseline reseed (main)\` step
(RFC 0083).

Merge commit \`${sha}\` left \`${BASELINE_DIR}/\` and \`${UNREVIEWED}\` out of
sync with a clean reseed, so every branch cut from \`main\` afterwards inherits
the wide call-mismatches ratchet failure. This PR carries the reseed.

Regenerated with \`pnpm api:calls:wide:reseed\`. The branch is rebuilt from
scratch on each drifting merge, so this PR always reflects the newest baseline
— review the diff as it stands rather than commit by commit.
EOF
)

# GitHub refuses to trigger workflows from events authored by GITHUB_TOKEN, so
# on the fallback token this PR opens with no checks at all and cannot satisfy
# required status checks. Say so in the body rather than leaving a maintainer
# to work out why the checks list is empty.
if [[ "${MAINTENANCE_PR_TOKEN_SET:-false}" != "true" ]]; then
  body="${body}

**CI will not start on its own here.** This PR was authored by
\`GITHUB_TOKEN\`, and GitHub does not trigger workflow runs from events that
token creates. Close and reopen the PR (or push any commit to the branch) to
start the checks. Setting a \`MAINTENANCE_PR_TOKEN\` secret — a PAT or GitHub
App token with contents+pull-requests write — removes this step."
fi

# A closed-but-unmerged PR still owns the branch and makes `gh pr create`
# refuse to open a second one, so reopen that instead of failing. A MERGED one
# is spent — the branch has since been rebuilt from a later merge — so it takes
# the create path like a fresh branch.
existing=$(
  gh pr list --head "$BRANCH" --state all --limit 1 \
    --json number,state --jq '.[0] // empty | select(.state != "MERGED") | "\(.number) \(.state)"'
)

if [[ -z "$existing" ]]; then
  url=$(gh pr create --base main --head "$BRANCH" --title "$TITLE" --body "$body")
  echo "::notice title=Wide baseline maintenance PR opened::${url}"
  exit 0
fi

read -r number state <<<"$existing"
if [[ "$state" == "CLOSED" ]]; then
  gh pr reopen "$number"
fi
gh pr edit "$number" --title "$TITLE" --body "$body"
echo "::notice title=Wide baseline maintenance PR updated::#${number} now carries the reseed for ${shortSha}."
