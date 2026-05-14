# Ruby source fetcher — unification plan

## Headline

- **3 fetch scripts** today (`fetch-rails.sh`, `fetch-rails-tests.sh`, `fetch-globalid.sh`) totalling **~125 LOC** (38 + 70 + 17 by `wc -l`; 128 if you count trailing newlines), of which ~50 LOC is near-identical clone/idempotency plumbing.
- **4 distinct on-disk source layouts** already present, with no unifying schema:
  - `scripts/api-compare/.rails-source/` — full git clone of `rails/rails` @ `v8.0.2`
  - `scripts/api-compare/.rack-source/` — full git clone of `rack/rack` @ `v3.1.14` (created by `fetch-rails-tests.sh`, not `fetch-rails.sh` — surprising)
  - `scripts/globalid-source/vendor/bundle/ruby/*/gems/globalid-*/` — bundler-vendored gem
  - `scripts/parity/schema/ruby/` — independent `Gemfile` re-pinning `activerecord 8.0.2` (cross-script version drift risk)
- **3 places hardcode source paths** (5 lines total): `scripts/api-compare/extract-ruby-api.rb:14`, `scripts/test-compare/extract-ruby-tests.rb:18-19`, `scripts/start-worktree.sh:154-155`. A 4th, separate concern is `scripts/parity/schema/ruby/Gemfile:5` — a version pin, not a path, manually kept in sync with `RAILS_TAG`.
- **Globalid is fetched but not wired**: `PACKAGES` in `scripts/api-compare/config.ts:7` lists no `globalid`; nothing in `scripts/test-compare/` references it. The fetcher exists in isolation.
- **Rack is wired into test-compare but bundled inside the rails-tests fetcher** — another precedent for a per-script ad-hoc origin, hidden from the api-compare path.

The fix is one source list, one fetcher, one layout. This doc designs it; implementation lands in 7 waves.

## 1. Current state inventory

### 1.1 `scripts/api-compare/fetch-rails.sh` (38 LOC)

- Origin: `git clone --depth=1 --branch v8.0.2 https://github.com/rails/rails.git`.
- Dest: `scripts/api-compare/.rails-source/`.
- Filtering: none (full clone). Per PR #1483, sparse-checkout was removed; the script auto-migrates pre-#1483 sparse mirrors by disabling sparse-checkout.
- Idempotency: skips when `.git` exists; rewrites the sparse flag if set.
- Consumers: `extract-ruby-api.rb`, `start-worktree.sh` (symlinks the existing mirror into each new worktree to avoid re-cloning), `extract-ruby-tests.rb`.

### 1.2 `scripts/test-compare/fetch-rails-tests.sh` (70 LOC)

- Two origins handled in one script:
  - **Rails**: verifies `../api-compare/.rails-source/` exists; does NOT clone (delegates to `fetch-rails.sh`). Asserts 8 required test directories are present and reports file counts.
  - **Rack**: clones `https://github.com/rack/rack.git @ v3.1.14` into `../api-compare/.rack-source/`. The path lives under `api-compare/` so `start-worktree.sh:154-155` can symlink both Ruby sources from one parent dir; nothing in `api-compare/` actually reads `.rack-source/`.
- Idempotency: per-origin skip.
- Consumers: `extract-ruby-tests.rb`.
- Smell: the verification half overlaps `fetch-rails.sh`; the rack half is a hidden second fetcher.

### 1.3 `scripts/globalid-source/fetch-globalid.sh` (17 LOC)

- Origin: `bundle install` against a 2-line `Gemfile` pinning `globalid 1.3.0`.
- Dest: `scripts/globalid-source/vendor/bundle/ruby/<ruby-version>/gems/globalid-<version>/`.
- Idempotency: skips when `vendor/bundle` exists.
- Consumers: **none today.** Not referenced in `api-compare/`, `test-compare/`, or `start-worktree.sh`. It is dead infrastructure.

