# actionpack: structural audit + re-org plan

Audit of `packages/actionpack/src/` directory layout against
`actionpack/lib/` in Rails source
(`vendor/rails/actionpack/lib/`). Method-level
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
| `action_pack/` (version)                                                                                     | 2                   | 0 (`VERSION` const in `actioncontroller/index.ts`) | **0%**                 | Belongs under `actionpack/src/action-pack/{version,gem-version}.ts` — see Wave 3.5.                                                                                                                                             |
| top-level loaders (`abstract_controller.rb`, `action_controller.rb`, `action_dispatch.rb`, `action_pack.rb`) | 4                   | 0 (re-exports via `index.ts` files)                | n/a                    | Rails `lib/<name>.rb` requires; we use `index.ts` barrels per dir.                                                                                                                                                              |
| **Total Rails .rb under `actionpack/lib/`**                                                                  | **154**             | **84 TS files**                                    | **~55% files present** | ~45% of Rails source files have **no corresponding TS file**.                                                                                                                                                                   |

Source: `find vendor/rails/actionpack/lib -name '*.rb'`
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

| File                                      | Status                                                         | Notes                              |
| ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `actioncontroller/railtie.ts`             | **present** ✓                                                  |                                    |
| `actioncontroller/deprecator.ts`          | present ✓                                                      |                                    |
| `actioncontroller/log-subscriber.ts`      | present ✓                                                      |                                    |
| `actioncontroller/renderer.ts`            | present ✓                                                      |                                    |
| `actioncontroller/test-case.ts`           | present ✓                                                      | But scope-creeped — see P2 above.  |
| `actioncontroller/template-assertions.ts` | present ✓                                                      |                                    |
| `actioncontroller/form-builder.ts`        | present ✓                                                      |                                    |
| `actiondispatch/railtie.ts`               | **missing**                                                    | P3                                 |
| `actiondispatch/deprecator.ts`            | missing                                                        | P3                                 |
| `actiondispatch/log_subscriber.ts`        | missing                                                        | P3                                 |
| `actiondispatch/constants.ts`             | missing                                                        | P3                                 |
| `actiondispatch/journey.ts`               | missing                                                        | P3 (root entry for journey engine) |
| `actiondispatch/routing.ts`               | missing (we have `routing/index.ts`)                           | naming P4                          |
| `actiondispatch/system_test_case.ts`      | missing                                                        | P3 — probably deferred             |
| `action_pack/version.rb`                  | **missing** — `VERSION` inlined in `actioncontroller/index.ts` | P1 + P3 — see Wave 3.5             |
| `action_pack/gem_version.rb`              | **missing**                                                    | P3 — see Wave 3.5                  |

## Pattern taxonomy

| Tag    | Pattern                                                                                                                                                                                       | Count (approx)                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **P1** | Wrong directory: file exists but placed at wrong path vs Rails (e.g. `actiondispatch/cookies.ts` should be `middleware/cookies.ts`; `actiondispatch/request.ts` should be `http/request.ts`). | **~13**                                                                                                           |
| **P2** | Monolithic file that should be split per Rails layout (`abstract-controller.ts`, `test-case.ts`).                                                                                             | **~3**                                                                                                            |
| **P3** | Missing file entirely (no TS counterpart).                                                                                                                                                    | **~70** (of 154 Rails files); split between deferrals (journey, system_testing) and real gaps (middleware, http). |
| **P4** | Naming convention (singular vs plural; `header` vs `headers`; subdir name `trailties` vs `railties`; `url-for.ts` overload between `routing/url-for.ts` and `http/url.rb`).                   | **~5**                                                                                                            |

## Recommended re-org sequence

Waves 1–6 are documentation/move PRs — no behavior changes. **Wave 7
is a Rails port** (behavior-changing): it adds the journey routing
engine and PR 10 switches `routing/route-set.ts` to the journey-backed
router. Wave 8+ is open-ended fill-in (mixed). **LOC
ceiling waived** (2026-05-14): for mechanical file moves and Rails
ports, the CLAUDE.md 300-LOC ceiling does not apply — size by logical
cluster instead. Splitting a cluster just to satisfy the ceiling
produces churn without review-cost savings. Each wave is **mechanical
file moves + index.ts re-exports**; method bodies untouched.

