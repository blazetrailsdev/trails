# actionpack: structural audit + re-org plan

Audit of `packages/actionpack/src/` directory layout against
`actionpack/lib/` in Rails source
(`scripts/api-compare/.rails-source/actionpack/lib/`). Method-level
parity is tracked elsewhere
([actioncontroller-100-percent.md](actioncontroller-100-percent.md),
[actiondispatch-100-percent.md](actiondispatch-100-percent.md)) — this
doc covers **directory layout, file placement, and missing
infrastructure files only**.

## Headline numbers

| Subtree                                                                                                      | Rails files         | Our files                                          | Coverage (files)       | Notes                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abstract_controller/`                                                                                       | 14                  | 0 (mashed into 1 file)                             | **0%**                 | We have a single `actioncontroller/abstract-controller.ts` collapsing the whole Rails subtree.                                                                                                                                  |
| `action_controller/` (non-metal)                                                                             | 13                  | 16                                                 | ≥100%                  | Naming/placement mostly aligned. 3 TS files map elsewhere (`abstract-controller.ts`, `integration-test.ts`, `params-wrapper.ts` — the last duplicates `metal/params-wrapper.ts`). Subdir divergence (`railties` → `trailties`). |
| `action_controller/metal/`                                                                                   | 32                  | 33                                                 | ≥100%                  | Metal subtree is healthy. 1 extra TS file (`header-utils.ts`, no Rails counterpart).                                                                                                                                            |
| `action_dispatch/` (root)                                                                                    | 7                   | 1 (`index.ts`) + 15 flat root files                | **mixed**              | We have files at the dispatch root that Rails places under `http/` or `middleware/`.                                                                                                                                            |
| `action_dispatch/http/`                                                                                      | 19                  | 0 (`http/` dir missing)                            | **0%**                 | Equivalents live at our `actiondispatch/` root or `actiondispatch/dispatch/`.                                                                                                                                                   |
| `action_dispatch/middleware/`                                                                                | 20 (+ `session/` 4) | 7 + `session/` 1                                   | **~30%**               | 15+ middleware files entirely missing.                                                                                                                                                                                          |
| `action_dispatch/journey/`                                                                                   | 14                  | 0                                                  | **0%**                 | Entire routing engine subtree absent.                                                                                                                                                                                           |
| `action_dispatch/routing/`                                                                                   | 8                   | 7                                                  | ~85%                   | Mostly there; `endpoint.rb`, `polymorphic_routes.rb`, `redirection.rb`, `routes_proxy.rb` missing.                                                                                                                              |
| `action_dispatch/testing/`                                                                                   | 10                  | 0                                                  | **0%**                 | All test helpers live in `actioncontroller/test-case.ts` instead.                                                                                                                                                               |
| `action_dispatch/system_testing/`                                                                            | 5                   | 0                                                  | **0%**                 | Likely intentionally deferred — flag for triage.                                                                                                                                                                                |
| `action_dispatch/request/`                                                                                   | 2                   | 0 (have `dispatch/request/session.ts`)             | misnested              | We placed `session.ts` under a non-Rails `dispatch/` directory.                                                                                                                                                                 |
| `action_pack/` (version)                                                                                     | 2                   | 0 (`VERSION` const in `actioncontroller/index.ts`) | n/a                    | Trivial — version constant inlined.                                                                                                                                                                                             |
| top-level loaders (`abstract_controller.rb`, `action_controller.rb`, `action_dispatch.rb`, `action_pack.rb`) | 4                   | 0 (re-exports via `index.ts` files)                | n/a                    | Rails `lib/<name>.rb` requires; we use `index.ts` barrels per dir.                                                                                                                                                              |
| **Total Rails .rb under `actionpack/lib/`**                                                                  | **154**             | **84 TS files**                                    | **~55% files present** | ~45% of Rails source files have **no corresponding TS file**.                                                                                                                                                                   |

Source: `find scripts/api-compare/.rails-source/actionpack/lib -name '*.rb'`
(154 files), `find packages/actionpack/src -name '*.ts' ! -name '*.test.ts'`
(84 files including `index.ts`).

## Directory-layout deltas

### `abstract_controller/` — entirely missing as a directory

**Rails layout:**

```
abstract_controller/
  asset_paths.rb
  base.rb
  caching.rb
  caching/fragments.rb
  callbacks.rb
  collector.rb
  deprecator.rb
  error.rb
  helpers.rb
  logger.rb
  railties/routes_helpers.rb
  rendering.rb
  translation.rb
  url_for.rb