### 1.4 Duplication tally

| Concern                       | rails  | rails-tests  | globalid | unified               |
| ----------------------------- | ------ | ------------ | -------- | --------------------- |
| `SCRIPT_DIR` resolution       | 1 line | 1 line       | 1 line   | shared util           |
| Idempotency check             | 8 LOC  | 5 LOC        | 4 LOC    | 1 helper              |
| Git clone invocation          | 8 LOC  | 6 LOC (rack) | —        | `gitFetcher`          |
| Bundler vendoring             | —      | —            | 5 LOC    | `bundlerFetcher`      |
| Required-dir verification     | —      | 28 LOC       | —        | declarative (schema)  |
| Path constants (rb consumers) | 1      | 2            | 0        | `sources.resolvePath` |

Of 125 LOC across the three scripts, ~60 LOC is plumbing that disappears under a single fetcher.

### 1.5 Path-hardcoding consumers

```
scripts/api-compare/extract-ruby-api.rb:14    RAILS_DIR = File.join(SCRIPT_DIR, ".rails-source")
scripts/test-compare/extract-ruby-tests.rb:18 RAILS_DIR = File.join(SCRIPT_DIR, "..", "api-compare", ".rails-source")
scripts/test-compare/extract-ruby-tests.rb:19 RACK_DIR  = File.join(SCRIPT_DIR, "..", "api-compare", ".rack-source")
scripts/start-worktree.sh:154                 link_source "scripts/api-compare/.rails-source"
scripts/start-worktree.sh:155                 link_source "scripts/api-compare/.rack-source" optional
scripts/parity/schema/ruby/Gemfile:5          gem "activerecord", "8.0.2"   # manually kept in sync with RAILS_TAG — drift risk
```

The Ruby extractors will need a small env-var contract to receive resolved paths from their caller. Today they're invoked via `bash scripts/api-compare/run.sh` (which calls `ruby extract-ruby-api.rb`) and `bash scripts/test-compare/run.sh` for the test side; the simplest migration is to have those shell entrypoints `export RAILS_DIR=$(tsx vendor/print-path.ts rails)` (and similar) before invoking ruby, no new Node wrapper needed.

## 2. Source-list schema design

User chose **`vendor/`** at repo root as the layout, **TypeScript (tsx)** as the fetcher language. Schema lives at `vendor/sources.ts`; each entry's vendored root lands at `vendor/<source-name>/` (e.g. `vendor/rails/`, `vendor/rack/`, `vendor/globalid/`), and `libPath` / `testPath` in the schema are relative paths _inside_ that root — for monorepo origins they reach into the gem subdir (e.g. `vendor/rails/actionpack/lib/action_dispatch/`).

### 2.1 Three shapes considered

**Shape A — flat list, monorepos split out at the consumer.**

```ts
type UpstreamSource =
  | { name: "actionpack"; origin: GitOrigin; subdir: "actionpack" }
  | { name: "activerecord"; origin: GitOrigin; subdir: "activerecord" }
  | ...;
```

Pro: one entry per consumed package. Con: 8+ entries all sharing one git ref means duplication; a Rails version bump touches every entry; cross-package consistency is an ad-hoc invariant.

**Shape B — one entry per origin, packages declared inside.** (Selected.)

```ts
interface UpstreamSource {
  name: string; // "rails", "rack", "globalid" — used as vendor/<name>/
  origin:
    | { type: "git"; url: string; ref: string }
    | { type: "rubygems"; gem: string; version: string };
  packages: Array<{
    name: string; // "activerecord", "globalid"; surfaces in api-compare PACKAGES
    libPath: string; // relative to vendored root (origin-specific)
    testPath?: string; // optional; omitted = test-compare ignores
  }>;
}
```

Pro: one origin = one fetch = one cache invalidation. Versioning is monorepo-aware. Easy to enumerate packages for downstream tools.

