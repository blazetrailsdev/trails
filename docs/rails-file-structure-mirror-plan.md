# Rails file-structure mirror — plan

Status: planning only. No code in this PR.

`scripts/api-compare/` validates that **methods exist** at the right
Rails-mirroring file paths. It does **not** validate **structure within a file**
— definition order, module nesting, public/private grouping, position of
`include` / `extend` / constants, or section comments. This plan designs a
data-driven ESLint rule (`blazetrails/rails-file-structure`) backed by a
cached Ruby analysis of `vendor/rails/`.

Style match: [activerecord-type-audit.md](activerecord-type-audit.md) +
[actionpack-restructure-audit.md](actionpack-restructure-audit.md).
This is the _within-file_ analog of the actionpack restructure audit.

> **Note:** The vendor migration (waves tracked in `vendor/README.md`, starting with [PR #1559](https://github.com/blazetrailsdev/trails/pull/1559)) is complete. Rails source lives at
> `vendor/rails/` via `vendor/sources.ts`. The structure extractor should consume
> `resolvePath("activerecord", "lib")` etc. via the env-var contract defined there.
>
> The dev-package set is the union of two registries that must stay
> in sync: `extract-ruby-api.rb:32–41` `PACKAGE_DIRS` (Ruby side) and
> `scripts/api-compare/config.ts:7–17` `PACKAGES` (TS side). The TS side is
> the superset and contains **`arel`, `activemodel`, `activerecord`,
> `activesupport`, `actiondispatch`, `actioncontroller`,
> `abstractcontroller`, `actionview`, `trailties`** — note the actionpack
> three-way split (actiondispatch + actioncontroller + abstractcontroller,
> mapped to the `actionpack` directory via `PACKAGE_DIR_OVERRIDES` at
> `config.ts:21–25`) and the inclusion of arel. The Ruby side at
> `extract-ruby-api.rb:32–41` currently omits `abstractcontroller`, but
> Rails source does have a dedicated `actionpack/lib/abstract_controller/`
> directory (verified: `base.rb`, `callbacks.rb`, `caching.rb`, …) and
> the trails side has `packages/actionpack/src/abstractcontroller/`. PR 1
> of the wave plan adds `PACKAGE_DIRS["abstractcontroller"]` pointing at
> `actionpack/lib/abstract_controller` — a 1-line registry addition that
> brings the Ruby side into parity with the TS side before the structure
> extractor runs. The day-one scope is therefore exactly the 9 TS-side
> keys.

## 1. Headline numbers

Source TS files in Rails-mirroring packages (excluding `*.test.ts`,
`*.test-d.ts`, `*.d.ts`):

| package       |   files | notes                                                                                                                                             |
| ------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| activerecord  |     430 | dominant; biggest files 1.7k–5.4k LOC                                                                                                             |
| activesupport |      97 |                                                                                                                                                   |
| arel          |      89 |                                                                                                                                                   |
| actionpack    |      89 | 50 actioncontroller + 37 actiondispatch + 1 abstractcontroller + index; restructure in progress ([`*-audit.md`](actionpack-restructure-audit.md)) |
| activemodel   |      72 |                                                                                                                                                   |
| trailties     |      23 | Rails source: `railties/lib/rails/`                                                                                                               |
| actionview    |      13 |                                                                                                                                                   |
| **total**     | **813** |                                                                                                                                                   |

The actionpack split matters for §3.1 path mapping — the package is itself a
union of Rails directories, so `conventions.ts` already disambiguates by
subdir.

Largest TS files (LOC, source-only — `wc -l` output on the checkout
recorded in this PR's head commit; Copilot reviewers occasionally see
off-by-one counts due to trailing-newline handling):

| file                                                         |  LOC |
| ------------------------------------------------------------ | ---: |
| `activerecord/src/connection-adapters/postgresql-adapter.ts` | 5373 |
| `activerecord/src/relation.ts`                               | 5154 |
| `activerecord/src/base.ts`                                   | 3464 |
| `activerecord/src/migration.ts`                              | 2976 |
| `activerecord/src/connection-adapters/sqlite3-adapter.ts`    | 2330 |
| `activemodel/src/model.ts`                                   | 2316 |
| `activerecord/src/relation/query-methods.ts`                 | 2292 |
| `activerecord/src/associations.ts`                           | 2256 |
| `activerecord/src/associations/collection-proxy.ts`          | 2243 |
| `arel/src/visitors/to-sql.ts`                                | 1902 |

Eyeball survey — judgments below come from a quick read of `persistence.ts`
and `callbacks.ts` against their Rails counterparts plus pattern-inference
across the other named files; treat the rest as "expected" not "verified".
The ground-truth survey is PR 1's first deliverable (§6):

| file                      |                       method-order                       | nesting | visibility groups |
| ------------------------- | :------------------------------------------------------: | :-----: | :---------------: |
| `persistence.ts`          |                         ~partial                         |  flat   |   not preserved   |
| `relation.ts`             |                        divergent                         |  flat   |   not preserved   |
| `base.ts`                 | partly, lots of mixin re-export ordering by import block |  flat   |   not preserved   |
| `validations.ts`          |                          close                           |  flat   |   not preserved   |
| `callbacks.ts`            |                          close                           |  flat   |      partial      |
| `migration.ts`            |                        divergent                         |  mixed  |   not preserved   |
| `arel/visitors/to-sql.ts` |                          close                           |   n/a   |   not preserved   |
| `model.ts` (activemodel)  |                          close                           |  flat   |   not preserved   |
| `query-methods.ts`        |                        divergent                         |   n/a   |   not preserved   |
| `enum.ts`                 |                          close                           |  flat   |      partial      |

**Rough estimate**: ~25% of files already close (≤5 reorder moves to match
Rails); ~50% partially aligned (5–20 moves); ~25% diverged enough that
re-sorting is mechanical-but-large. Visibility groupings are essentially
never preserved — Rails uses `private` keyword blocks; we use `@internal`
JSDoc plus underscore-prefix convention, with no contiguous block.

These are rough — the Ruby analysis pipeline in §2 produces the ground-truth
numbers and is what the wave plan is sized against.

## 2. The Ruby analysis pipeline

### 2.1 Extractor

Reuse the Ripper-based machinery already in
[`scripts/api-compare/extract-ruby-api.rb`](../scripts/api-compare/extract-ruby-api.rb).
The current extractor already captures namespaces, visibility, methods,
parameters, and dependency references; **structure data is mostly there,
just not emitted**. The new script adds:

- Per-method `line` (start) and `endLine`.
- Per-method `order` index _within its enclosing module_ (1-based).
- Module/class tree with start/end lines (not just dotted paths).
- `include` / `extend` / `prepend` directives — name, line, order.
- Constants — name, line, literal value when present.
- Section comments — runs of pure `#` lines preceded and followed by blank
  lines or method definitions. Captured as `{ line, text, followedBy: <next
method/include/const name> }` so the rule can locate "the comment that
  introduces section X" without doing fuzzy match.
- `attr_reader` / `attr_writer` / `attr_accessor` declarations — name, line,
  order (these are Ruby's analog of TS class fields).

Implementation sketch:

```ruby
# new file: scripts/rails-structure/extract-rails-structure.rb
# 1. Reuse PACKAGE_DIRS + walk() from extract-ruby-api.rb.
# 2. Hook process_def to record { name, visibility, line, endLine,
#    order_within_module }.
# 3. Hook on_module / on_class to record start_line, end_line, parent path.
# 4. Add on_command / on_command_call detection for `include X`,
#    `extend X`, `prepend X`, and `attr_*` (already partially handled).
# 5. Pre-pass over raw source for comment-block detection (Ripper's
#    on_comment fires per-line; group adjacent comment lines).
```

### 2.2 JSON cache shape

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-14T…",
  "railsSha": "<git rev of vendor/rails>",
  "files": {
    "active_record/persistence.rb": {
      "modules": [
        {
          "path": "ActiveRecord::Persistence",
          "kind": "module",
          "startLine": 5,
          "endLine": 920,
          "parent": null,
          "includes": [],
          "extends": [],
          "constants": [],
          "members": [
            {
              "kind": "method",
              "name": "save",
              "visibility": "public",
              "scope": "instance",
              "line": 250,
              "endLine": 270,
              "order": 1,
            },
            {
              "kind": "method",
              "name": "save!",
              "visibility": "public",
              "scope": "instance",
              "line": 272,
              "endLine": 290,
              "order": 2,
            },
            {
              "kind": "section",
              "text": "Internal callbacks",
              "line": 299,
              "followedBy": "destroy_associations",
            },
            {
              "kind": "method",
              "name": "destroy_associations",
              "visibility": "private",
              "scope": "instance",
              "line": 301,
              "endLine": 305,
              "order": 3,
            },
          ],
          "children": [{ "path": "ActiveRecord::Persistence::ClassMethods", "…": "…" }],
        },
      ],
    },
  },
}
```

Flat `members` array with `order` is the central design decision: it lets
the ESLint rule produce O(n) diffs by walking members in declaration order
on both sides.

### 2.3 Cache location, regeneration, CI

- **Location**: `scripts/rails-structure/output/rails-structure.json`.
- **Committed**: **no** — generated locally, matching every existing
  Rails-derived manifest in the repo. Verified after a second Copilot
  pass: both `scripts/api-compare/output/rails-api.json` (gitignored at
  `scripts/api-compare/.gitignore`) and `eslint/rails-private-methods.json`
  (gitignored at `.gitignore:18`) are regenerated, not committed. There
  is no committed-cache precedent in this repo. Implications:
  - The ESLint rule must gracefully degrade when the cache is missing,
    exactly like `blazetrails/rails-private-jsdoc` does today — it
    consults `eslint/rails-private-methods.json` when present, otherwise
    treats the allowlist as empty rather than firing on every file.
  - First-run developers will see the structure rule as a no-op until
    they run `pnpm api:compare` (or the underlying
    `ruby scripts/api-compare/extract-ruby-api.rb` +
    `ruby scripts/rails-structure/extract-rails-structure.rb`). The rule
    prints a one-time "cache missing — run `pnpm api:compare`" diagnostic
    at startup.
  - Ruby remains a dev/CI dependency only, same as today.
- **Refresh trigger**: same gate as
  [`extract-ruby-api.rb`](../scripts/api-compare/extract-ruby-api.rb) lines
  16–28 — compare cache mtime to `vendor/rails/.git/HEAD`, honour
  `API_COMPARE_FORCE=1`. Regeneration runs whenever the extractor is
  invoked, locally via `pnpm api:compare` or in CI via the explicit
  workflow step (next bullet).
- **CI integration**: verified against `.github/workflows/ci.yml`. The
  default `lint` job (line 130) runs `pnpm lint` only — no Rails fetch,
  no Ruby — so the structure rule is a no-op there, exactly like
  `blazetrails/rails-private-jsdoc` is today. The job that actually
  enforces Rails-derived rules is **`rails-comparison`** (line 372),
  whose full step sequence at ci.yml:388–412 is: (1) fetch-rails.sh,
  (2) fetch-rails-tests.sh, (3) `ruby extract-ruby-api.rb`,
  (4) `ruby extract-ruby-tests.rb`, (5) `tsx extract-ts-api.ts && tsx
  compare.ts`, (6) `tsx compare.ts --privates`, (7) `tsx lint-deps.ts`,
  (8) `tsx build-rails-privates-manifest.ts && eslint packages/arel/src`,
  (9) test-compare. The Rails-derived ESLint gate is step 8; steps 5–7
  validate api:compare itself. The structure rule plugs in with two new steps
  inserted after `extract-ruby-api.rb`: (1) `ruby
extract-rails-structure.rb` → `output/rails-structure.json`, (2) `tsx
build-rails-structure-manifest.ts` → `eslint/rails-file-structure.cache.json`.
  The existing line-409 `eslint` invocation expands to cover all
  Rails-mirroring packages (not just `packages/arel/src`), picking up the
  new manifest. The structure rule's real gate is the `rails-comparison`
  job; this asymmetry with the default `lint` job is explicit and matches
  the existing precedent for `rails-private-jsdoc`.
- **Local dev**: extend `prelint` (`package.json:13`) to also run
  `tsx build-rails-structure-manifest.ts`. On a fresh clone before
  `pnpm api:compare` ever runs, the underlying `output/rails-api.json`
  and `output/rails-structure.json` won't exist; both manifest builders
  already handle that case (lines 56–62 of
  `build-rails-privates-manifest.ts` emit an empty manifest with a
  console warning). The new builder mirrors that handling.

### 2.4 Index for O(1) ESLint lookup

Two-layer file layout, with a clear boundary between **tooling artifacts**
(under `scripts/rails-structure/output/`, raw Ruby JSON for downstream
tools) and **runtime ESLint inputs** (under `eslint/`, the only files the
rule reads at lint time):

| file                                                  | producer                            | consumer                            | role                     |
| ----------------------------------------------------- | ----------------------------------- | ----------------------------------- | ------------------------ |
| `scripts/rails-structure/output/rails-structure.json` | `extract-rails-structure.rb`        | `build-rails-structure-manifest.ts` | tooling-only             |
| `eslint/rails-file-structure.cache.json`              | `build-rails-structure-manifest.ts` | **ESLint rule (runtime)**           | per-file member lists    |
| `eslint/rails-file-structure.index.json`              | `build-rails-structure-manifest.ts` | **ESLint rule (runtime)**           | TS-path → Rails-path map |

The ESLint rule never reads `scripts/rails-structure/output/` directly.
That keeps the rule's dependency surface to two stable JSON files,
co-located in `eslint/` alongside `rails-private-methods.json` so they
can't drift apart.

The index file:

```jsonc
{
  // keyed by TS-relative path, value is the entry to load lazily.
  "packages/activerecord/src/persistence.ts": "active_record/persistence.rb",
}
```

The ESLint rule loads `eslint/rails-file-structure.index.json` at construction
time and `eslint/rails-file-structure.cache.json` lazily on first violation,
both kept in module scope. It never touches the tooling JSON under
`scripts/rails-structure/output/`.

## 3. TypeScript-side analysis

### 3.1 Path & symbol mapping

Reuse the data encoded in
[`scripts/api-compare/conventions.ts`](../scripts/api-compare/conventions.ts):

- TS↔Ruby filename mapping (kebab→snake, `trailtie`↔`railtie`, package-root
  conventions).
- Method renames (`saveBang` ↔ `save!`, etc.).
- Symbol normalization for the api:compare matcher.

**Runtime constraint**: ESLint loads rules under Node without a TS loader,
and the repo ships no built `scripts/api-compare/conventions.js` artifact —
so the rule cannot `import` `conventions.ts` directly. Choose one of:

- **(a) JSON sidecar** — `pnpm api:compare` writes a pure-data
  `eslint/rails-conventions.json` (file map + rename map + package roots)
  alongside `rails-private-methods.json`. The rule reads this at startup.
  Pure data, zero runtime TS dependency. **Recommended.** Matches the
  data-driven pattern used by `blazetrails/rails-private-jsdoc`.
- (b) Move the helpers into a published package (e.g.
  `@blazetrails/api-compare-conventions`) so ESLint can import compiled
  JS. Heavier; only justified if other tooling needs the same logic.
- (c) Emit a small generated `eslint/rails-conventions.generated.mjs`
  alongside the cache. Same data, executable form. Slight runtime cost
  vs (a); no clear benefit.

Choosing (a). When `conventions.ts` gains a new rename, the next
`pnpm api:compare` run regenerates the JSON and the rule picks it up —
single source of truth preserved without runtime coupling.

### 3.2 TS analyzer — reuse `extract-ts-api.ts`

[`scripts/api-compare/extract-ts-api.ts`](../scripts/api-compare/extract-ts-api.ts)
already walks every Rails-mirroring package with the **TypeScript Compiler
API** (not `@typescript-eslint/parser`), produces a per-package cached
manifest under `output/ts-api-cache/<pkg>.json` keyed by a content
fingerprint, and is invalidated by a `SCHEMA_VERSION` bump. The structure
analyzer mirrors that design:

- New file: `scripts/rails-structure/extract-ts-structure.ts`, same Worker
  pattern, same `output/ts-structure-cache/<pkg>.json` layout, same
  `API_COMPARE_FORCE=1` escape hatch.
- The ESLint rule does **not** re-walk source from scratch on every lint
  invocation. It reads the cached structure manifest produced alongside
  `ts-api.json`. Per-file: O(1) cache lookup → O(n) member diff.
- For incremental editor lint, the rule falls back to a per-file ESLint AST
  walk if the cache entry is stale (mtime-newer-than-cache check); the walk
  uses the eslint TS parser AST that's already constructed for the file
  being linted, so the cost is only the visitor pass.

Per-file the analyzer collects, in source order:

- Top-level `import` statements.
- Top-level `export const`, `export function`, `export class`, `export
type`, `export interface`.
- For each class: method definitions, `static` blocks, field declarations.
- `include(Base, …)` calls from `@blazetrails/activesupport` (recognized
  by callee identifier — they are the Ruby-`include` analog).
- `this`-typed top-level `function` exports (the
  [CLAUDE.md mixin pattern](../CLAUDE.md)) — these mirror Ruby instance
  methods, not file-scope functions.
- JSDoc `@internal` markers (visibility analog).

The output is a TS-side `members` array with the same shape as the Ruby
side — `{ kind, name, visibility, order }` — which is then diffed against
the cached Ruby `members`.

### 3.3 Module-nesting strategy — decide once

Ruby files often look like `module ActiveRecord; module Persistence; module
ClassMethods; …; end; end; end`. We need to pick exactly one TS mapping
pattern and enforce it:

| option                                                                                                          | what it looks like                                                                              | pros                                                 | cons                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A. TS namespaces                                                                                                | `export namespace Persistence { export namespace ClassMethods { … } }`                          | structural 1:1                                       | non-idiomatic; namespaces are deprecated in modern TS; breaks tree-shaking; clashes with our current file-per-module convention |
| B. File-per-module, sibling files for nested modules                                                            | `persistence.ts` exports module-level; `persistence/class-methods.ts` exports the nested module | already what we do mostly; tree-shakable             | doesn't mirror within-file nesting at all                                                                                       |
| C. Hybrid — file is the outermost module; nested modules become **adjacent named exports** with a comment fence | `persistence.ts` has `// === ClassMethods ===` sections grouping exports                        | gives us a _positional_ mirror without TS namespaces | order-only mirror; not a true nesting check                                                                                     |

**Recommendation: B + C.** Adopt B as the structural convention (matches
current practice and `api-compare`'s file-path expectations), then layer C
on within files that contain multiple Ruby submodules. The ESLint rule
checks **within-file order** and treats sibling-file nesting as already
correct so long as the file path matches `conventions.ts`. Option A is
rejected — it would require a sweeping rewrite for no behavioural win.

## 4. Divergence catalogue

Inventoried from spot-checks against current code. Each divergence has a
**conformance rule** — where the TS-only content lives so the linter can
ignore it without false positives.

| #   | divergence                                                                                                                                                                                                                                                       | conformance rule                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `import` block at file top (no Ruby counterpart — Rails `require`s are inline).                                                                                                                                                                                  | Imports are **excluded from the Rails-vs-TS structural diff** — their position never contributes to a method-order finding. Separately, an invariant check fires if any non-import top-level node appears before the last `import`. Two independent checks: structural-diff (skips imports) and a top-of-file invariant. |
| 2   | `interface X` / `type Y` / generic-only declarations (no Ruby counterpart).                                                                                                                                                                                      | Pinned **directly above** the first symbol they describe; if file-scope, pinned at top after imports. Treated as zero-cost insertions in the diff.                                                                                                                                                                       |
| 3   | `this`-typed `export function` (CLAUDE.md mixin pattern — Ruby instance method analog).                                                                                                                                                                          | Counted as instance method of the host class declared in the same package's `*.ts` file that wires it up. Position-checked against the Ruby instance-method order.                                                                                                                                                       |
| 4   | `include(Base, MixinMod)` from activesupport.                                                                                                                                                                                                                    | Equivalent to Ruby's `include Mod`. Position-checked against Ruby `include` order.                                                                                                                                                                                                                                       |
| 5   | `_underscored` helpers.                                                                                                                                                                                                                                          | Treated as `private` visibility regardless of `@internal` JSDoc presence. (`@internal` is required by `blazetrails/rails-private-jsdoc` — orthogonal.)                                                                                                                                                                   |
| 6   | `defineAttributes()` / `defineSchema()` blocks in test files.                                                                                                                                                                                                    | Test files are out of scope (§8).                                                                                                                                                                                                                                                                                        |
| 7   | `constructor` (TS) ↔ `initialize` (Ruby).                                                                                                                                                                                                                        | Linter aliases them in the order diff.                                                                                                                                                                                                                                                                                   |
| 8   | TS getter/setter pairs (`get foo()` + `set foo()`) often emitted for Ruby `attr_accessor`.                                                                                                                                                                       | Treated as a single position-anchored member named after the property.                                                                                                                                                                                                                                                   |
| 9   | `class Foo extends include(Base, Mod)` pattern.                                                                                                                                                                                                                  | The `include(…)` argument list contributes module-level `include` directives in source-order.                                                                                                                                                                                                                            |
| 10  | `// removed comments for Ruby methods we deleted` — CLAUDE.md forbids this; not a divergence the linter needs to model.                                                                                                                                          | n/a                                                                                                                                                                                                                                                                                                                      |
| 11  | Files that exist in TS but not in Rails (e.g., trails-only infra).                                                                                                                                                                                               | Excluded — no Rails counterpart → no structure check.                                                                                                                                                                                                                                                                    |
| 12  | Multiple Ruby files merged into one TS file (rare; documented in `moves.ts`).                                                                                                                                                                                    | Linter consults `moves.ts` and checks the union, keeping each source file's relative order intact.                                                                                                                                                                                                                       |
| 13  | `@internal` JSDoc on methods that are `public` in Ruby — usually means the method is Rails-private-but-our-public, or vice versa.                                                                                                                                | Visibility check uses the Ruby visibility as ground truth; conflict reported.                                                                                                                                                                                                                                            |
| 14  | Class macros (Rails `define_callbacks` generating `before_save :foo`) ↔ TS exported helper functions (`beforeSave(...)`). E.g. `callbacks.ts` exposes `beforeSave`/`afterSave` as top-level `export function`s where Rails generates them via the callbacks DSL. | Helpers anchored by **call sites** in the host class file, not by name parity with Rails methods. No position check inside the helper file itself.                                                                                                                                                                       |
| 15  | Single Ruby file → multiple TS files (e.g. `associations/builder.rb` split into `associations/builder/*.ts`). Inverse of #12.                                                                                                                                    | Documented via `moves.ts` direction flags; analyzer takes the union of TS files as the comparison target for that Ruby file, in the order declared in `moves.ts`.                                                                                                                                                        |

### 4.1 Worked example — `callbacks.ts` vs `callbacks.rb`

A concrete demonstration of what the analyzer produces. Trimmed for clarity:

**Ruby side** (`active_record/callbacks.rb`):

```
module ActiveRecord::Callbacks
  CALLBACKS = […]                       # constant, order 1
  include ActiveSupport::Callbacks      # include, order 2
  module ClassMethods                   # nested module
    def after_initialize(*, &block); …  # public, order 1
    def after_find(*, &block); …        # public, order 2
    def after_touch(*, &block); …       # public, order 3
  end
  def destroy                           # public instance, order 1
  def touch(*, **)                      # public instance, order 2
  private
  def create_or_update(**); …           # private, order 3
  def _create_record; …                 # private, order 4
end
```

**TS side** (`activerecord/src/callbacks.ts`):

```ts
export type CallbackOptions<…>          // type, order 1 (zero-cost; §4 row 2)
export function beforeValidation(…)     // helper, anchored to base.ts call site (§4 row 14)
export function afterValidation(…)
export function beforeSave(…)
…
```

**Diff produced by the analyzer**:

1. `CALLBACKS` constant: present in Ruby, absent in TS — Rails-only constant
   (callback names are `string[]` literals in TS). Not an error: constants
   with no TS counterpart are skipped (§4 row 11 generalized).
2. `include ActiveSupport::Callbacks`: present in Ruby, absent in TS — the
   wiring lives in `base.ts` via `include(Base, Callbacks)`. The rule
   reports this as an `include-position` finding on `base.ts`, not on
   `callbacks.ts`.
3. `destroy`, `touch`, `create_or_update`, `_create_record`: Ruby instance
   methods on the host. None of these are in `callbacks.ts` — they live in
   `persistence.ts` (`destroy`) and `core.ts` (`touch`). Cross-file:
   resolved via `conventions.ts` package-wide member index, then the rule
   checks position in those files instead.
4. `beforeValidation` / `afterValidation` / …: TS-side helpers without
   Ruby `def` counterparts. Treated by row 14: anchored to call sites in
   `base.ts` (`beforeValidation(this, …)`), not position-checked here.

Net: `callbacks.ts` produces zero position violations. The cross-file
resolution is the load-bearing piece. Mechanism: PR 2 emits a
**package-wide symbol → file** index (built by walking the cached TS
manifest), so when a Ruby method has no same-file TS counterpart the rule
asks the index "where does `destroy` live in package `activerecord`?" and
shifts the position check to that file. `moves.ts` is consulted only when
the host file itself is a documented merge or split — it does not need to
be touched for cross-file finds.

## 5. ESLint rule design

### 5.1 Rule

- **Name**: shipped as a **family of sibling rules**, one per check, not
  a single rule with internal severity dispatch. ESLint severity is
  configured per rule entry in `eslint.config.mjs` and cannot vary per
  finding inside one rule, so we register:
  - `blazetrails/rails-file-structure-method-order`
  - `blazetrails/rails-file-structure-include-position`
  - `blazetrails/rails-file-structure-visibility-grouping`
  - `blazetrails/rails-file-structure-module-nesting`

  All four share one implementation module that exports a per-check
  visitor + a shared cache loader (loaded once at plugin construction,
  reused across rules). Users can set warn/error independently per rule,
  matching the rollout staging in this section.

- **Family**: data-driven, like `blazetrails/rails-private-jsdoc` and
  `blazetrails/nie-requires-annotation`. Reuses their plumbing in
  `eslint.config.mjs`.
- **Config schema** (per rule): `{ suppressFile?: boolean }`. The choice
  of which checks to enable is expressed by enabling/disabling the
  sibling rules independently.
- **Severity** (one entry per sibling rule in `eslint.config.mjs`):
  `rails-file-structure-method-order` → warn during rollout, flip to
  error in the final wave. `rails-file-structure-visibility-grouping`
  → warn permanently (high false-positive risk; see §7).
  `rails-file-structure-include-position` → error from day one (small
  surface). `rails-file-structure-module-nesting` → warn-only.
- **File-level suppression**: `/* eslint-disable
blazetrails/rails-file-structure */` works as usual. Also support a
  positive opt-out: a top-of-file
  `/** @rails-structure-skip reason="…" */` JSDoc, indexed by the rule for
  reporting (we want to see which files have escapes).

### 5.2 Autofix scope

| check               |                                                         autofix?                                                         | notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | :----------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| method-order        | **yes**, but **opt-in** via `--fix` only when no `// @rails-order-skip-next` comment is present near the affected member | safe for pure method moves; never moves across an `include()` because of prototype-chain order risk (§7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| include-position    |                                                 yes, with snapshot regen                                                 | **Runtime-safe but emit-changing**: `findIncludeCalls()` in `packages/activerecord/src/type-virtualization/virtualize.ts:144–196` walks `include()` calls in source order, then emits `interface Foo extends Included<typeof A>, Included<typeof B> {}` heritage clauses in that same encounter order. Reordering includes changes the emitted text (and `.d.ts` snapshots) even though declaration-merge resolution is order-agnostic. Autofix must regenerate snapshots in the same commit; PR 4's CI step runs `pnpm build` after the lint fix. Prototype-chain order at runtime is preserved because the autofix moves whole `include()` statements as units, never re-orders multiple modules inside one call. |
| visibility-grouping |                                                            no                                                            | grouping is semantic; require manual edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| module-nesting      |                                                            no                                                            | requires structural decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

The autofix uses ESLint's `fixer.replaceTextRange` over whole-statement
ranges; it cannot interleave or split statements. If two adjacent members
need to swap, the fix is one range covering both.

### 5.3 Performance

- Cache load: one JSON.parse on first violation, kept in module scope.
- **Parallel ESLint workers**: ESLint can run with `--concurrency`,
  spawning one worker per CPU. Each worker pays the JSON.parse cost
  independently. Mitigations: (a) ship a pre-built CommonJS module
  (`rails-structure.cjs`) that `require()` caches at V8 load time, (b) use
  per-file partitions so a worker only pays for entries it sees. With the
  index in §2.4, a worker that lints `persistence.ts` reads exactly one
  `active_record/persistence.rb` entry from a sharded JSON file
  (`output/by-file/active_record/persistence.json`). Recommendation: ship
  both the monolithic `rails-structure.json` (for tooling) and a sharded
  per-file directory (for the lint rule's hot path).
- Per-file: O(n) walk through the TS AST + O(n) diff against the cached
  Ruby `members` array. n is typically <200 per file.
- The index in §2.4 ensures path lookup is a single hash hit.

### 5.4 Integration

- `eslint.config.mjs` — add the rule to the same plugin object that
  registers `rails-private-jsdoc`, gated by glob to Rails-mirroring
  packages.
- The cache file is read at rule-construction time; if absent, the rule
  reports a single "cache missing — run pnpm api:compare" diagnostic
  rather than failing all files.
- Tests in `eslint/rails-file-structure.test.mjs` follow the
  `RuleTester` pattern used by sibling rules.

## 6. Wave-based rollout

Each PR sized to ≤300 LOC per [CLAUDE.md](../CLAUDE.md). Estimates are
implementation LOC excluding generated JSON.

| wave      | scope                                                                                                    |  est. LOC | notes                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR 1**  | Ruby extractor + JSON cache (generated, not committed) + CI workflow step                                |      ~250 | adds `scripts/rails-structure/extract-rails-structure.rb` + generated `output/rails-structure.json`; CI step runs the extractor directly (mirrors `.github/workflows/ci.yml:396` for `extract-ruby-api.rb`); no baseline commit         |
| **PR 2**  | Manifest builder + conventions sidecar + plumb cache into `pnpm api:compare`                             |      ~200 | reads `output/rails-structure.json`; emits `eslint/rails-file-structure.{cache,index}.json` **and** `eslint/rails-conventions.json` (the runtime sidecar §3.1 requires, derived from `scripts/api-compare/conventions.ts`); no rule yet |
| **PR 3**  | ESLint rule skeleton (loads cache, registers plugin, supports `@rails-structure-skip`); no checks active |      ~150 | establishes plumbing + RuleTester scaffold                                                                                                                                                                                              |
| **PR 4**  | `include-position` check (smallest surface, lowest false-positive rate)                                  |      ~200 | likely <20 violations across repo; cleanups fold into PR 8+                                                                                                                                                                             |
| **PR 5**  | `method-order` check, **warn-only**; emit per-file violation counts to a report file for triage          |      ~200 | the report drives subsequent cleanup waves                                                                                                                                                                                              |
| **PR 6**  | `visibility-grouping` check, **warn-only**, with `@internal` JSDoc as the visibility signal              |      ~150 |                                                                                                                                                                                                                                         |
| **PR 7**  | `module-nesting` check (option B/C from §3.3) — warn-only                                                |      ~150 |                                                                                                                                                                                                                                         |
| **PR 8+** | Cleanup waves — auto-sort + manual cleanups, one Rails source file (or small cluster) per PR             | ~250 each | tracked against the §1 estimate of ~75% of files needing some sort                                                                                                                                                                      |
| **Final** | Flip `method-order` and `visibility-grouping` to error; close the rule out                               |       ~50 |                                                                                                                                                                                                                                         |

Total infra: ~1.1k LOC across 7 PRs. Cleanup waves: bounded by violation
count from PR 5's report — estimate 15–30 PRs across all packages, parallelizable.

## 7. Risks + open questions

- **Hoisting / TDZ.** Auto-resort can move a `class Foo extends Bar`
  before `class Bar` is declared, or move a `const x = …` past a use
  site. The autofix MUST do a topological check (use TS's
  `findReferences`/scope analysis) before emitting a swap. Open question:
  do we accept the perf cost in-rule, or pre-compute a "safe to swap"
  bit in the cache by analyzing the Ruby side? Recommendation: skip
  swaps that cross any `class`/`function` declaration the AST flags as
  used before the proposed new position.
- **`include()` order matters at runtime.** Activesupport's `include()`
  manipulates the prototype chain in argument order. Reordering
  `include()` calls or moving them across method definitions can change
  behavior. PR 4's autofix is conservative here — it moves `include()`
  toward the Rails position only when no method definitions sit between
  source and target positions.
- **trails-tsc include() bridge ([PR #1150](https://github.com/blazetrailsdev/trails/pull/1150)).**
  The plugin emits interface-merges in source order. Method-order
  changes that re-sort `include()` callees can change the emitted
  interface declaration order. Behavior is identical (interface merges
  are commutative), but generated `.d.ts` snapshots drift — add a
  regen-snapshots step to the cleanup waves.
- **`@internal` markers** must be preserved across method moves. ESLint's
  fixer operates on text ranges, so as long as we include the leading
  JSDoc in the swap range, the markers stay attached. Add a unit test.
- **Rails source itself is inconsistent.** Some Rails files have methods
  in arbitrary order (e.g., `migration.rb` history). When the Ruby
  ground truth is non-canonical, the rule still reports diffs against
  it — by design. Suppression via `@rails-structure-skip
reason="rails-source-is-itself-disordered"` is the escape hatch and
  produces a tracked report.
- **Test files.** Out of scope (§8). They have no Ruby counterpart
  in a structure-preserving way (Minitest's structure ≠ Vitest's).
- **Cross-package symbols.** Methods that live in a different package
  than their Rails counterpart (e.g., the `Errors<T>` arc, certain Arel
  helpers) are caught by the path-map in `conventions.ts`. If the path
  map has no entry for a TS file, the rule skips it silently — that's
  the same behaviour as `api:compare` and is the right default.
- **Merged files.** Some TS files combine multiple Ruby files
  (`moves.ts`). The rule consults `moves.ts` and validates each chunk's
  internal order, but does not enforce inter-chunk ordering — chunk
  groupings stay as authors place them.
- **Ripper limitations.** Originally flagged here as a risk; verified
  resolved — `extract-ruby-api.rb` already handles `private(def foo)` in
  `process_method_add_arg` (line 491) by temporarily switching visibility
  and recursing into the nested `def`. No action needed; structure
  extractor inherits the behaviour by reusing `process_method_add_arg`.

## 8. Out of scope

- Actual file re-sorting cleanups (handled in PR 8+ cleanup waves).
- Test files (`**/*.test.ts`, `**/*.test-d.ts`).
- DX type tests (`packages/*/dx-tests/**`, `packages/*/virtualized-dx-tests/**`)
  — these pin TS public-type contracts and have no Ruby counterpart.
- Type-only files (`**/*.d.ts`).
- Generated files (`packages/*/dist/**`, fixture outputs).
- Files explicitly listed in
  [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts).
- Restructuring across files — the
  [actionpack restructure audit](actionpack-restructure-audit.md) covers
  inter-file moves; this plan is strictly within-file.
- Comment-content equality — only _positions_ of section comments are
  checked, never their text.

## 9. Cross-references

- [docs/activerecord-type-audit.md](activerecord-type-audit.md) — audit →
  wave-plan style precedent.
- [docs/actionpack-restructure-audit.md](actionpack-restructure-audit.md) —
  the directory-level analog to this within-file plan.
- [scripts/api-compare/conventions.ts](../scripts/api-compare/conventions.ts) —
  TS↔Ruby naming/path mapping registry; reused by the new rule.
- `vendor/README.md` — vendor migration history and wave PRs; `vendor/sources.ts` is the source of truth for
  fetched Ruby source locations.
- [scripts/api-compare/extract-ruby-api.rb](../scripts/api-compare/extract-ruby-api.rb) —
  precedent Ruby extractor; new structure extractor copies its caching gate
  and PACKAGE_DIRS map.
- [scripts/api-compare/extract-ts-api.ts](../scripts/api-compare/extract-ts-api.ts) —
  precedent TS extractor; the new TS structure analyzer mirrors its
  per-package cache layout, fingerprint scheme, and `SCHEMA_VERSION`
  invalidation.
- [scripts/api-compare/moves.ts](../scripts/api-compare/moves.ts) —
  multi-source-file merges; consulted by the rule.
- [eslint/nie-requires-annotation.mjs](../eslint/nie-requires-annotation.mjs)
  and [eslint/rails-private-jsdoc.mjs](../eslint/rails-private-jsdoc.mjs) —
  data-driven rule precedents; same plugin object, same RuleTester pattern.
- [CLAUDE.md](../CLAUDE.md) — `this`-typed mixin convention; PR-size limit
  driving the wave plan.
