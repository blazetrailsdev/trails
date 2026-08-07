# Draft-deferral net saving, re-measured after the review-trigger move

PR #5749 defers `postgres-tests` / `maria-tests` on draft PRs. Its value depends
entirely on how much iteration happens before the draft → ready flip, and the
original break-even was measured under the **old** regime, where the review
fired _on_ `draft -> ready`. Story
`re-measure-draft-burn-after-review-trigger-move` (RFC 0028) called for a
re-measurement once the review trigger moved pre-ready.

## Is the trigger actually pre-ready now?

Yes, unambiguously. Of the 64 PRs in the window that flipped ready and have a
webhook review file under
`~/.btwhooks/data/github/blazetrailsdev/trails/$PR/*-review.md`, **64/64** had
their first review land _before_ the ready flip, at a median of **2.2 min
before** it. Under the old regime the review was, by construction, after.

## Window and method

Method is the one the original analysis used, so the numbers are comparable:

- Runs: `gh run list --workflow ci.yml --event pull_request --limit 400`
- Per-job timing: `gh api repos/blazetrailsdev/trails/actions/runs/$ID/jobs`
- Ready timestamps: the issues timeline API (`event == "ready_for_review"`)
- Review timestamps: `*-review.md` mtimes under the btwhooks data dir

Window: **400 `pull_request` runs / 67 branches, 2026-08-05T10:05Z –
2026-08-07T17:47Z (55.7 h)**. 64 of the 67 PRs flipped ready inside the window.
Job timings are from the 60 most recent runs (44 resolved with usable job
records).

## Results

| Metric                              | Baseline (2026-07-30/31) | Now (2026-08-05/07) |
| ----------------------------------- | ------------------------ | ------------------- |
| Median PR open → `ready_for_review` | 3.0 min                  | **13.8 min**        |
| Mean open → ready                   | —                        | 17.1 min            |
| Pre-ready runs / PR (mean)          | 1.43                     | **4.31**            |
| Pre-ready runs / PR (median)        | —                        | 4.00                |
| Post-ready runs / PR (mean)         | —                        | 1.83                |
| PG+MariaDB job-minutes per run      | 19.8                     | **31.2**            |
| Non-PG/MariaDB job-minutes/run      | 17.6                     | **27.0**            |
| Break-even draft runs / PR          | 0.89                     | **0.87**            |

Pre-ready run counts are no longer a long tail at 1 — they cluster at 4–5:

```text
0 runs:  3 PRs      4 runs: 24 PRs
1 run :  1 PR       5 runs: 20 PRs
2 runs:  1 PR       6 runs:  5 PRs
3 runs:  6 PRs      7 runs:  3 PRs
                    8 runs:  1 PR
```

30 of the 44 sampled runs recorded **zero** PG/MariaDB job-minutes, which is the
deferral doing its job.

## Net saving

Per PR, using the measured medians:

- **Saved:** 31.2 job-min/run × 4.31 draft runs = **134.5 job-minutes**
- **Cost:** the redundant non-PG/MariaDB half of the extra full-workflow run
  that `ready_for_review` triggers = **27.0 job-minutes**
- **Net: ≈ 107 job-minutes saved per PR**

Break-even is essentially unchanged at **0.87 draft runs/PR** (both sides of the
ratio grew: runners got slower, or suites got bigger, in roughly equal
proportion). Observed draft-phase runs went from 1.43 to **4.31** — a **4.9×**
margin over break-even, against **1.6×** at baseline.

The softening factor from the original analysis (a push following the ready flip
within a median 1.7 min, cancelling most of the redundant run) still applies and
only widens the margin further; it is not needed to reach the conclusion.

## Recommendation

**Keep the deferral as shipped.** The premise it was justified on has not gone
stale — it has strengthened by ~3× on the only term that was thin. The
review-trigger move is what did it: agents now iterate against review feedback
while still in draft, which is exactly the phase the deferral is paid for.

No re-scope is warranted. The next natural review point is if the review trigger
moves again, or if `ready_for_review` stops firing a full workflow run.