**Shape C — two-layer (origins + packages as separate tables).** Pro: dedupe across origins (none today). Con: indirection without payoff at current scale.

**Decision**: Shape B. Revisit if any origin grows >10 packages.

### 2.2 Concrete list (initial migration target)

```ts
export const SOURCES: UpstreamSource[] = [
  {
    name: "rails",
    origin: { type: "git", url: "https://github.com/rails/rails.git", ref: "v8.0.2" },
    // Package names mirror scripts/api-compare/config.ts PACKAGES exactly, including
    // the trails-side rename trailties (← railties) and the actionpack split into
    // actiondispatch / actioncontroller / abstractcontroller — each pointing at a
    // distinct lib subdir so derived PACKAGES doesn't need an alias table.
    packages: [
      { name: "arel", libPath: "activerecord/lib/arel", testPath: "activerecord/test/cases/arel" },
      {
        name: "activerecord",
        libPath: "activerecord/lib/active_record",
        testPath: "activerecord/test/cases",
      },
      {
        name: "activemodel",
        libPath: "activemodel/lib/active_model",
        testPath: "activemodel/test/cases",
      },
      {
        name: "activesupport",
        libPath: "activesupport/lib/active_support",
        testPath: "activesupport/test",
      },
      {
        name: "actiondispatch",
        libPath: "actionpack/lib/action_dispatch",
        testPath: "actionpack/test/dispatch",
      },
      {
        name: "actioncontroller",
        libPath: "actionpack/lib/action_controller",
        testPath: "actionpack/test/controller",
      },
      { name: "abstractcontroller", libPath: "actionpack/lib/abstract_controller" },
      { name: "actionview", libPath: "actionview/lib/action_view", testPath: "actionview/test" },
      { name: "trailties", libPath: "railties/lib/rails", testPath: "railties/test" },
    ],
  },
  {
    name: "rack",
    origin: { type: "git", url: "https://github.com/rack/rack.git", ref: "v3.1.14" },
    packages: [{ name: "rack", libPath: "lib", testPath: "test" }],
  },
  {
    name: "globalid",
    origin: { type: "rubygems", gem: "globalid", version: "1.3.0" },
    packages: [{ name: "globalid", libPath: "lib", testPath: "test" }],
  },
];
```

### 2.3 Resolved decisions (post-design Q&A)

- **Vendored sources are gitignored; a lockfile is committed.** `vendor/sources.lock.json` records the resolved git SHA per git origin and the gem-checksum per rubygems origin. The fetcher writes this file after every successful fetch and refuses to fetch when the tag-or-version in `sources.ts` doesn't resolve to the lock SHA (unless `--refresh` is passed). This gives reproducibility without bloating the repo and lets CI verify "we built against what we said we did" even when GitHub re-tags.
- **`vendor/sources.ts` is the only source of truth for the Rails tag.** `scripts/parity/schema/ruby/Gemfile` is generated at parity-run time from `SOURCES.find(s => s.name === "rails").origin.ref`. Wave 7 implements the generator; until then the comment-pinned version remains.
- **`--refresh` does a hard reset.** `rm -rf <dest> && fetch`. Users with in-flight edits to a vendored source are expected to copy them out first; the fetcher prints a warning if `<dest>` has uncommitted changes (per `git -C <dest> status --porcelain`).
- **No compat symlink during wave 2.** Wave 2 relocates `scripts/api-compare/.rails-source` → `vendor/rails` via a filesystem `mv` (the directory is gitignored, so this is not a tracked rename — just an untracked dir move done either by hand on the master worktree or by `fetch.ts --migrate` on first run). The PR updates every path-hardcoder in the same commit and deletes the old fetch script. If the old directory isn't present (fresh checkout, fresh CI runner), `fetch.ts` falls back to a normal clone. In-flight agents must re-link on next `start-worktree.sh`; wave 2 should be merged during a spawn pause.

