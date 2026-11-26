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
`range_include_internal` through code `ruby-compat/lib/range.ts` was never
written against.
The host toolchain is `ruby 3.3.11 (2026-03-26 revision 1f2d15125a)` — the SHA
this ref resolves to — and `packages/date/lib/date.ts:1229-1231` states its
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
`packages/rack-session/lib` exists, because both compares key a package onto a
TS workspace dir. RFC 0133's `enroll-rack-session-in-compare-tooling` creates
the package and flips both on.

## `vendor/rack-test/` — the Rack::Test anchor

`rack-test` is a declared runtime dependency of actionpack — `add_dependency
"rack-test", ">= 0.6.3"`
(`vendor/rails/actionpack/actionpack.gemspec:41`), resolved to **2.2.0** by
`vendor/rails/Gemfile.lock:443` — and the `Rack::Test` citations in
`packages/actionpack/lib/action-dispatch/testing/integration.ts:1065-1070`,
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

## `vendor/rack-cache/` — the Rack::Cache anchor

`rack-cache` is not a gemspec dependency of actionpack or railties; the Rails
repo's own `Gemfile:18` asks for `gem "rack-cache", "~> 1.2"`, resolved to
**1.17.0** by `vendor/rails/v8.0.2/Gemfile.lock:434`. Rails reaches it from
`actionpack/lib/action_dispatch/http/rack_cache.rb` and
`railties/lib/rails/application/default_middleware_stack.rb:37-40`, and those
citations resolve against this clone. It is cloned from git rather than
RubyGems because the `.gem` ships no `test/`. As with rack-test,
`lib/rack/cache.rb` is not a shim (`Rack::Cache.new`, `:42-44`), so it is
recovered through `libEntryFile`. `compareTests` is on (10 files, 226 tests,
matching nothing yet). `compareApi` is off for rack-test's reason: the Ruby half
is ready (23 classes, 5 modules, 158 public methods), but `extract-ts-api.ts`
refuses a package with no `dist`. RFC 0168's
`enroll-rack-cache-in-compare-tooling` creates the TS workspace and flips it on.

## `vendor/zeitwerk/` — the Zeitwerk anchor

Railties asks for `zeitwerk ~> 2.6`
(`vendor/rails/v8.0.2/railties/railties.gemspec:46`), resolved to **2.7.2** by
`vendor/rails/v8.0.2/Gemfile.lock:676`. RFC 0213 ports it as
`@blazetrails/zeitwerk`. `compareApi` and `compareTests` are off until
`zeitwerk-package-skeleton-and-inflector` creates that package.

## `vendor/bcrypt-ruby/` — the BCrypt anchor

`has_secure_password` reaches the `bcrypt` gem —
`BCrypt::Engine::MIN_COST`, `BCrypt::Engine.cost` and `BCrypt::Password.create`
at `vendor/rails/v8.0.2/activemodel/lib/active_model/secure_password.rb:160-161`.
`vendor/rails/v8.0.2/Gemfile:34` declares `gem "bcrypt", "~> 3.1.11"`, resolved
to **3.1.20** by `vendor/rails/v8.0.2/Gemfile.lock:145`. The port is
`packages/bcrypt`, over the `bcryptjs` npm client where the gem calls its C
extension (`__bc_crypt`, `__bc_salt`).