```

**Ours:** single file `actioncontroller/abstract-controller.ts`
exporting `AbstractController`, `ActionNotFound`, and callback types.
The other 13 Rails concerns (caching, helpers, translation, url_for,
asset_paths, rendering, logger, collector, deprecator) are either
folded into `actioncontroller/metal/*.ts` (correct for Rails' metal
mixins, but not for the AbstractController root) or absent.

This is the biggest structural divergence in the package. Rails treats
`AbstractController::*` as a **separate top-level namespace and
directory**, mounted as a sibling of `ActionController::*`. Putting
everything in `actioncontroller/abstract-controller.ts` makes
`api:compare` for `abstract_controller/base.rb` impossible to match by
path.

### `action_dispatch/http/` — directory missing, files scattered

Rails has 19 files under `action_dispatch/http/`:
`cache`, `content_disposition`, `content_security_policy`,
`filter_parameters`, `filter_redirect`, `headers`,
`mime_negotiation`, `mime_type`, `mime_types`, `param_builder`,
`param_error`, `parameters`, `permissions_policy`, `query_parser`,
`rack_cache`, `request`, `response`, `upload`, `url`.

Our equivalents live at the **dispatch root** or under a non-Rails
`dispatch/` directory:

| Rails file                        | Our file                                                                 | P-tag                                                    |
| --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `http/content_security_policy.rb` | `actiondispatch/content-security-policy.ts`                              | P1                                                       |
| `http/headers.rb`                 | `actiondispatch/dispatch/header.ts`                                      | P1 + naming (`header` vs `headers`)                      |
| `http/mime_type.rb`               | `actiondispatch/mime-type.ts`                                            | P1                                                       |
| `http/permissions_policy.rb`      | `actiondispatch/permissions-policy.ts`                                   | P1                                                       |
| `http/request.rb`                 | `actiondispatch/request.ts`                                              | P1                                                       |
| `http/response.rb`                | `actiondispatch/response.ts`                                             | P1                                                       |
| `http/upload.rb`                  | `actiondispatch/uploaded-file.ts`                                        | P1 + P4 (naming)                                         |
| `http/url.rb`                     | `actiondispatch/url-for.ts`                                              | P1 + P4 — and conflicts with routing/url_for! See below. |
| `http/cache.rb`                   | (missing)                                                                | P3                                                       |
| `http/content_disposition.rb`     | (missing)                                                                | P3                                                       |
| `http/filter_parameters.rb`       | (missing)                                                                | P3                                                       |
| `http/filter_redirect.rb`         | (missing)                                                                | P3                                                       |
| `http/mime_negotiation.rb`        | (missing — partially in `metal/mime-responds.ts`)                        | P3                                                       |
| `http/mime_types.rb`              | (missing)                                                                | P3                                                       |
| `http/param_builder.rb`           | (missing)                                                                | P3                                                       |
| `http/param_error.rb`             | (missing)                                                                | P3                                                       |
| `http/parameters.rb`              | (missing — strong-parameters in actioncontroller, but this is different) | P3                                                       |
| `http/query_parser.rb`            | (missing)                                                                | P3                                                       |
| `http/rack_cache.rb`              | (missing — likely intentionally deferred; rack-specific)                 | P3?                                                      |

### `action_dispatch/dispatch/` — non-Rails directory

Our `actiondispatch/dispatch/header.ts` and
`actiondispatch/dispatch/request/session.ts` invented a `dispatch/`
subdir that doesn't exist in Rails (the namespace is already
`action_dispatch`). These should be moved:

- `dispatch/header.ts` → `http/headers.ts`
- `dispatch/request/session.ts` → `request/session.ts`

### `action_dispatch/middleware/` — partial

Rails has 20 files under `middleware/` plus `session/` (4 files).
We have 7 files there plus `session/cookie-store.ts`.

| Rails file                              | Status                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `middleware/cookies.rb`                 | misplaced (we have `actiondispatch/cookies.ts`) — P1                             |
| `middleware/flash.rb`                   | misplaced (`actiondispatch/flash.ts`) — P1                                       |
| `middleware/exception_wrapper.rb`       | misplaced (`actiondispatch/exception-wrapper.ts`) — P1                           |
| `middleware/debug_exceptions.rb`        | present at `middleware/debug-exceptions.ts` ✓                                    |
| `middleware/host_authorization.rb`      | present ✓                                                                        |
| `middleware/request_id.rb`              | present ✓                                                                        |
| `middleware/show_exceptions.rb`         | present ✓                                                                        |
| `middleware/ssl.rb`                     | present ✓                                                                        |
| `middleware/stack.rb`                   | present ✓                                                                        |
| `middleware/static.rb`                  | present ✓                                                                        |
| `middleware/actionable_exceptions.rb`   | missing — P3                                                                     |
| `middleware/assume_ssl.rb`              | missing — P3                                                                     |
| `middleware/callbacks.rb`               | missing — P3                                                                     |
| `middleware/debug_locks.rb`             | missing — P3                                                                     |
| `middleware/debug_view.rb`              | missing — P3                                                                     |
| `middleware/executor.rb`                | missing — P3                                                                     |
| `middleware/public_exceptions.rb`       | missing — P3                                                                     |
| `middleware/reloader.rb`                | missing — P3                                                                     |
| `middleware/remote_ip.rb`               | missing — P3                                                                     |
| `middleware/server_timing.rb`           | missing — P3                                                                     |
| `middleware/session/abstract_store.rb`  | missing — P3                                                                     |
| `middleware/session/cache_store.rb`     | missing — P3                                                                     |
| `middleware/session/mem_cache_store.rb` | missing — P3                                                                     |
| `middleware/session/cookie_store.rb`    | present (in `session/cookie-store.ts`, P1 — should be under middleware/session/) |

### `action_dispatch/journey/` — entirely absent

Rails routing engine, 14 files (`router.rb`, `routes.rb`, `route.rb`,
`scanner.rb`, `parser.rb`, `visitors.rb`, `formatter.rb`,
`gtg/{builder,simulator,transition_table}.rb`,
`nfa/dot.rb`, `nodes/node.rb`, `path/pattern.rb`,
`router/utils.rb`). Likely deferred — our routing leans on
`actiondispatch/routing/` which calls into our own pattern compiler.
**Flag as: intentional deferral vs missing — needs triage.**

### `action_dispatch/testing/` — entirely absent

Rails has 10 files under `testing/` (assertions, integration helpers,
request_encoder, test_request, test_response, test_process,
assertion_response, assertions/{response,routing}.rb,
test_helpers/page_dump_helper.rb). We collapse everything into
`actioncontroller/test-case.ts` and `actioncontroller/integration-test.ts`
plus `actioncontroller/template-assertions.ts`. By Rails layout these
all belong under `actiondispatch/testing/`.

### `action_dispatch/system_testing/` — entirely absent

5 Rails files (browser, driver, server, screenshot_helper,
setup_and_teardown). **Likely intentional deferral** (Capybara
dependency). Flag for triage.

### `action_controller/railties/` → `actioncontroller/trailties/`

Rails has `action_controller/railties/helpers.rb`. We have
`actioncontroller/trailties/helpers.ts`.

The package rename `railties → trailties` is a project-wide convention,
but at the **subdirectory level inside actioncontroller**, the Rails
file is `railties/helpers.rb` — keeping `railties/` here would match
`api:compare`'s path expectation. Confirm convention with parent
(likely just rename the subdir back to `railties/`).

## Misplaced symbols (P2)

Selected larger files that mash multiple Rails files together:

- **`actioncontroller/abstract-controller.ts`**: contains the
  AbstractController class plus callback types. Rails splits this
  across at least `base.rb`, `callbacks.rb`, `error.rb`. → P2 split into
  `abstractcontroller/{base,callbacks,error}.ts`.
- **`actioncontroller/test-case.ts`**: exports `TestCase`, `TestRequest`,
  `LiveTestResponse`, `TestSession`. Rails splits this across three files:
  `action_controller/test_case.rb`,
  `action_dispatch/testing/test_request.rb`, and
  `action_dispatch/testing/test_response.rb`. → P2 split, plus P1 for
  the dispatch-side test request/response.
- **`actioncontroller/integration-test.ts`**: equivalent to Rails
  `action_dispatch/testing/integration.rb`. → P1 move + rename.
- **`actioncontroller/template-assertions.ts`**: corresponds to Rails
  `action_controller/template_assertions.rb` — placement is correct,
  but the same file also pulls in concerns from
  `action_dispatch/testing/assertions/*.rb`. Verify when wave runs.
- **Metal extras (1 unexpected file):**
  - `metal/header-utils.ts` — no Rails counterpart; likely a TS-internal
    helper. Mark `@internal` or move to `metal/utils/`.
  - The count delta is **+1 TS file in metal** (33 vs 32 Rails).
- **actioncontroller/params-wrapper.ts duplicates `metal/params-wrapper.ts`.**
  Rails has only `action_controller/metal/params_wrapper.rb`. Drop the
  root-level copy (P1/cleanup, audit in Wave 4).
- **Unaccounted actiondispatch root files:** `redirect.ts`, `respond-to.ts`,
  `send-file.ts` live at the dispatch root. Rails equivalents are
  `action_dispatch/routing/redirection.rb`,
  `action_controller/metal/mime_responds.rb`, and
  `action_controller/metal/data_streaming.rb` respectively — none belong at
  the dispatch root. Triage during Wave 2.

## Missing infrastructure files (P3 summary)

| File                                      | Status                               | Notes                              |
| ----------------------------------------- | ------------------------------------ | ---------------------------------- |
| `actioncontroller/railtie.ts`             | **present** ✓                        |                                    |
| `actioncontroller/deprecator.ts`          | present ✓                            |                                    |
| `actioncontroller/log-subscriber.ts`      | present ✓                            |                                    |
| `actioncontroller/renderer.ts`            | present ✓                            |                                    |
| `actioncontroller/test-case.ts`           | present ✓                            | But scope-creeped — see P2 above.  |
| `actioncontroller/template-assertions.ts` | present ✓                            |                                    |
| `actioncontroller/form-builder.ts`        | present ✓                            |                                    |
| `actiondispatch/railtie.ts`               | **missing**                          | P3                                 |
| `actiondispatch/deprecator.ts`            | missing                              | P3                                 |
| `actiondispatch/log_subscriber.ts`        | missing                              | P3                                 |
| `actiondispatch/constants.ts`             | missing                              | P3                                 |
| `actiondispatch/journey.ts`               | missing                              | P3 (root entry for journey engine) |
| `actiondispatch/routing.ts`               | missing (we have `routing/index.ts`) | naming P4                          |
| `actiondispatch/system_test_case.ts`      | missing                              | P3 — probably deferred             |
| `action_pack/version.rb`                  | inlined as `VERSION` const           | n/a                                |

## Pattern taxonomy

| Tag    | Pattern                                                                                                                                                                                       | Count (approx)                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **P1** | Wrong directory: file exists but placed at wrong path vs Rails (e.g. `actiondispatch/cookies.ts` should be `middleware/cookies.ts`; `actiondispatch/request.ts` should be `http/request.ts`). | **~13**                                                                                                           |
| **P2** | Monolithic file that should be split per Rails layout (`abstract-controller.ts`, `test-case.ts`).                                                                                             | **~3**                                                                                                            |
| **P3** | Missing file entirely (no TS counterpart).                                                                                                                                                    | **~70** (of 154 Rails files); split between deferrals (journey, system_testing) and real gaps (middleware, http). |
| **P4** | Naming convention (singular vs plural; `header` vs `headers`; subdir name `trailties` vs `railties`; `url-for.ts` overload between `routing/url-for.ts` and `http/url.rb`).                   | **~5**                                                                                                            |

## Recommended re-org sequence

All waves are documentation/move PRs — no behavior changes. **LOC
ceiling waived** (2026-05-14): for mechanical file moves and Rails
ports, the CLAUDE.md 300-LOC ceiling does not apply — size by logical
cluster instead. Splitting a cluster just to satisfy the ceiling
produces churn without review-cost savings. Each wave is **mechanical
file moves + index.ts re-exports**; method bodies untouched.

### Wave 1 — set up Rails-mirroring directory skeleton (1 PR, ~50 LOC)

Create empty directories with placeholder `index.ts` re-exports:

```
packages/actionpack/src/abstractcontroller/   ← NEW top-level sibling
packages/actionpack/src/actiondispatch/http/
packages/actionpack/src/actiondispatch/testing/
packages/actionpack/src/actiondispatch/request/
packages/actionpack/src/actiondispatch/middleware/session/
```

**Decision (2026-05-14): use `abstractcontroller/` as a separate
top-level directory.** api:compare path matching is the primary signal;
Rails splits the namespace; this PR sequence accepts the import-path
churn across the monorepo as one-time cost.

### Wave 2 — action_dispatch mechanical moves (P1) (1 PR, ~500 LOC)

All dispatch-root files relocated to their Rails-mirrored homes in
one PR. Pure path moves; method bodies untouched.

- Into `actiondispatch/http/`:
  - `actiondispatch/request.ts` → `http/request.ts`
  - `actiondispatch/response.ts` → `http/response.ts`
  - `actiondispatch/mime-type.ts` → `http/mime-type.ts`
  - `actiondispatch/uploaded-file.ts` → `http/upload.ts`
    (rename class export internally — keep TS alias for one release).
  - `actiondispatch/dispatch/header.ts` → `http/headers.ts`
    (rename to plural to match Rails)
  - `actiondispatch/content-security-policy.ts` →
    `http/content-security-policy.ts`
  - `actiondispatch/permissions-policy.ts` → `http/permissions-policy.ts`
- Into `actiondispatch/middleware/`:
  - `actiondispatch/cookies.ts` → `middleware/cookies.ts`
  - `actiondispatch/flash.ts` → `middleware/flash.ts`
  - `actiondispatch/exception-wrapper.ts` →
    `middleware/exception-wrapper.ts`
  - `actiondispatch/session/cookie-store.ts` →
    `middleware/session/cookie-store.ts`
- Into `actiondispatch/request/`:
  - `actiondispatch/dispatch/request/session.ts` → `request/session.ts`
- Audit + delete (or redirect) the actiondispatch duplicates of
  `request-forgery-protection.ts` and `http-authentication.ts`
  (Rails has these only under `action_controller/metal/`).
- Delete the empty `actiondispatch/dispatch/` directory.

### Wave 3 — AbstractController split (P2) (1 PR, ~450 LOC)

Single PR creates `abstractcontroller/` top-level dir and extracts the
sub-files:

- Move `actioncontroller/abstract-controller.ts` →
  `abstractcontroller/base.ts`.
- Pull callback types/infra out of base.ts →
  `abstractcontroller/callbacks.ts`.
- Pull `ActionNotFound` → `abstractcontroller/error.ts`.
- Re-export from old path for backcompat (deprecate later).
- Update `packages/actionpack/src/index.ts` to export both.
- Ship the tooling edits called out in the Tooling impact section
  below (config.ts, compare.ts, test-compare entries).

### Wave 4 — testing relocation (P1+P2) (1 PR, ~450 LOC)

- `actioncontroller/integration-test.ts` →
  `actiondispatch/testing/integration.ts`
- Extract `TestRequest`, `TestSession`, `LiveTestResponse` from
  `actioncontroller/test-case.ts` →
  `actiondispatch/testing/{test-request,test-response,test-process}.ts`
- Keep `actioncontroller/test-case.ts` for the TestCase class only.
- Split assertions out of `template-assertions.ts` into
  `actiondispatch/testing/assertions/{response,routing}.ts`.
- Add `actiondispatch/testing/assertions.ts` aggregator + index.

### Wave 5 — conventions.ts mapping for the trailties exception (~10 LOC)

The original audit prescribed renaming `actioncontroller/trailties/` →
`actioncontroller/railties/`. **Reversed (2026-05-14).** `trailties`
is a deliberate project-wide naming convention: trails railties are
not `Rails::Railtie` subclasses (different lifecycle, different
surface), and `scripts/api-compare/conventions.ts:32` already encodes
the precedent (`activerecord:railtie.rb` → `trailtie.ts`).

Action: add a directory-level entry to
`scripts/api-compare/conventions.ts` so Rails'
`action_controller/railties/...` paths resolve to our
`actioncontroller/trailties/...`. Mechanical edit; bundle into Wave 6
or open standalone.

### Wave 6 — new infra stubs (P3) (1 PR, ~150 LOC)

Add empty/stub-then-implemented files for top-level concerns. Each
should be either implemented or annotated as "deferred":

- `actiondispatch/railtie.ts`
- `actiondispatch/deprecator.ts`
- `actiondispatch/log-subscriber.ts`
- `actiondispatch/constants.ts`

Do **not** add empty stubs for `system_testing/` — it's intentionally
not ported (see Known divergences). `journey/` gets its own wave; do
not stub here.

### Wave 7 — journey/ routing engine port

**Decision (2026-05-14): port now. Sizing pass needed before slots are
spawned.** 14 Rails files under
`scripts/api-compare/.rails-source/actionpack/lib/action_dispatch/journey/`:

```
formatter.rb
gtg/{builder,simulator,transition_table}.rb           (3 files)
nfa/dot.rb                                            (1 file — visualization helper)
nodes/node.rb
parser.rb
path/pattern.rb
route.rb
router.rb
router/utils.rb
routes.rb
scanner.rb
visitors.rb
```

The routing engine is tightly coupled (parser → nodes → path/pattern →
gtg automaton → router). Sizing audit landed:
**[actionpack-journey-port-plan.md](actionpack-journey-port-plan.md)**.
10 PRs total (9 cluster + 1 wire-up): L → S₁ → S₂ → V → P → G → R₁ →
R₂ → R₃ → wire-up. PRs 4, 5, 6 can ship in parallel once PR 3 lands.
LOC ceiling waived per this wave's plan.

### Wave 8+ — selective fill-in (open-ended)

Per-file ports for missing `middleware/*` files and `http/*` files.
Sequenced by what unblocks `actioncontroller-100-percent.md` cleanup.
Drives independently of this audit.

**Total restructure work: 5 mechanical PRs (Waves 1–6: skeleton +
dispatch moves + abstractcontroller split + testing relocation +
conventions/infra; Wave 5 is bundled into Wave 6 as a ~10 LOC edit) +
Wave 7 journey port (10 PRs per
[actionpack-journey-port-plan.md](actionpack-journey-port-plan.md)) +
open-ended fill-in (Wave 8+).**

## Known divergences from Rails

- **`action_dispatch/system_testing/`** — intentionally not ported.
  Rails ships Capybara + Selenium integration; trails will use
  Playwright / Vitest browser mode if/when browser testing is on the
  roadmap. The 5 Rails files under `system_testing/` have no trails
  counterpart and shouldn't be tracked as a coverage gap.
- **`actioncontroller/trailties/` directory name** — `trailties` is a
  deliberate naming exception (trails railties are not
  `Rails::Railtie` subclasses). See Wave 5 above and the
  `scripts/api-compare/conventions.ts` precedent for `railtie.rb` →
  `trailtie.ts`.

## Tooling impact (api:compare / test:compare)

The restructure relies on `api:compare`'s path-based matching to convert
file moves into coverage gains. Inspection of `scripts/api-compare/` and
`scripts/test-compare/` shows what each wave requires:

### Waves 2, 4 (action_dispatch + testing moves) — zero script changes

`scripts/api-compare/conventions.ts:rubyFileToTs` already transforms
Ruby paths like `action_dispatch/middleware/cookies.rb` to the expected
TS form (kebab-case, `.ts` extension) and `config.ts:packageSrcDir`
roots the lookup at `packages/actionpack/src/actiondispatch/`. So once
the TS files land at the Rails-mirrored paths (`middleware/cookies.ts`,
`http/request.ts`, etc.) the matcher succeeds with no config edits.

Test file moves follow `**/*.test.ts` glob in
`scripts/test-compare/extract-ts-tests.ts` — they're picked up
automatically once siblings move with their source files.

### Wave 5 (DROPPED — trailties exception) — small conventions.ts add (~10 LOC)

`rubyFileToTs` emits `railties/helpers.ts` from
`action_controller/railties/helpers.rb`. The current `trailties/`
subdir makes the match miss. Rather than rename, extend
`scripts/api-compare/conventions.ts` with a directory-level mapping
analogous to the existing `activerecord:railtie.rb → trailtie.ts`
override, so Rails' `action_controller/railties/...` paths resolve to
our `actioncontroller/trailties/...`. Bundle into Wave 6 or open as a
standalone ~10 LOC PR.

### Wave 3 (AbstractController top-level split) — script edits required

Creating `packages/actionpack/src/abstractcontroller/` as a top-level
sibling means teaching the tooling about a new logical package:

- `scripts/api-compare/config.ts`: append `abstractcontroller` to
  `PACKAGES`, then add
  `PACKAGE_DIR_OVERRIDES.abstractcontroller = "actionpack"` and
  `PACKAGE_SRC_SUBDIR.abstractcontroller = "abstractcontroller"`.
- `scripts/api-compare/compare.ts`: add `abstractcontroller` to the
  `DETAIL_PACKAGES` set.
- `scripts/test-compare/extract-ts-tests.ts`: add a glob for
  `packages/actionpack/src/abstractcontroller/**/*.test.ts` and
  expose it under the new `abstractcontroller` package key.
- `scripts/test-compare/test-compare.ts` (`extractRelativeTsPath`) and
  `scripts/test-compare/generate-stubs.ts`: add
  `abstractcontroller: "packages/actionpack/src/abstractcontroller/"`
  to the `pkgDirs` maps.
- `scripts/test-compare/extract-ruby-tests.rb`: add
  `"abstractcontroller" => File.join(RAILS_DIR, "actionpack", "test")`
  with include rules pointing at Rails' `actionpack/test/abstract/`.

These script edits should ship in PR 3a alongside the directory
creation, so the very first commit that moves files into
`abstractcontroller/` is also the one that teaches the matchers to
look there. ~20 LOC total — folds into Wave 3a's ~250 LOC budget.

### Waves 1, 2c, 6, 7+ — no tooling changes

Skeleton creation, CSP/PP moves, infrastructure-file additions, and
selective fill-ins all stay within already-configured subtrees.

### Not affected

- `scripts/api-compare/unported-files.ts`: no actionpack entries, so
  no skip-list collateral from the restructure.
- `eslint/rails-private-methods.json`: regenerated by
  `pnpm api:compare`; auto-heals.
- Path-alias alternative: deliberately not pursued. Aliasing
  `actioncontroller/abstract-controller.ts → abstract_controller/*.rb`
  in `conventions.ts:FILE_OVERRIDES` would mask the structural
  divergence at the matcher layer without fixing the source layout.
  The Wave 3 split aligns paths instead, which keeps `api:compare`'s
  output legible (one Ruby file ↔ one TS file).

## Out of scope

- **Method-level surface gaps:** tracked in
  [actioncontroller-100-percent.md](actioncontroller-100-percent.md)
  (~25 queued PRs).
- **actiondispatch method-level work:** tracked in
  [actiondispatch-100-percent.md](actiondispatch-100-percent.md).
- **Other Rails packages:** actionview, actionmailer, actiontext are
  separate audits.
- **Behavioral parity / known divergences:** see
  [actioncontroller-100-percent.md](actioncontroller-100-percent.md)
  for the YAML/DidYouMean/CSRF/etag list.
- **trailties package layout:** see
  [trailties-plan.md](trailties-plan.md). The `railtie.ts` files in
  this audit are actionpack-internal entry points, not the trailties
  package boundary.

## Cross-references

- [actioncontroller-100-percent.md](actioncontroller-100-percent.md) —
  method-level Rails-fidelity backlog for actioncontroller. Wave 3 of
  this audit (AbstractController split) may unblock methods that
  currently can't match via api:compare path.
- [actiondispatch-100-percent.md](actiondispatch-100-percent.md) —
  method-level backlog. Wave 2 (action_dispatch moves) is a hard
  prerequisite for most of that work.
- [trailties-plan.md](trailties-plan.md) — Wave 6
  (`actiondispatch/railtie.ts`) interacts with the trailties Railtie
  boot sequence. Coordinate any non-trivial railtie change there.

## Tracking

Status: **plan draft 2026-05-14**. Update headline counts when each
wave merges. Source of truth for raw numbers is
`find packages/actionpack/src -name '*.ts' ! -name '*.test.ts'` vs
`find scripts/api-compare/.rails-source/actionpack/lib -name '*.rb'`.