### Wave 1 — set up Rails-mirroring directory skeleton (1 PR, ~50 LOC)

Create empty directories with placeholder `index.ts` re-exports:

```
packages/actionpack/src/abstract-controller/   ← NEW top-level sibling
packages/actionpack/src/action-dispatch/http/
packages/actionpack/src/action-dispatch/testing/
packages/actionpack/src/action-dispatch/request/
packages/actionpack/src/action-dispatch/middleware/session/
```

**Decision (2026-05-14): use `abstractcontroller/` as a separate
top-level directory.** api:compare path matching is the primary signal;
Rails splits the namespace; this PR sequence accepts the import-path
churn across the monorepo as one-time cost.

**Update (2026-05-15):** Wave 1 shipped with concat names
(`abstractcontroller/`, `actiondispatch/`, etc.) — Wave 3.5 below
renames these to hyphenated Rails-literal forms
(`abstract-controller/`, `action-dispatch/`, etc.) and adds the
missing `action-pack/` sibling.

### Wave 2 — action_dispatch mechanical moves (P1) — closed (#1603)

**Wave 2b followup (~100 LOC):** Move `actiondispatch/dispatch/*.test.ts` to correct subdirectories (`http/`, `middleware/`, `routing/`); delete empty `dispatch/`, `session/`, `dispatch/request/` directories (only re-export stubs remain); update test import paths.

**Dedup followup (~50 LOC, separate PR):** Consolidate `request-forgery-protection.ts` and `http-authentication.ts` — both have full impls under `actiondispatch/` but Rails places them under `action_controller/metal/`. Move impl to metal, remove the actiondispatch copies.

(Original scope kept below for reference.)

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

### Wave 3 — AbstractController split — closed (#1615); Wave 3.5 hyphenated rename closed (#1621)

**Followups:**

- ~50 LOC — `abstract-controller/callbacks.ts` is types-only (Rails `callbacks.rb` is a full `Callbacks` concern with `ClassMethods`/`ActionFilter`). api:compare 0/6 today. Extract callback registration class methods from `base.ts`.
- ~5 LOC — `extract-ruby-api.rb` extractor splits `ActionPack` module methods by source file. `actionpackversion` shows 1/2 because `version()` (in `version.rb`) is attributed to `gem-version.ts`. Per-file method attribution needed.
- ~30 LOC — `sed` sweep on `docs/actionpack-restructure-audit.md` to update older-wave prose still using concat names (`actiondispatch/` etc.) → hyphenated form.
- Sweep — other `extends Error` classes in actionpack; verify whether any should chain through `AbstractControllerError` (only `DoubleRenderError` wired so far).
- `action-dispatch/index.ts` keeps its own `VERSION` const (mirrors Rails `action_dispatch.rb`); decide whether to consolidate under `action-pack/`.

(Original Wave 3 scope kept below for reference.)

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

### Wave 4 — testing relocation — closed (#1625)

**Followups (~550 LOC across 4 PRs):**

- ~80 LOC — `TestRequest` setters + class methods (12 Rails methods missing: `DEFAULT_ENV`, `create(env)`, `default_env`, setters for `request_method=`/`host=`/`port=`/`request_uri=`/`path=`/`action=`/`if_modified_since=`/`if_none_match=`/`remote_addr=`/`user_agent=`/`accept=`). Mechanical port.
- ~120 LOC — Implement `TestResponse` (`parsed_body` / `from_response` / `response_parser`) in new `action-dispatch/testing/test-response.ts`. Needs `RequestEncoder` parser registry first (or simple MIME→parser map).
- ~150 LOC — Implement `TestProcess` module in new `action-dispatch/testing/test-process.ts` (`file_fixture_upload` / `assigns` / `session` / `flash` / `cookies` / `redirect_to_url`). `assigns` should raise NoMethodError per Rails (gem extracted) — preserve fidelity.
- ~200 LOC — Split assertions out of `TestCase`/`IntegrationTest`: extract `assertResponse`/`assertRedirectedTo`/`assertHeader`/`assertContentType` into `action-dispatch/testing/assertions/response.ts`; create `action-dispatch/testing/assertions/routing.ts` (`assertRouting`/`assertRecognizes`/`assertGenerates`). Behavior-touching refactor; keep public surface stable via TestCase mixin.

