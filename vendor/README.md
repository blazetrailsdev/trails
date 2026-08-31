# vendor/

Upstream Ruby source mirrors used by `api-compare`, `test-compare`, and
schema-parity tooling.

- `sources.ts` — declarative registry. Single source of truth for which
  gems we mirror and at what version.
- Per-source subdirs (`rails/`, `rack/`, `rack-session/`, `globalid/`, …) are
  gitignored
  shallow clones of the upstream repo at the pinned tag. They land here
  via the unified fetcher (wave 2).
- `sources.lock.json` (committed, wave 2) records resolved git SHAs for
  reproducibility.

## `vendor/ruby/` — the MRI read-anchor

`vendor/ruby/` is a clone of `ruby/ruby` pinned to **`v3_3_11`**
(`1f2d15125a2dc701e1822ed2900eb17899500ec7`). It exists so the MRI C symbols
that the ruby-compat ports cite are readable in-tree — `rational.c`
(`nurat_s_canonicalize_internal`, `nurat_add`, `float_to_r`), `range.c`
(`range_include_internal`, `str_upto_each`), `re.c` (`rb_reg_s_quote`),
`object.c` (`rb_equal`).

### Why not a newer ref

The pin is deliberately not the newest release. An anchor is only useful if it
is the build the citations were authored against, and the four cited files
churn across minors:

| vs the pin                         | `rational.c` `range.c` `re.c` `object.c` |
| ---------------------------------- | ---------------------------------------- |
| `v3_3_12` (newest on the 3.3 line) | zero diff — byte-identical               |
| `v3_4_10` (newest stable)          | +581 / -285                              |

So bumping to current stable would leave a reviewer chasing
`range_include_internal` through code `ruby-compat/src/range.ts` was never
written against.
The host toolchain is `ruby 3.3.11 (2026-03-26 revision 1f2d15125a)` — the SHA
this ref resolves to — and `packages/date/src/date.ts:1229-1231` states its
claim as "on ruby 3.3.11".

`.github/workflows/ci.yml:1413,1686,1799` pin `ruby-version: "3.3"`, which
floats to the newest patch on that line, so it constrains the line rather than
the patch; since `v3_3_12` is byte-identical here, the two are interchangeable
for this anchor and `.11` wins only as the revision the host and the date port
name.

The `date` gem keeps its own `v3.4.1` ref; interpreter and gem refs move
independently.

It is **never enrolled in `parity:api`** (`compareApi: false`) — MRI's surface
is C and `extract-ruby-api.rb` globs `**/*.rb`, so it would extract nothing
from the files every citation points at, and there is no `packages/ruby/src`
workspace dir to key a package onto. `compareTests` is off too, pending the
RFC 0129-ruby-compat `ruby-spec-behavioural-enrollment` story, which enrolls
the in-tree `spec/ruby/` mirror of the ruby/spec suite (which is why no
separate `ruby/spec` clone is needed).

**Clone cost:** a `--depth=1` clone of `v3_3_11` is **130 MiB** on disk (20 MiB
of it `.git`) and takes ~5-8s — smaller than `vendor/rails` at 225 MiB, and
each worktree symlinks it rather than re-cloning. No `--filter=blob:none` or
sparse checkout is needed, so `fetch.ts` is unchanged.

## `vendor/rack-session/` — the Rack::Session anchor

Rack 3 moved `Rack::Session` out of Rack into its own gem, so `vendor/rack`
(pinned at `v3.1.14`) has no `lib/rack/session/` and `packages/rack` correctly
mirrors that absence. Rails still depends on the gem — `add_dependency
"rack-session", ">= 1.0.1"`
(`vendor/rails/actionpack/actionpack.gemspec:40`), resolved to **2.1.0** by
`vendor/rails/Gemfile.lock:440` — and
`vendor/rails/actionpack/lib/action_dispatch/middleware/session/abstract_store.rb`
opens with `require "rack/session/abstract/id"`. This clone is what those
citations resolve against: `SessionId` at `abstract/id.rb:21`, `SessionHash`
`:50`, `Persisted` `:239`, `PersistedSecure` `:460`, `ID` `:499`, `Pool`
`pool.rb:26`, `Cookie` `cookie.rb:91`.

`compareApi` / `compareTests` are off for now, and unlike `date` (a C surface)
or `minitest` (no TS package the port could ever key onto) that is temporary:
both extractors already run over this clone unmodified — `extract-ruby-api.rb`
reports 19 classes, 3 modules, 78 public methods, and
`extract-ruby-tests.rb` reports 7 files, 124 tests. They stay off only until
`packages/rack-session/src` exists, because both compares key a package onto a
TS workspace dir. RFC 0133's `enroll-rack-session-in-compare-tooling` creates
the package and flips both on.

## Scoping a Rails bump (drift report)

We pin `rails` to one tag in `sources.ts` (today `v8.0.2`) while upstream moves
on. Before bumping that pin, run the cross-version API drift report to scope the
work:

```sh
pnpm parity:api             # builds output/rails-api.json (base) + output/ts-api.json (ported)
pnpm parity:api:drift --ref v8.1.3
```

`parity:api:drift` fetches the target ref reproducibly into `output/drift-src-<ref>/`
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