## 3. Unified fetcher

`vendor/fetch.ts` (tsx-runnable, single entrypoint):

```ts
// CLI: tsx vendor/fetch.ts [--source <name>] [--refresh]
// Default: fetches all sources, idempotent.
// --source: limit to one entry by name.
// --refresh: rm -rf the dest, re-fetch.
```

Internals:

- `loadSources()` — imports `vendor/sources.ts`, validates with a tiny zod-free runtime check.
- `gitFetcher({ url, ref, dest })` — `git clone --depth=1 --branch <ref> <url> <dest>` if `<dest>/.git` missing; tags refs as pinned, no `git pull`.
- `bundlerFetcher({ gem, version, dest })` — writes an ephemeral `Gemfile` in `<dest>`, `bundle config set --local path vendor/bundle`, `bundle install`, then **symlinks every declared `libPath`/`testPath`** (`<dest>/lib`, `<dest>/test`, etc.) to the corresponding directory under `vendor/bundle/ruby/*/gems/<gem>-*/` so the on-disk shape matches git origins. Without this the schema's `libPath: "lib"` would lie for rubygems sources, and `testPath: "test"` would resolve to a missing dir.
- `verifyPackages(source)` — for each declared `package`, asserts `libPath` and (if set) `testPath` exist under the resolved root; counts test files for the human-readable summary.

Normalized layout after fetch:

```
vendor/
  rails/                          (git clone of rails/rails)
    activerecord/lib/...
    activerecord/test/...
    ...
  rack/                           (git clone of rack/rack)
    lib/...
    test/...
  globalid/                       (bundler vendor + symlinks)
    lib/                          → vendor/bundle/.../globalid-1.3.0/lib
    test/                         → vendor/bundle/.../globalid-1.3.0/test
    vendor/bundle/...
```

**CI policy**: fetcher runs on every CI job that needs Ruby sources (`api:compare`, `test:compare`); cache key = hash of `vendor/sources.ts`. No periodic refresh — refs are pinned; bumping a `ref` invalidates the cache deterministically. Local dev: `pnpm vendor:fetch` (alias to `tsx vendor/fetch.ts`).

## 4. Downstream integration

A tiny TS helper exported from `vendor/sources.ts`:

```ts
export function resolvePath(packageName: string, kind: "lib" | "test" = "lib"): string {
  // returns absolute path; throws if package not in SOURCES or kind not declared
}
```

Consumers migrate as follows:

- `scripts/api-compare/config.ts` — drops the literal `PACKAGES` array; derives it from `SOURCES.flatMap(s => s.packages.map(p => p.name))`. Because §2.2 declares each Ruby-side key (including `actiondispatch`/`actioncontroller`/`abstractcontroller` as siblings under the `rails` origin and the trails-side `trailties` rename), no alias step is needed for derivation. `PACKAGE_DIR_OVERRIDES` and `PACKAGE_SRC_SUBDIR` continue to govern _TS-side_ directory resolution under `packages/`; only `PACKAGES` itself becomes derived.
- `scripts/api-compare/extract-ruby-api.rb` — receives `RAILS_DIR` via env var set by its TS caller (`compare.ts`), which calls `resolvePath("activerecord", "lib")` etc. Removes the hardcoded `File.join(SCRIPT_DIR, ".rails-source")`.
- `scripts/test-compare/extract-ruby-tests.rb` — same env-var contract. Iterates over a JSON-encoded source manifest passed by the caller.
- `scripts/start-worktree.sh` — replaces per-source `link_source "scripts/api-compare/.rails-source"` calls with one loop over `tsx vendor/fetch.ts --print-paths`. That flag emits one absolute path per line (one per source name, e.g. `/.../vendor/rails`), and the shell loop symlinks each into the new worktree's `vendor/<name>`.
- Memory entry `reference_rails_source_path.md` — updated in wave 7 to point at `vendor/rails/` and at `resolvePath`.