Pre-existing notes: `TestSession` is a Map wrapper (Rails extends `Rack::Session::Abstract::PersistedSecure::SecureSessionHash`; surface is camel-equivalent). `LiveTestResponse` extends `Response` (Rails extends `Live::Response`); acceptable until SSE testing exercised.

(Original Wave 4 scope kept below for reference.)

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

### Wave 5 closed — conventions.ts mapping for the trailties exception

Verified mapping already present in
`scripts/api-compare/conventions.ts`
(`"actioncontroller:railties/": "trailties/"` in
`DIR_PREFIX_OVERRIDES`). The only Rails source file under that path
(`railties/helpers.rb`) defines just `inherited`, which is in `SKIP`,
so api:compare has nothing to verify. Closed as no-op; bundled with
Wave 6 to avoid a doc-only PR.

### Wave 6 closed — action-dispatch top-level infra files (#1629)

**Followups:**

- ~30 LOC — Align `action-controller/log-subscriber.ts` with the new pattern: extend `@blazetrails/activesupport` LogSubscriber, call `attachTo("action_controller")`, register `subscribeLogLevel` per method. Mirror Rails `action_controller/log_subscriber.rb`.
- ~5 LOC — Surface `HTTP_STATUS_CODES` barrel re-export at actionpack root (consumers currently reach into rack).
- ~1 line — Audit-doc note that `ActionDispatch.Constants.VARY` is exported as a namespace by design (matches Rails `module Constants`); Copilot flagged twice as a divergence — it isn't.
- Pre-existing: `action-controller/deprecator.ts` naming consistency with the `Railtie → Trailtie` precedent (kept as `Deprecator` deliberately; document or rename).

Created as real implementations from Rails source (no stubs, per
project policy):

- `action-dispatch/deprecator.ts` — `Deprecation` instance for
  actionpack (mirrors `ActionDispatch.deprecator`).
- `action-dispatch/log-subscriber.ts` — `LogSubscriber` with
  `redirect(event)` matching Rails' single subscribed handler.
- `action-dispatch/constants.ts` — Rack 3 lowercase header constants
  (the Rack 2 branch in Rails' `constants.rb` is omitted; trails
  targets Rack 3 only).
- `action-dispatch/railtie.ts` — **deferred**. Rails'
  `action_dispatch/railtie.rb` wires 30+ config defaults into classes
  that don't exist on the trails side yet (`Http::URL.secure_protocol=`,
  `ParamBuilder.ignore_leading_brackets=`, `QueryParser`,
  `Cookies::CookieJar.always_write_cookie=`, etc.). Shipping a class
  with no real initializers would be a stub; adding it now would call
  setters on phantom classes. Open when the consuming classes land.

Do **not** add empty stubs for `system_testing/` — it's intentionally
not ported (see Known divergences). `journey/` gets its own wave; do
not stub here.

### Wave 3.5 — Rails-literal hyphenated rename + `action-pack/` namespace (1 PR, mechanical, LOC-uncapped)

**Decision (2026-05-15):** the existing concat-name subdirs
(`abstractcontroller/`, `actioncontroller/`, `actiondispatch/`)
diverge from Rails' `abstract_controller/`, `action_controller/`,
`action_dispatch/`. Rename to the TS-convention hyphenated form
(`abstract-controller/`, `action-controller/`, `action-dispatch/`)
and add the missing `action-pack/` namespace as a fourth sibling.
This makes the layout a direct character-for-character mirror of
Rails (with `_` → `-` per TS naming).

Final layout:

```
packages/actionpack/src/
  abstract-controller/   ← renamed from abstractcontroller/
  action-controller/     ← renamed from actioncontroller/
  action-dispatch/       ← renamed from actiondispatch/
  action-pack/           ← NEW (Rails action_pack/, version namespace)
  index.ts
```

