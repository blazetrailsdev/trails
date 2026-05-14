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

All waves are documentation/move PRs — no behavior changes. Target
~250 LOC, ceiling 300 per `CLAUDE.md`. Each wave is **mechanical
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

Decision needed before Wave 1: do we use `abstractcontroller/` (mirrors
Rails namespace exactly) or keep AbstractController under
`actioncontroller/abstract-controller.ts` and accept the
api:compare path divergence? Recommend **separate top-level
directory** — `api:compare` is the primary signal and Rails splits
the namespace.

### Wave 2 — action_dispatch mechanical moves (P1) (3 PRs)

**PR 2a (~200 LOC)** — move dispatch-root files into `http/`:

- `actiondispatch/request.ts` → `actiondispatch/http/request.ts`
- `actiondispatch/response.ts` → `actiondispatch/http/response.ts`
- `actiondispatch/mime-type.ts` → `actiondispatch/http/mime-type.ts`
- `actiondispatch/uploaded-file.ts` → `actiondispatch/http/upload.ts`
  (and rename class export internally — keep TS alias for backcompat
  for one release).
- `actiondispatch/dispatch/header.ts` → `actiondispatch/http/headers.ts`
  (also rename to plural to match Rails)
- Delete the empty `actiondispatch/dispatch/` directory.

**PR 2b (~150 LOC)** — move into `actiondispatch/middleware/`:

- `actiondispatch/cookies.ts` → `actiondispatch/middleware/cookies.ts`
- `actiondispatch/flash.ts` → `actiondispatch/middleware/flash.ts`
- `actiondispatch/exception-wrapper.ts` →
  `actiondispatch/middleware/exception-wrapper.ts`
- `actiondispatch/session/cookie-store.ts` →
  `actiondispatch/middleware/session/cookie-store.ts`

**PR 2c (~150 LOC)** — move CSP / permissions-policy / etc:

- `actiondispatch/content-security-policy.ts` →
  `actiondispatch/http/content-security-policy.ts`
- `actiondispatch/permissions-policy.ts` →
  `actiondispatch/http/permissions-policy.ts`
- `actiondispatch/request-forgery-protection.ts` → confirm Rails
  location (it is split across actioncontroller and not under
  actiondispatch — drop the file if duplicate, else clarify).
- `actiondispatch/http-authentication.ts` → confirm placement
  (Rails puts this in `action_controller/metal/http_authentication.rb`
  only; our actiondispatch copy may be dead).
- `actiondispatch/dispatch/request/session.ts` →
  `actiondispatch/request/session.ts`

### Wave 3 — AbstractController split (P2) (2 PRs)

**PR 3a (~250 LOC)** — create `abstractcontroller/` top-level dir:

- Move `actioncontroller/abstract-controller.ts` →
  `abstractcontroller/base.ts`.
- Re-export from old path for backcompat (deprecate later).
- Update `packages/actionpack/src/index.ts` to export both.

**PR 3b (~200 LOC)** — extract callbacks/error/helpers:

- Pull callback types and infra out of base.ts →
  `abstractcontroller/callbacks.ts`.
- Pull `ActionNotFound` → `abstractcontroller/error.ts`.
- (Pure file splits — no logic changes.)

### Wave 4 — testing relocation (P1+P2) (2 PRs)

**PR 4a (~250 LOC)** — move test infra to dispatch:

- `actioncontroller/integration-test.ts` →
  `actiondispatch/testing/integration.ts`
- Extract `TestRequest`, `TestSession`, `LiveTestResponse` from
  `actioncontroller/test-case.ts` →
  `actiondispatch/testing/{test-request,test-response,test-process}.ts`
- Keep `actioncontroller/test-case.ts` for the TestCase class only.

**PR 4b (~200 LOC)** — assertion infrastructure:

- Split assertions out of `template-assertions.ts` into
  `actiondispatch/testing/assertions/{response,routing}.ts`.
- Add `actiondispatch/testing/assertions.ts` aggregator + index.

### Wave 5 — rename subdirectories (P4) (1 PR, ~80 LOC)

- `actioncontroller/trailties/` → `actioncontroller/railties/`
  (path inside actioncontroller mirrors Rails source layout; the
  package name `trailties` is unaffected).
- Verify api:compare path matching after the move.

### Wave 6 — new infra stubs (P3) (1 PR, ~150 LOC)

Add empty/stub-then-implemented files for top-level concerns. Each
should be either implemented or annotated as "deferred":

- `actiondispatch/railtie.ts`
- `actiondispatch/deprecator.ts`
- `actiondispatch/log-subscriber.ts`
- `actiondispatch/constants.ts`

Do **not** add empty stubs for journey/ or system_testing/ — flag
those as deferred in this doc and skip until a follow-up plan exists.

### Wave 7+ — selective fill-in (open-ended)

Per-file ports for missing `middleware/*` files and `http/*` files.
Sequenced by what unblocks `actioncontroller-100-percent.md` cleanup.
Drives independently of this audit.

**Total restructure PRs: 10**, all mechanical, all ≤300 LOC.

## Open questions for triage

1. **`abstractcontroller/` as a separate top-level directory?** Recommend yes; needs parent sign-off because it affects import paths across the monorepo.
2. **`journey/` deferral.** Is the routing engine an intentional non-port, or just not done? If non-port, add a "Known divergences" entry. If just not done, add a journey/ wave to this doc.
3. **`system_testing/` deferral.** Capybara/Selenium dependency — likely won't port. Confirm and add to "Known divergences".
4. **`actiondispatch/http-authentication.ts` and `actiondispatch/request-forgery-protection.ts`.** Both have actioncontroller `metal/` counterparts; verify our actiondispatch copies aren't dead code before Wave 2c.

(The `actioncontroller/trailties/` → `railties/` subdir rename is
prescribed in Wave 5 — Rails source path parity wins over the
project-wide `trailties` package name, since `api:compare` matches by
path. Not listed as open.)

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