## 5. Globalid as proof

State today: globalid has a fetcher but **zero downstream wiring**. Grep confirms no references in `scripts/api-compare/` or `scripts/test-compare/`. The TS package `@blazetrails/globalid` would need to land in `PACKAGES` (it isn't there as of `config.ts:7-17`).

Validation flow once the design lands:

1. Add globalid to `SOURCES` (already in §2.2).
2. Add `globalid` to the TS package list, or rely on `PACKAGES` being derived from `SOURCES` (preferred — that's the whole point).
3. Run `pnpm vendor:fetch --source globalid`; the fetcher symlinks the gem's `lib/` and `test/` under `vendor/globalid/`.
4. `pnpm api:compare` and `pnpm test:compare` pick it up automatically.

Test count: deferred. The rubygems tarball isn't checked out in this worktree (`scripts/globalid-source/vendor/` is in `.gitignore` and empty in the planning environment), so the count is whatever `find vendor/globalid/test -name "*_test.rb" | wc -l` reports after wave 3 fetches it. Wave 6 quotes the number.

## 6. Migration waves

Each wave ≤300 LOC. Order chosen so each wave is independently shippable and reversible.

| #   | Wave                                                                                                                           | Est. LOC | Touches                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Define `vendor/sources.ts` schema + the list (Rails only).                                                                     | ~100     | `vendor/sources.ts`, `vendor/README.md`                                                                          |
| 2   | Unified fetcher with `git` origin; migrate Rails + Rack.                                                                       | ~200     | `vendor/fetch.ts`; delete `fetch-rails.sh`, rack half of `fetch-rails-tests.sh`; update CI + `start-worktree.sh` |
| 3   | Add `rubygems` origin; migrate globalid.                                                                                       | ~150     | extend `fetch.ts`; delete `fetch-globalid.sh` + `scripts/globalid-source/`                                       |
| 4   | `api-compare` reads from `resolvePath`; derive `PACKAGES` from `SOURCES`; pass RAILS_DIR env to extractor.                     | ~150     | `config.ts`, `compare.ts`, `extract-ruby-api.rb` (env-var RAILS_DIR; mtime-vs-HEAD cache gate stays)             |
| 5   | `test-compare` reads from `resolvePath`; verify replaces required-dir block.                                                   | ~150     | `test-compare.ts`, `extract-ruby-tests.rb`, delete rest of `fetch-rails-tests.sh`                                |
| 6   | Globalid wiring: confirms PACKAGES auto-pickup; quote test count.                                                              | ~50      | `vendor/sources.ts` (no change), `globalid` parity baseline added                                                |
| 7   | Doc + memory + Gemfile cleanup; update `reference_rails_source_path.md`; align `parity/schema/ruby/Gemfile` version to schema. | ~100     | docs, memory, `parity/schema/ruby/Gemfile`                                                                       |

Waves 4 and 5 can land in either order; they are independent.

## 7. CI restructure — minimize Ruby jobs, reuse outputs

Today (`.github/workflows/ci.yml`):

- **`rails-comparison`** (line 372): installs ruby 3.3, runs `fetch-rails.sh` + `fetch-rails-tests.sh`, runs both Ruby extractors, then runs TS diff. ~6 min, one job, Ruby gated end-to-end.
- **`schema-parity-rails`** (line 413): installs ruby 3.3, separate `bundle install` against `scripts/parity/schema/ruby/Gemfile`, runs `parity/run.ts --side=rails`, uploads dumps. Sibling `schema-parity-trails` + `schema-parity-diff` jobs consume the dumps — no Ruby needed there.
- Other jobs (build-and-typecheck, lint, prettier, dx-type-tests, unit-tests, sqlite-tests, postgres-tests, mariadb-tests, website, guides-typecheck, virtualized-dx-type-tests) — already Ruby-free.

So 2 of ~13 jobs touch Ruby. Goal: collapse to **one Ruby job** whose outputs every other Ruby-dependent step consumes via `actions/upload-artifact` + `download-artifact`.

### 7.1 Target shape

```
        ┌─────────────────────────────────────┐
        │ ruby-extract  (only job with ruby)  │
        │   - tsx vendor/fetch.ts             │
        │   - ruby extract-ruby-api.rb        │
        │   - ruby extract-ruby-tests.rb      │
        │   - (gen) parity/schema/ruby Gemfile│
        │   - bundle install                  │
        │   - tsx parity/run.ts --side=rails  │
        │ upload artifacts:                   │
        │   - rails-api.json                  │
        │   - rails-tests.json                │
        │   - parity-rails-dumps/             │
        │   - vendor/sources.lock.json        │
        └─────────────────────────────────────┘
              │           │            │
              ▼           ▼            ▼
        api-compare   test-compare   schema-parity-diff
        (no ruby)     (no ruby)      (no ruby; trails-side also feeds it)
```

Every consumer is pure-TS. Ruby exists in exactly one workflow node.

### 7.2 Cache strategy

Three caches, keyed independently so a Rails-tag bump or globalid-version bump invalidates only what changed:

| Cache                 | Key                                                                      | Stored                                                                                      |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `vendor-sources`      | `hashFiles('vendor/sources.ts', 'vendor/sources.lock.json')`             | `vendor/**` (all fetched clones + gems)                                                     |
| `ruby-extract-output` | `<vendor-sources key>` + `hashFiles('scripts/{api,test}-compare/*.rb')`  | `scripts/api-compare/output/rails-api.json`, `scripts/test-compare/output/rails-tests.json` |
| `parity-rails-bundle` | `<vendor-sources key>` + `hashFiles('scripts/parity/schema/ruby/**.rb')` | `scripts/parity/schema/ruby/vendor/bundle/`                                                 |

Wave 7's generated parity Gemfile uses the resolved Rails ref from `vendor/sources.lock.json`, so the parity bundle cache key is also gated by it (no manual sync).

If all three caches hit, the `ruby-extract` job becomes a pure download step (~30s) and Ruby never executes. If only `vendor-sources` misses, the fetcher runs (~1 min for Rails depth=1 clone) and downstream extracts/bundle re-run.

### 7.3 Per-PR vs scheduled

- **Push / PR**: the artifact-producing job runs; downstream diff jobs consume artifacts. ~30s cold-cache penalty vs today's ~6 min, since the parity bundle + extractor outputs are shared across runs that haven't bumped any pinned version.
- **Scheduled / labelled parity runs**: same job, same caches. The parity output (`parity-rails-dumps/`) is what the schema-parity-diff job consumes — already the current shape; this plan keeps it.

### 7.4 Local-dev parity

`pnpm vendor:fetch` populates `vendor/` once; subsequent `pnpm api:compare` / `pnpm test:compare` / `pnpm parity:schema` all read from there. A TS-only contributor without Ruby installed can still run every TS-side check by downloading the latest `ruby-extract-output` artifact from a recent main build (`pnpm fetch-ci-extracts` is a tiny helper to add in wave 4). Ruby remains optional for non-extractor work.

### 7.5 Wave alignment

- **Wave 2** adds the `ruby-extract` job skeleton (just the fetcher; api-compare still runs its own extractor in-job for now).
- **Wave 4** moves api-compare's extractor invocation into `ruby-extract` and makes the api-compare diff job download the artifact. Old `rails-comparison` job split into `ruby-extract` (ruby) + `api-compare-diff` (TS only).
- **Wave 5** same for test-compare — extractor moves into `ruby-extract`, diff job becomes pure TS.
- **Wave 7** folds the parity Gemfile generation and `bundle install` into `ruby-extract`; the parity-rails job becomes a pure-TS dump runner that reads `vendor/rails/` + bundled gems via downloaded artifacts. At this point: **one job, one Ruby toolchain, one cache key tree.**

### 7.6 Out-of-scope for this plan

- Splitting `ruby-extract` into parallel matrix jobs (api vs test vs parity). Worth doing if total runtime exceeds ~3 min; not needed at current scale.
- Self-hosted runners for the Rails clone cache. The depth=1 clone is small enough that GitHub-hosted is fine.

## 8. Risks and open questions

- **CI cache invalidation**: cache key must be `hash(vendor/sources.ts)`, not a dir hash — otherwise a pinned-ref bump won't invalidate.
- **Bundler in CI**: globalid (and any future rubygems-origin source) requires `ruby` + `bundler` on the CI image. `api:compare` and `test:compare` already use Ruby for the extractors, so no new dep — but it does mean a TS-only contributor cannot run `pnpm vendor:fetch` without Ruby installed. Mitigation: `fetch.ts` should print an actionable error ("install ruby + bundler") rather than letting `bundle install` fail.
- **In-flight worktrees during migration**: per §2.3, wave 2 lands the path move in one PR with no compat symlink. Active agents must be paused at merge time and re-linked on next `start-worktree.sh` run. The master clone is relocated by a plain filesystem `mv` (the dir is gitignored, so this is _not_ a tracked rename); `fetch.ts` re-clones if the old path is absent. Avoids a ~53 MiB re-clone when the existing dir is present.
- **Extractor cache gate**: `scripts/api-compare/extract-ruby-api.rb:25-28` caches by comparing `output_path` mtime against `<RAILS_DIR>/.git/HEAD` mtime — not the tag string. After wave 4 moves `RAILS_DIR` to `vendor/rails/`, the gate still works (the path moves but the `.git/HEAD` mtime semantics are identical). The risk to plan for is rubygems-origin sources, which have no `.git/HEAD`: when wave 3 adds bundler origins, the gate needs a fallback signal (e.g., mtime of `vendor/sources.lock.json` for those packages).
- **Cross-doc coordination**: the parallel `docs/rails-file-structure-mirror-plan.md` (in progress on agent %396) is designing a Ruby-aware mirror tool that **must** consume the same `SOURCES` list. Both plans should converge on `vendor/sources.ts` as the single registry. Action item: cross-link this doc from the mirror plan when it lands.
- **`parity/schema/ruby/Gemfile` drift**: resolved per §2.3 — wave 7 generates the Gemfile from `SOURCES` at parity-run time.
- **Symlink semantics for rubygems origin**: the `vendor/globalid/lib → vendor/globalid/vendor/bundle/.../lib` symlink approach assumes POSIX. Windows is unsupported by the repo today (Ruby + pnpm + symlinks), so this is acceptable but worth flagging.

## 9. Out of scope

- Implementing the waves (each is its own PR).
- Mirroring non-Ruby upstream sources (Postgres grammar, MySQL grammar, etc.).
- Vendoring upstream gems into the shipped npm packages (this is dev-tool sourcing only).
- Cron / periodic refresh — pinned refs make refresh deterministic; the question belongs to a CI plan, not here.
- `@blazetrails/arel` origin decision — explicitly out of scope per kickoff.
- Per-test exclusions or skip-management — orthogonal to fetching.

## 10. Cross-references

- `docs/rails-file-structure-mirror-plan.md` — parallel plan; must consume the same `vendor/sources.ts`.
- `scripts/api-compare/conventions.ts` — naming-exception registry; unaffected by this work but consulted by downstream tools that _do_ change.
- PR #1483 — full clone replaced sparse-checkout in `fetch-rails.sh`; the new fetcher inherits the same full-clone policy.
- Memory: `reference_rails_source_path.md` — must be updated in wave 7.
- `scripts/parity/schema/ruby/Gemfile:5` — silent version drift risk; wave 7 ties it to `SOURCES`.