#### Source moves

- `git mv packages/actionpack/src/abstractcontroller packages/actionpack/src/abstract-controller`
- `git mv packages/actionpack/src/actioncontroller   packages/actionpack/src/action-controller`
- `git mv packages/actionpack/src/actiondispatch     packages/actionpack/src/action-dispatch`
- Create `action-pack/version.ts` exporting `VERSION` (move from
  `action-controller/index.ts`).
- Create `action-pack/gem-version.ts` exporting `gemVersion()` — plain
  string for now (no `Gem::Version` equivalent); annotate `@internal`.
- Create `action-pack/index.ts` barrel.
- Update `packages/actionpack/src/index.ts` to add
  `export * as ActionPack from "./action-pack/index.js";` alongside
  the existing namespace exports.

#### Cross-directory import updates

After the renames, every cross-directory import (e.g.
`../actiondispatch/http/request.js` in `action-controller/metal.ts`)
needs its path string updated to the new hyphenated form. Mechanical
sed-style sweep across all `.ts` files under `packages/actionpack/src/`:

- `from "../abstractcontroller/...` → `from "../abstract-controller/...`
- `from "../actiondispatch/...` → `from "../action-dispatch/...`
- `from "../actioncontroller/...` → `from "../action-controller/...`
- `from "./abstractcontroller/...` → `from "./abstract-controller/...`
- etc. (also handle `../../`, `./`, deeper paths)

Intra-directory imports (file → file within the same renamed subtree)
keep their relative paths unchanged.

#### Tooling impact

**Logical keys stay concat** (`abstractcontroller`, `actioncontroller`,
`actiondispatch`, `actionpack`) — they're not file paths, they're
api-compare identifiers, and changing them would force every memory
entry and historical PR reference to retitle. The mapping happens
through `PACKAGE_SRC_SUBDIR`.

- `scripts/api-compare/config.ts`:
  - `PACKAGE_SRC_SUBDIR.abstractcontroller = "abstract-controller"`
  - `PACKAGE_SRC_SUBDIR.actioncontroller   = "action-controller"`
  - `PACKAGE_SRC_SUBDIR.actiondispatch     = "action-dispatch"`
  - Add: `actionpack` to `PACKAGES`,
    `PACKAGE_DIR_OVERRIDES.actionpack = "actionpack"` (npm pkg),
    `PACKAGE_SRC_SUBDIR.actionpack = "action-pack"`.
  - **Key collision risk:** `actionpack` is already used in
    `DIR_TO_PACKAGES` derivation. Verify the npm-name → logical-key
    resolution still works after adding the new entry; if it conflicts,
    rename the new key to `actionpackversion` and document.
- `scripts/api-compare/compare.ts`: add `actionpack` to
  `DETAIL_PACKAGES`.
- `scripts/test-compare/test-compare.ts` + `generate-stubs.ts`:
  update existing pkgDirs values to hyphenated paths, add new entry:
  - `abstractcontroller: "packages/actionpack/src/abstract-controller/"`
  - `actioncontroller:   "packages/actionpack/src/action-controller/"`
  - `actiondispatch:     "packages/actionpack/src/action-dispatch/"`
  - `actionpack:         "packages/actionpack/src/action-pack/"`
- `scripts/test-compare/extract-ts-tests.ts`: update existing globs,
  add new glob for `action-pack/`.
- `vendor/sources.ts`: add `{ name: "actionpack", libPath:
"actionpack/lib/action_pack" }`. No `testPath` — Rails has no
  `actionpack/test/action_pack/` directory.

#### Other follow-ups in the same PR

- `docs/actionpack-100-percent.md`, `docs/actioncontroller-100-percent.md`,
  `docs/actiondispatch-100-percent.md`, and any other docs referencing
  the old paths: sed-update path mentions.
- `package.json` workspace entries — verify no path-based scripts
  reference the old dir names.
- This audit doc itself: every `actiondispatch/` etc. mention should
  be re-anchored to the new names in a follow-up sweep (not the same
  PR, or bundle as a last commit).

