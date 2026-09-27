# vendor/

Upstream Ruby source mirrors used by `api-compare`, `test-compare`, and
schema-parity tooling.

- `sources.ts` — declarative registry. Single source of truth for which
  gems we mirror and at what version.
- Per-source, per-version subdirs (`rails/v8.0.2/`, `rack/v3.1.14/`,
  `ruby/v3.3.11/`, …) are gitignored shallow clones of the upstream repo at
  the pinned tag. The version directory is `versionDir(ref)` in `sources.ts`
  — the tag with `_` normalized to `.`, so MRI's `v3_3_11` lands at
  `ruby/v3.3.11/` (RFC 0159). They land here via the unified fetcher (wave 2).
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
of it `.git`) and takes ~5-8s — larger than `vendor/rails` at ~53 MiB, and
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

## `vendor/rack-test/` — the Rack::Test anchor

`rack-test` is a declared runtime dependency of actionpack — `add_dependency
"rack-test", ">= 0.6.3"`
(`vendor/rails/actionpack/actionpack.gemspec:41`), resolved to **2.2.0** by
`vendor/rails/Gemfile.lock:443` — and the `Rack::Test` citations in
`packages/actionpack/src/action-dispatch/testing/integration.ts:1065-1070`,
`.../action-controller/test-case.ts:670` and
`.../action-dispatch/testing/test-process.ts:63,88` resolve against this clone:
`Session` at `lib/rack/test.rb:53`, `Error` `:45`, `Cookie`
`test/cookie_jar.rb:10`, `CookieJar` `:134`, `Utils` `test/utils.rb:5`,
`UploadedFile` `test/uploaded_file.rb:14`, `Methods` `test/methods.rb:24`.

Its `libEntryFile` is the one thing that differs from `rack` / `rack-session`.
Those two point `libPath` at the module root specifically to _exclude_ the
entrypoint shim beside it; rack-test's `lib/rack/test.rb` is not a shim but 382
lines defining the gem's central `Session` class, so the module root stays the
`libPath` for path mapping and the entry file is recovered through
`libEntryFile` — the mechanism `arel` uses for `activerecord/lib/arel.rb`.
`testPath` is `spec`, not `test`.

`compareTests` is **on**: test-compare tolerates a package with no
`packages/<name>/src`, so the gem's 8 spec files / 234 tests are read and simply
match nothing yet, and `parity:test`'s totals are unmoved.

`compareApi` is off, and unlike rack-session's that is a hard mechanical block
rather than a policy: `extract-ts-api.ts` refuses to measure a package whose
`dist` is absent (`packages/rack-test — NotBuilt`, `build-freshness.ts:168-185`),
so turning it on fails `pnpm parity:api` outright rather than printing a 0% row.
The Ruby half is ready — `extract-ruby-api.rb` reports 5 classes, 4 modules, 90
public methods over this clone — so the blocker is only the missing TS
workspace, which RFC 0137's `enroll-rack-test-in-compare-tooling` creates.

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

Re-pinning the body-hash floor is a step of **every** bump — see step 6 of
[Upgrading a source](#upgrading-a-source-bumping-ref) below.

## Upgrading a source (bumping `ref`)

Each source's clones live in version directories (`vendor/<source>/<version>/`,
RFC 0159), so a candidate version can sit on disk beside the active one while
the upgrade is scoped. The active version is always `versionDir(ref)` of the
`ref` in `sources.ts`; nothing else is. In order:

1. **Fetch the candidate beside the active version.**
   `pnpm vendor:fetch --source <name> --ref <new-tag>` clones the tag into
   `vendor/<name>/<versionDir(new-tag)>/`. It never reads or writes
   `sources.lock.json`, and no `--print-*` manifest ever answers it, so every
   gate keeps measuring the active version while the candidate is on disk.
2. **Diff the two trees.** For example
   `git diff --no-index --stat vendor/rails/v8.0.2/activerecord/lib vendor/rails/v8.1.0/activerecord/lib`,
   narrowed to the files trails ports; for Rails, the drift report above scopes
   the same diff at method granularity.
3. **Bump `ref` in `sources.ts`.** That one edit moves the active version for
   every consumer — `fetch.ts`, the `--print-*` manifests, the compare tooling,
   the citation gate and `vendor:recite`.
4. **Re-fetch.** `pnpm vendor:fetch --source <name>`. The lockfile entry still
   names the old `ref`, so the fetch treats it as the pin being bumped: it
   adopts the candidate clone from step 1 (or clones the tag) and re-locks
   `sources.lock.json` to the new SHA. Commit the lockfile with the `ref`.
5. **Rewrite the citations.** Save the stale list first —
   `pnpm vendor:recite --check` prints every file carrying a
   `vendor/<name>/<old-version>/…` citation, the same set
   `scripts/vendor-citations.test.ts` now fails on — then run
   `pnpm vendor:recite` to rewrite them to the new version. Make this sweep its
   own commit, separate from any port changes, so a reviewer can read it as the
   mechanical rewrite it is.
6. **Read both worklists, then re-verify and re-pin.**
   - **The citation gate's stale list** (step 5) answers _did the path move?_
     `vendor:recite` rewrites only the version segment, so each rewritten
     citation still has to name a file and line that exist, and hold the same
     code, in the new tree. For `vendor/ruby/` the
     `ruby-compat-needs-mri-citation` lint checks the file and line range
     mechanically (`unknownFile` / `lineOutOfRange`); elsewhere it is a read.
   - **`pnpm parity:api:pins`** (`scripts/api-compare/lint-body-pins.ts`)
     answers _did the body change?_ Its DRIFT rows are the pinned, ported pairs
     whose normalized Ruby body no longer matches its pin. Re-verify each TS
     port against the new body, fix it, then re-pin with
     `pnpm tsx scripts/api-compare/body-pins.ts --pin <ruby-file>` (or
     `pnpm parity:api:pins:all` once the list is burnt down). See
     CONTRIBUTING.md "Body pins".

   **A green citation gate is not evidence a port is still faithful.** It goes
   green the moment `vendor:recite` runs, and a citation that still resolves
   can point at a body that changed under it. The DRIFT list is the fidelity
   worklist; the citation list only keeps the pointers honest.

7. **Prune.** `pnpm vendor:fetch --prune` (optionally `--source <name>`)
   deletes every inactive version directory. It is manual — nothing prunes on
   its own, so the old tree stays on disk until you run it.

### What the parity gates do across a bump

- `parity:api` / `parity:test` deltas move, in both directions: upstream adds,
  removes and renames methods and tests, so a bump PR reports movement it did
  not port.
- The call, argument, parameter, predicate and extra-surface baselines stay
  **only-shrink**. A row a bump makes stale is deleted by hand (and the mark
  tightened); a bump never licenses a reseed or a wider baseline.
- A method new upstream surfaces as **missing** — a Ruby name with no TS
  counterpart — never as extra surface; `parity:api:extra` moves only when a
  method trails already ports is removed upstream.

### Disk cost

Coexistence costs one extra clone per candidate: ~53 MiB for `rails`, 130 MiB
for `ruby`, under 3 MiB for each gem. Nothing reclaims it until `--prune` runs.

### Build vendor paths through the registry

`sources.ts` is the only place a vendor path is built: `versionDir`,
`activeVersion`, `vendoredRoot`, `resolvePath` / `resolveSourcePath` and the
`--print-*` manifests. A script that needs a vendored path asks the registry
(or spawns `pnpm vendor:fetch --print-paths`). Never write a
`vendor/<source>/<version>` literal into code: it silently keeps reading the
old tree after a bump.

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
