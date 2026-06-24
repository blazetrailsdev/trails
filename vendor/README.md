# vendor/

Upstream Ruby source mirrors used by `api-compare`, `test-compare`, and
schema-parity tooling.

- `sources.ts` — declarative registry. Single source of truth for which
  gems we mirror and at what version.
- Per-source subdirs (`rails/`, `rack/`, `globalid/`, …) are gitignored
  shallow clones of the upstream repo at the pinned tag. They land here
  via the unified fetcher (wave 2).
- `sources.lock.json` (committed, wave 2) records resolved git SHAs for
  reproducibility.

## Scoping a Rails bump (drift report)

We pin `rails` to one tag in `sources.ts` (today `v8.0.2`) while upstream moves
on. Before bumping that pin, run the cross-version API drift report to scope the
work:

```sh
pnpm api:compare          # builds output/rails-api.json (base) + output/ts-api.json (ported)
pnpm api:drift --ref v8.1.3
```

`api:drift` fetches the target ref reproducibly into `output/drift-src-<ref>/`
(its own lock entry in `output/drift.lock.json`, plus the resolved
`targetSha` in the report — the canonical pin in `sources.ts` stays the single
active source), extracts its Ruby API to `output/rails-api@<ref>.json`, diffs it
against the pinned surface, and writes `output/version-drift.json`: classes
added/removed, per-method signature changes, visibility flips, and call-set
(body) deltas. Signature deltas include changes to non-primitive default values
(e.g. `{}` → `{ a: 1 }`), not just primitive literals.

**Package granularity:** the class/method diff only covers packages both
manifests carry. Both extractions run over the same `sources.ts` rails package
set, so a one-sided package is an extraction asymmetry (the base manifest also
holds non-rails gems like rack/globalid), not real drift — it's skipped at that
level. To catch whole-gem add/remove without manual `Gemfile` eyeballing, the
report also carries `addedPackages`/`removedPackages`: the delta of the rails
monorepo subgem list (each ref's `*/*.gemspec` plus the root `rails.gemspec`)
between the base pin and the target ref. Gems outside the monorepo (rack,
globalid) never appear in either list, so they're not reported as removed.
Auto-adding a discovered gem to `sources.ts` stays a manual decision.

Each entry carries a `ported` flag (from `output/ts-api.json`) so drift in
surface **we ported** is separable from churn we never touched.
`summary.portedAffected` counts the items landing on our ported surface, each at
its own granularity: an added/removed class we have; an added/removed method on
a class we have (the method is new/gone upstream, so class membership is the
test); and a changed method we have (matched by name). A changed method we never
ported doesn't count — that drift isn't ours to act on. The diff core lives in
`scripts/api-compare/version-diff.ts` (pure, unit-tested).

Bumping the pin itself (editing `sources.ts` to the new tag) is a separate
decision, not something the report does.

## Status

| Wave | Status  | What landed                                                                                 |
| ---- | ------- | ------------------------------------------------------------------------------------------- |
| 1    | merged  | schema + rails-only `SOURCES` list (#1559)                                                  |
| 2a   | merged  | `fetch.ts` + lockfile + rack entry + parallel fetch (#1561)                                 |
| 2b   | merged  | consumers cut over; old `.rails-source/.rack-source` retired (#1563)                        |
| 3    | merged  | globalid entry (git clone of `rails/globalid`); `scripts/globalid-source/` deleted (#1578)  |
| 4    | merged  | `api-compare` derives `PACKAGES` from `SOURCES` (#1579)                                     |
| 5    | merged  | `test-compare` reads from `vendor/sources.ts` via `--print-test-paths` (#1586)              |
| 6    | merged  | rack + globalid + abstractcontroller wired into api-compare via `--print-lib-paths` (#1589) |
| 7    | this PR | parity-schema Gemfile generated from `vendor/sources.ts`; plan complete                     |