#### Size

Mechanical only — no logic changes. Likely 200–400 files touched
(every cross-dir import updates one line). The CLAUDE.md 300-LOC
ceiling is explicitly waived for mechanical moves per the Wave 2/4
precedent.

#### Ordering

Position **before Wave 4** (testing relocation): doing Wave 4 against
the renamed dirs is cheaper than redoing it after. Wave 3 (PR #1615)
must merge first — it adds `abstractcontroller/` which then gets
renamed in 3.5. Memory entries with concat names can stay; future
ones use the new names.

### Wave 7 — journey/ routing engine port (10 PRs)

**Decision (2026-05-14): port now.** Sizing audit done inline below.
The routing engine is tightly coupled (parser → nodes → path/pattern →
gtg automaton → router); slicing must follow the import graph.

#### Headline numbers

| Metric                                                                            | Value                                 |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| Rails `.rb` files under `action_dispatch/journey/`                                | **14**                                |
| Total Ruby LOC                                                                    | **2062**                              |
| Estimated TS LOC after porting (≈ Ruby × 1.3)                                     | **~2680**                             |
| Existing TS counterparts under `packages/actionpack/src/action-dispatch/journey/` | **0** (subtree absent)                |
| Rails journey test LOC (`test/journey/`)                                          | **1603** across 11 files              |
| PR count (LOC ceiling waived; sized by logical cluster)                           | **9 port PRs + 1 wire-up = 10 total** |

Per-file LOC (Ruby, `wc -l`):

| File               | LOC | File                      | LOC      |
| ------------------ | --- | ------------------------- | -------- |
| `nfa/dot.rb`       | 27  | `router.rb`               | 151      |
| `gtg/simulator.rb` | 50  | `route.rb`                | 189      |
| `scanner.rb`       | 74  | `nodes/node.rb`           | 208      |
| `routes.rb`        | 82  | `path/pattern.rb`         | 209      |
| `parser.rb`        | 103 | `gtg/transition_table.rb` | 217      |
| `router/utils.rb`  | 105 | `formatter.rb`            | 231      |
| `gtg/builder.rb`   | 149 | `visitors.rb`             | 267      |
|                    |     | **Total**                 | **2062** |

#### Import graph + coupling clusters

Outgoing deps (`require`/`require_relative` + class-level
`Journey::*` references):

| File                      | Internal deps                                                                 |
| ------------------------- | ----------------------------------------------------------------------------- |
| `router/utils.rb`         | —                                                                             |
| `scanner.rb`              | — (uses `strscan`)                                                            |
| `nfa/dot.rb`              | —                                                                             |
| `gtg/simulator.rb`        | duck-types `TransitionTable` (uses `strscan`)                                 |
| `gtg/transition_table.rb` | `nfa/dot` (mixin)                                                             |
| `gtg/builder.rb`          | `gtg/transition_table`; consumes parser AST                                   |
| `nodes/node.rb`           | `visitors` (only for `accept` dispatch — can use a stub interface)            |
| `parser.rb`               | `scanner`, `nodes/node`                                                       |
| `visitors.rb`             | `router/utils` (escape lambdas); defines `Journey::Format`                    |
| `path/pattern.rb`         | `visitors`, `parser`, `nodes/node`                                            |
| `route.rb`                | `path/pattern`; `gtg/transition_table` via `Routes#simulator`                 |
| `routes.rb`               | `route`, `gtg/{builder, simulator, transition_table}`                         |
| `formatter.rb`            | `routes`, `visitors`, `route`; external: `action_controller/metal/exceptions` |
| `router.rb`               | `router/utils`, `routes`, `formatter`, `parser`, `route`, `path/pattern`      |

Clusters (topological order **L → S → V → P → G → R**; G and P can
ship in parallel once L+S+V are in):

1. **L — Leaf utilities.** `router/utils.rb`, `nfa/dot.rb`, `gtg/simulator.rb`.
2. **S — Scanner+parser+nodes.** `scanner.rb`, `nodes/node.rb`, `parser.rb`.
3. **V — Visitors + Format.** `visitors.rb`.
4. **P — Path/pattern.** `path/pattern.rb` (subclasses `Visitors::Visitor`).
5. **G — GTG automaton.** `gtg/transition_table.rb`, `gtg/builder.rb`.
6. **R — Routing API.** `route.rb`, `routes.rb`, `formatter.rb`, `router.rb`.

#### PR slicing (10 PRs)

LOC ceiling waived per Wave 7's mechanical-port nature. TS LOC ≈
Ruby × 1.3. Test LOC ports inline alongside the source PR.

| PR                    | Cluster | Files                                                              | Src LOC | Test LOC | Total | Deps |
| --------------------- | ------- | ------------------------------------------------------------------ | ------- | -------- | ----- | ---- |
| ~~1~~ closed (#1634)  | L       | `router/utils.rb`, `nfa/dot.rb`, `gtg/simulator.rb` + index barrel | ~240    | ~80      | ~320  | —    |
| ~~2~~ closed (#1639)  | S₁      | `scanner.rb`                                                       | ~100    | ~100     | ~200  | 1    |
| ~~3~~ closed (#1643)  | S₂      | `nodes/node.rb` + `parser.rb`                                      | ~400    | ~260     | ~660  | 2    |
| ~~4~~ closed (#1648)  | V       | `visitors.rb`                                                      | ~350    | —        | ~350  | 3, 1 |
| ~~5~~ closed (#1654)  | P       | `path/pattern.rb`                                                  | ~270    | ~280     | ~550  | 3, 4 |
| ~~6~~ closed (#1664)  | G       | `gtg/transition_table.rb` + `gtg/builder.rb`                       | ~480    | ~220     | ~700  | 3    |
| ~~7~~ closed (#1668)  | R₁      | `route.rb` + `routes.rb`                                           | ~350    | ~190     | ~540  | 5, 6 |
| ~~8~~ closed (#1673)  | R₂      | `formatter.rb`                                                     | ~300    | ~150     | ~450  | 4, 7 |
| ~~9~~ closed (#1680)  | R₃      | `router.rb`                                                        | ~200    | ~500     | ~700  | 7, 8 |
| ~~10~~ closed (#1685) | wire-up | `actiondispatch/routing/route-set.ts` swap (Journey seam)          | ~200    | included | ~200  | 9    |

**🎯 Wave 7 complete.** PRs 1–10 merged. `RouteSet.recognize` uses Journey by default (#1696); legacy `matchSegments` engine deleted (#1721); native short-circuit return (#1706); RegExp requirements pushed into AST (#1702); `Route#match` delegates to Journey via lazy per-instance `buildJourneyRouter` + `journeyRecognize`.

**Wave 7 followups:**

- ~80 LOC — Journey GTG symbol char-class widening based on requirement regex (`transition_table.ts` Builder consult `Pattern.requirements`). Unblocks SKIPPED named-character-classes test (`routing.test.ts:1268`) for `filename: /(.+)/` matching dotted paths.
- ~80 LOC — Real dispatcher registry; replace throwing-stub `app` in bridge so `Router.serve` becomes real dispatch.
- ~30 LOC — Swap `RouterRequest`/`RoutableApp`/`FormatterHost` interim interfaces for real `ActionDispatch::Request` types.

**Wave 7 PR 1 followups (~25 LOC):**

- ~10 LOC — Drop dead `ESCAPED` regex in `journey/router/utils.ts`. Audit four `UNSAFE_*` regexes for the `/u` flag (non-BMP characters split into surrogate pairs and percent-encode to U+FFFD bytes; Rails works on UTF-8 bytes).
- ~15 LOC — `unescapeUri` non-BMP support (`codePointAt` + variable step).
- Pre-existing: `normalizePath` `%Aa` not normalized (faithful Rails port — `/(%[a-f0-9]{2})/` no `/i`). `toGraphviz` doesn't escape label content (`@internal` debug-only, same as Rails). `escapeSegment`/`unescapeUri` callers in trails (activerecord URL generation, actionview link helpers) may have depended on old buggy `+` handling — grep when next touching routing.

**Total: 10 PRs, ~4670 TS LOC.** PRs 4 and 6 can ship in parallel once
PR 3 lands; PR 5 follows PR 4 (Path/Pattern subclasses
`Visitors::Visitor`).

Per-PR notes:

- **PR 1** ports `nfa/dot` (debug graphviz helper) for path-parity with
  `api:compare`; skip its test (Rails has none).
- **PR 2** ports Ruby `StringScanner` as a small TS class (mirrors what
  `arel` did for similar token-stream needs).
- **PR 3** ports `parser.rb` as a **hand-written recursive-descent
  parser**. Rails' parser is generated from a Racc grammar; the
  grammar is tiny (path segments, optionals, groups, slashes, dots,
  stars). Do **not** port the Racc output table verbatim. Audit the
  generated parser's accept states against
  `route/definition/parser_test.rb` to verify no uncovered edge cases.
- **PR 4** wires `Journey::Format` + Parameter struct + the
  `FormatBuilder`/`Each`/`String`/`Dot`/`FunctionalVisitor` visitor
  classes. No direct visitor tests in Rails — covered transitively by
  pattern_test (PR 5).
- **PR 5** ports `AnchoredRegexp` / `UnanchoredRegexp` (both inline
  `Visitor` subclasses in pattern.rb). See Risks for regex semantics.
- **PR 9** has the largest test surface (`router_test.rb` 538 LOC) —
  if the port overshoots, split test fixtures into PR 9b.
- **PR 10** is the only PR that touches code outside
  `actiondispatch/journey/`. Open question: does the current
  `routing/route-set.ts` already expose a router-swap seam? Audit
  before opening PR 10; if absent, prepend a small seam-creation PR.

#### Tooling impact

Zero changes to `scripts/api-compare/conventions.ts` or `config.ts`:
`actiondispatch/journey/` lives under the already-configured
`actionpack` package, and journey's filenames (`gtg`, `nfa`, etc.)
need no `FILE_OVERRIDES` entries. Test-compare picks up
`**/*.test.ts` siblings automatically; Rails' `test/journey/` is
already under `actionpack/test/`. This wave behaves like Wave 2
(`http/`, `middleware/` moves), not Wave 3 (abstractcontroller — new
package).

#### Risks + open questions

- **Regex semantics — Ruby Regexp vs JS RegExp.** `path/pattern.rb`
  builds anchored/unanchored regexes from the AST. Named captures
  (`(?<name>...)`), named backrefs (`\k<name>`), and absent default
  multiline-dot are all OK in modern Node. Ruby's `\A`/`\z` anchors
  need careful translation to `^`/`$` with `m`-flag awareness. Use the
  `/d` flag everywhere journey compiles a regex (for `.indices`
  parity with Ruby's `MatchData` offsets) and assert the Node floor
  in `package.json#engines`.
- **String performance — UTF-16 indexing.** `Simulator#simulate` is
  the per-request hot path; Ruby strings are byte-arrays, JS strings
  are UTF-16 code units. ASCII paths (the common case) are a wash;
  non-BMP characters (e.g. emoji in URLs) differ. Risk: low — document
  the divergence, don't chase.
- **Routing perf.** Worth porting one or two Rails journey benchmarks
  (look under `actionpack/test/dispatch/routing/` for `bench_*`
  fixtures) so PR 10 can demonstrate no regression. Defer benchmark
  fixtures to PR 10 unless an earlier PR exposes a hotspot.
- **Memoization patterns.** `@x ||= compute` is pervasive in journey
  (every accessor in `path/pattern.rb`, `routes.rb`, `route.rb`).
  Standardize on the **private nullable field + getter** pattern used
  in `relation.ts`: `get x(): T { return this._x ??= this.compute(); }`.
- **`route-set.ts` seam.** Audit before opening PR 10.

#### Out of scope (journey-specific)

- test-compare BLOCKED vocabulary alignment for journey tests (see
  [test-compare-100-plan.md](test-compare-100-plan.md)).
- `actiondispatch/routing/mapper.rb` integration (constraints, scopes,
  format DSLs) — tracked in
  [actiondispatch-100-percent.md](actiondispatch-100-percent.md).
- Custom router monkey-patch surfaces — trails won't expose them.
- Benchmark parity against Rails routing as a hard requirement.

### Wave 8+ — selective fill-in (open-ended)

Per-file ports for missing `middleware/*` files and `http/*` files.
Sequenced by what unblocks `actioncontroller-100-percent.md` cleanup.
Drives independently of this audit.

**Total restructure work: 6 mechanical PRs (Waves 1–6: skeleton +
dispatch moves + abstractcontroller split + Rails-literal hyphenated
rename / action-pack namespace + testing relocation + conventions/infra;
Wave 5 is bundled into Wave 6 as a ~10 LOC edit) + Wave 7 journey port
(10 PRs per the inline section above) + open-ended fill-in (Wave 8+).**

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
roots the lookup at `packages/actionpack/src/action-dispatch/`. So once
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

Creating `packages/actionpack/src/abstract-controller/` as a top-level
sibling means teaching the tooling about a new logical package:

- `scripts/api-compare/config.ts`: append `abstractcontroller` to
  `PACKAGES`, then add
  `PACKAGE_DIR_OVERRIDES.abstractcontroller = "actionpack"` and
  `PACKAGE_SRC_SUBDIR.abstractcontroller = "abstractcontroller"`.
- `scripts/api-compare/compare.ts`: add `abstractcontroller` to the
  `DETAIL_PACKAGES` set.
- `scripts/test-compare/extract-ts-tests.ts`: add a glob for
  `packages/actionpack/src/abstract-controller/**/*.test.ts` and
  expose it under the new `abstractcontroller` package key.
- `scripts/test-compare/test-compare.ts` (`extractRelativeTsPath`) and
  `scripts/test-compare/generate-stubs.ts`: add
  `abstractcontroller: "packages/actionpack/src/abstract-controller/"`
  to the `pkgDirs` maps.
- `scripts/test-compare/extract-ruby-tests.rb`: add
  `"abstractcontroller" => File.join(RAILS_DIR, "actionpack", "test")`
  with include rules pointing at Rails' `actionpack/test/abstract/`.

These script edits ship in the single Wave 3 PR alongside the
directory creation, so the same commit that moves files into
`abstractcontroller/` teaches the matchers to look there. ~20 LOC
total — folds into Wave 3's ~450 LOC budget.

### Wave 3.5 (Rails-literal hyphenated rename + action-pack/) — script edits required

The rename of all three existing subdirs (`abstractcontroller/` →
`abstract-controller/`, etc.) plus the new `action-pack/` namespace
forces edits across every tooling file that hardcodes subdir paths.
See Wave 3.5 above for the full list of edits across `vendor/sources.ts`,
`scripts/api-compare/{config,compare}.ts`, and `scripts/test-compare/`.
~40 LOC of script edits; folds into Wave 3.5's mechanical-rename PR.

### Waves 1, 2, 6, 7, 8+ — no tooling changes

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

## CI integration plan

The waves above grow the actionpack test footprint substantially —
Wave 7 (journey port) alone adds 1500–2000 LOC, and Wave 3 promotes
`abstractcontroller/` to a logical top-level package. The full plan
for splitting actionpack out of the shared `unit-tests` job into a
dedicated no-DB `actionpack-tests` job (recommended sequencing,
risks, cross-package integration test handling, open questions) lives
in [ci-improvement-plan.md](ci-improvement-plan.md).

Headline:

- **Where today:** actionpack tests run inside the batched
  `unit-tests` job alongside arel/activemodel/activesupport/rack/
  actionview/trailties (the `unit-tests` job's `pnpm vitest run`
  step in `.github/workflows/ci.yml`).
- **Recommended split:** dedicated `actionpack-tests` job, no DB,
  parallel-safe.
- **When:** Wave 1.5 PR — after Wave 1 (skeleton) and before Wave 7
  (journey port).
- **Size:** ~50 LOC of workflow YAML.

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
`find vendor/rails/actionpack/lib -name '*.rb'`.
