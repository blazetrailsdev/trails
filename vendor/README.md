# vendor/

Upstream Ruby source mirrors used by `api-compare`, `test-compare`, and
schema-parity tooling.

- `sources.ts` — declarative registry. Single source of truth for which
  gems we mirror and at what version. See
  [`docs/ruby-source-fetcher-plan.md`](../docs/ruby-source-fetcher-plan.md)
  for the full design.
- Per-source subdirs (`rails/`, `rack/`, `globalid/`, …) are gitignored
  shallow clones of the upstream repo at the pinned tag. They land here
  via the unified fetcher (wave 2).
- `sources.lock.json` (committed, wave 2) records resolved git SHAs for
  reproducibility.

## Status

| Wave | Status  | What landed                                                                        |
| ---- | ------- | ---------------------------------------------------------------------------------- |
| 1    | merged  | schema + rails-only `SOURCES` list (#1559)                                         |
| 2a   | merged  | `fetch.ts` + lockfile + rack entry + parallel fetch (#1561)                        |
| 2b   | merged  | consumers cut over; old `.rails-source/.rack-source` retired (#1563)               |
| 3    | this PR | globalid entry (git clone of `rails/globalid`); `scripts/globalid-source/` deleted |
| 4    | pending | `api-compare` derives `PACKAGES` from `SOURCES`; rack/globalid api-compare wiring  |
| 5    | pending | `test-compare` reads from `resolvePath`                                            |
| 6    | pending | globalid quoted test count + final wiring confirmation                             |
| 7    | pending | doc + memory sweep; generate parity Gemfile from `SOURCES`                         |
