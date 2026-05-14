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

| Wave | Status  | What landed                                                                       |
| ---- | ------- | --------------------------------------------------------------------------------- |
| 1    | this PR | schema + rails-only `SOURCES` list                                                |
| 2    | pending | `fetch.ts`, `sources.lock.json`, rack entry, migrate `.rails-source/.rack-source` |
| 3    | pending | globalid entry (git clone of `rails/globalid`)                                    |
| 4    | pending | `api-compare` reads from `resolvePath`; derive `PACKAGES`                         |
| 5    | pending | `test-compare` reads from `resolvePath`                                           |
| 6    | pending | globalid wired through both compares                                              |
| 7    | pending | doc + memory sweep; generate parity Gemfile from `SOURCES`                        |