**The backend is `bcryptjs`, and that is settled** (operator decision on
trails#8402): the gem's own `ext/mri/crypt_blowfish.c` is not ported.
`bcryptjs.hashSync` takes a JS string and UTF-8 encodes it, which fixes three
differences from the gem:

- `Engine.hash_secret` omits `secret.byteslice(0, MAX_SECRET_BYTESIZE)`
  (`lib/bcrypt/engine.rb:63-64`). A slice that splits a character is not a JS
  string; `bcryptjs` truncates the encoded bytes at 72 itself, which matches
  the gem (`packages/bcrypt/lib/engine.trails.test.ts`).
- A `$2x$` salt raises `Invalid salt revision`, where the gem hashes it.
- A secret holding invalid UTF-8 (`"\xa3"`) cannot be passed at all, so 23 of
  the 68 vectors in `spec/bcrypt/engine_spec.rb:80-155` are not ported; the
  other 45 are.

`compareApi` and `compareTests` are both on. The gem's examples are
`specify "..." do`, which `scripts/test-compare/extract-ruby-tests.rb` reads as
it reads `it`.

## `vendor/turbo-rails/`, `vendor/stimulus-rails/`, `vendor/vite_ruby/` — the Hotwire-via-Vite anchors

The hotwire-via-vite RFC ports `turbo-rails` (**2.0.23**), `stimulus-rails`
(**1.3.4**) and two gems from the `ElMassimo/vite_ruby` monorepo, `vite_ruby`
and `vite_rails` (both **3.11.1**). Each is the newest release on rubygems.org
as of 2026-11-12. The monorepo tags each gem separately; `vite_ruby@3.11.1`
is the later tag and leaves `vite_rails/lib` as `vite_rails@3.11.1` released
it, so it pins both. `versionDir` turns its `<gem>@<version>` tag into
`v3.11.1`, the spelling the citation pattern reads.

The JavaScript these gems ship (`turbo-rails/app/javascript/turbo/`, the npm
`@hotwired/turbo-rails`; the monorepo's `vite-plugin-ruby`) is an npm
dependency, not a port. `compareApi` and `compareTests` are off until the RFC
creates each `packages/<name>`.

## Scoping a Rails bump (dry run)

Scope any bump, Rails or a gem, with the dry run (RFC 0191 § 7):

```sh
pnpm parity:bump:dry-run --source <name> --ref <tag>
```

It fetches the candidate beside the active version, runs every gating step of
ci.yml's `rails-comparison` job against the active manifests and then against
the candidate's, and writes the versioned report to
`scripts/parity/bump-ledger/reports/<source>-<from>-<to>.<date>.json` (commit
it), plus the ledger seed, the attribution of every new gate row and the size
tables under `scripts/parity/output/bump-dry-run/<source>@<ref>/`. It needs a
clean tracked tree, restores every tracked file from `HEAD` when it finishes,
and refuses a run that left one changed. Commit or set aside your work before
starting it.

The dry run supersedes hand-running `parity:api:drift` for scoping. The drift
report (`pnpm parity:api:drift --ref <tag>`, writing
`output/version-drift.json`) is still there for a method-level read of the
Rails API alone: classes added and removed, signature, visibility and call-set
deltas, each flagged `ported`, and the `addedPackages` / `removedPackages`
delta of the monorepo's gemspecs. The diff core is
`scripts/api-compare/version-diff.ts`.

## Upgrading a source (bumping `ref`)

Each source's clones live in version directories (`vendor/<source>/<version>/`,
RFC 0159), so a candidate version can sit on disk beside the active one while
the upgrade is scoped. The active version is always `versionDir(ref)` of the
`ref` in `sources.ts`; nothing else is.

### Minor and patch bumps

A patch bump (`v8.0.2` → `v8.0.5.2`) and a minor bump (`v8.0` → `v8.1`) run
the same nine steps. They differ in size, and size decides the shape:

- **Fits one PR.** If the dry run's seed and the fixes for every red fit the
  PR ceiling, the bump is one PR with no ledger file: pin floor, flip, recite,
  converge and re-pin every drifted body, in separate commits (zeitwerk
  `v2.7.3`, trails#10621). Most gem patch bumps are this shape.
- **Does not fit.** The flip PR seeds a bump ledger, and burn-down stories in
  their own RFC clear it, one PR per package (rails `v8.0.5.2`,
  trails#10554). A minor Rails bump is always this shape: `v8.1.4` moves 187
  arel tests on its own.

A minor bump also moves Rails' version constants and usually adds or removes
whole gems (`addedPackages` / `removedPackages` in the drift report); a patch
bump inside a line moves only `TINY` / `PRE`.

### The runbook

1. **Resolve the target.** For Rails, check that the target line is inside Rails'
   maintenance window (<https://rubyonrails.org/maintenance>); a line past
   its security support takes its last release and no more.
   A gem has no maintenance window; its target is the version the
   dependent-source rule below names. `git ls-remote --tags <url> '<tag>*'`
   (for Rails, `'v<major>.<minor>*'`), and record the tag and
   its `^{}` commit SHA (the `^{}` line is the commit an annotated tag
   points at, and is what `sources.lock.json` locks). Read the tag's
   `Gemfile.lock` and every `*.gemspec` diff against
   `vendor/sources.lock.json`.
   **The dependent-source rule:** every other source moves to what the target
   Rails `Gemfile.lock` resolves, unless the pin is already at or past it.
   **Gemspec floors are the one way a gem is forced to move with Rails**: a
   `Gemfile.lock` version is a convenience, but a runtime-dependency floor
   (`rails-html-sanitizer >= 1.7.2`, which in turn forces
   `loofah >= 2.25.3` and `nokogiri >= 1.19.5`) is a requirement. Note every
   forced gem; it is bumped first in step 9.
2. **Fetch beside and dry-run.**
   `pnpm vendor:fetch --source <name> --ref <tag>` clones
   `vendor/<name>/<versionDir(tag)>/` without touching the lockfile, and no
   `--print-*` manifest answers it, so every gate keeps measuring the active
   version. Then `pnpm parity:bump:dry-run --source <name> --ref <tag>`
   ([above](#scoping-a-rails-bump-dry-run)). Put its tables in the upgrade
   RFC and commit its report. For a hand read,
   `git diff --no-index --stat vendor/<name>/<old>/<lib> vendor/<name>/<new>/<lib>`,
   narrowed to the files trails ports.
3. **Entry.** For Rails, RFC 0191 § 4's criteria: the dry run reports no red
   outside the ledger, every gate is green on `main`, zero unpinned matched
   bodies. **Retake the pin floor on the old ref**, as late as possible:
   For Rails, `pnpm parity:api:pins:all`. For a gem,
   `pnpm tsx scripts/api-compare/body-pins.ts --pin-all --source <name>`,
   which pins only that source's packages and touches no other source's
   pins or bump ledger. `git diff --stat` should show only
   `body-pins/<package>.json`, with additions only. **If the bump will need a
   ledger, the floor merges in its own PR before the flip**:
   `parity:api:pins:ledger` recomputes the seed from the base branch's pins,
   so a floor and a ledger seed in one PR do not agree
   (`lint-bump-ledger.ts`, trails#10577). A bump with no ledger carries the
   floor as its first commit.
4. **Flip PR**, in separate commits:
   - `ref: "<tag>"` in `vendor/sources.ts`, then
     `pnpm vendor:fetch --source <name>`, which adopts the candidate from
     step 2 and re-locks `vendor/sources.lock.json` to the new SHA. Run
     `pnpm vendor:mirrors` and commit the rewritten `mirrors` fields;
     Preflight's "Package mirrors fields" step fails a bump that skips it.
     `mirrors` names the ref the gates measure against, not a finished
     burn-down.
   - The dry-run report and, if one is needed, the seeded ledger
     (`scripts/parity/bump-ledger/<source>.json` and `<source>.tests.json`).
   - `pnpm vendor:recite --check`, saved as
     `bump-ledger/reports/<source>-<from>-<to>.recite-check.txt`, then
     `pnpm vendor:recite`, as its own commit, so a reviewer reads it as the
     mechanical rewrite it is.
   - `pnpm parity:api:inlined:fix`.
   - Rows the bump makes stale on units outside the ledger, deleted by hand,
     with each gate's `:tighten` command. No reseed, no wider baseline.
   - Regenerated artifacts: the rails-private, deprecation, method-order and
     test-name manifests, the conventions doc, the schema-parity `Gemfile`.
   - Version constants Rails states as literals (each package's
     `gem-version.ts`).
   - Anything a gate still reports on a unit outside the ledger is fixed in
     this PR.
5. **Tag** the flip commit's parent `rails-<old>` (annotated, with the parity
   summary in its message), once the flip has merged; trails squash-merges,
   so the flip has one parent. Tags only: no stable branch until a published
   line needs a backport (RFC 0191 § 5). Gems are not tagged.
6. **Generate** the burn-down stories:
   `pnpm parity:bump:stories --source <name> --from <old> --to <new> --from-tests … --rfc <rfc> --out <dir>`
   writes one story per package, split where a package is too large, into a
   new burn-down RFC. File each with
   `pnpm tasks new <rfc> <id> --title "<its frontmatter title>" --body-file <file>`:
   `--body-file` reads only the body, so the title is lost without `--title`.
   Write the story ids into the ledger rows.
7. **Burn down.** Each story re-verifies its ledgered bodies against the new
   tree, fixes the port, and runs
   `pnpm tsx scripts/api-compare/body-pins.ts --pin <ruby-file>`, which
   deletes the rows it clears; `pnpm parity:api:pins` shows what is left. Port
   what is new, delete what is gone, and re-read each recited citation from
   the saved `--check` list: `vendor:recite` rewrites only the version
   segment, so a citation that still resolves can name a line whose code
   moved. For `vendor/ruby/`, `ruby-compat-needs-mri-citation` checks the
   file and line range mechanically.
   **A green citation gate is not evidence a port is still faithful**; the
   ledger is the fidelity worklist.
8. **Close.** The ledger is empty and deleted, `pnpm parity:api:pins` shows 0
   DRIFT and 0 STALE, `pnpm vendor:fetch --prune --source <name>` deletes the
   inactive version directory (nothing prunes on its own), the retrospective
   is written and the RFC closes.
9. **Dependent sources** by the same steps, gemspec-forced ones first, in
   dependency order (nokogiri before loofah before rails-html-sanitizer),
   then smallest first. Each gem retakes its own floor.

### What the parity gates do across a bump

Without a ledger, a `ref` move reds the per-unit ratchets on every unit whose
upstream changed. The ledger scopes those ratchets off its units, and nothing
else:

| Gate                                                         | Across a bump                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Body-pins gate                                               | ledgered DRIFT / STALE pairs reported as `ledger` and passed         |
| Bump-ledger gate (`parity:api:pins:ledger`)                  | reds a stale row, a row added without a `ref` move, a seed mismatch  |
| Call, call-argument, ruby-compat-call, receipt-audit ratchet | rows on a ledgered pair not counted                                  |
| Missing-throw arm, extra-surface, parameter, block ratchet   | rows on a ledgered pair not counted                                  |
| Test comparison (gate-mismatch), assertion ratchet           | a ledgered test (`<source>.tests.json`) not counted                  |
| Vendor citations, inlined-from spans                         | made green mechanically in the flip (`vendor:recite`, `inlined:fix`) |
| Rails-private JSDoc, method-order lint                       | made green mechanically in the flip (regenerated manifests, autofix) |
| `parity:api` / `parity:test`                                 | move both ways: upstream adds, removes and renames methods and tests |

The ledger rules:

1. **Seeded once, mechanically, by the PR that moves the `ref`**, from the dry
   run's output for the two refs. Row kinds are `drift`, `removed`,
   `signature` and `constant` for pairs, `changed` and `moved` for tests.
   Nobody authors a row.
2. **Only-shrink.** A row may be added only by a commit that also moves that
   source's `ref`.
3. **A row leaves when its unit is re-verified**: `--pin` (or `--prune` for a
   confirmed removal) deletes it, and from that commit every ratchet applies
   to the unit at full strength. A row whose pin already matches is stale,
   and stale is red.
4. **A straddling PR is refused**: one forked before the `ref` move that
   edits `body-pins/<package>.json` fails until rebased.
5. **Empty means deleted**, and no trails release is tagged while a ledger
   has rows.

A row is "not yet re-verified", never "accepted" (CLAUDE.md § "A documented
deviation is debt, not permission"). Every other baseline stays
**only-shrink** across a bump: a row the bump makes stale is deleted by hand
and its mark tightened. A method new upstream surfaces as **missing**, never
as extra surface; `parity:api:extra` moves only when a method trails ports is
removed upstream.

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
