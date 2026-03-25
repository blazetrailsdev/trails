# ActionController: Road to 100% Test Coverage

Current state: **0.4%** (7 matched / 1,860 total Rails tests). 8/91 files matched, 229 misplaced, 0 wrong describes.

In Rails, ActionController lives inside the ActionPack gem alongside ActionDispatch. The package has been restructured so that `packages/actionpack/` contains both `actioncontroller/` and `actiondispatch/` side by side.

## What's been built

We now have a working ActionController implementation with the full Rails inheritance chain:

```
AbstractController::Base → ActionController::Metal → ActionController::Base
                                                   → ActionController::API
```

### Implementation files

| File                                      | What it provides                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actioncontroller/abstract-controller.ts` | Action dispatch, callbacks (before/after/around), skip, only/except/if/unless/prepend, class hierarchy traversal                                                                         |
| `actioncontroller/metal.ts`               | Request/Response/Params, `dispatch()`, `head()`, status codes (22 symbols), headers, `toRackResponse()`                                                                                  |
| `actioncontroller/base.ts`                | Rendering (json/plain/html/body/text), redirects, flash, CSRF, `rescue_from`, conditional GET (freshWhen/stale/expiresIn), `sendFile`/`sendData`, content negotiation, template resolver |
| `actioncontroller/index.ts`               | Package exports                                                                                                                                                                          |

### Test files (263 tests, all passing)

| File                          | Tests | Coverage area                                                                                   |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `abstract-controller.test.ts` | 22    | Callbacks, action dispatch, inheritance, skip, conditions                                       |
| `metal.test.ts`               | 25    | Status codes, headers, dispatch, head, params, Rack response                                    |
| `base.test.ts`                | 44    | Rendering, redirects, flash, rescue, caching, sendData, API                                     |
| `filters.test.ts`             | 17    | Controller-level before/after/around with only/except/if/unless/prepend/skip/inherit            |
| `rendering.test.ts`           | 31    | All render variants, head, renderToString, double render, implicit render, API rendering        |
| `redirect.test.ts`            | 11    | redirect_to, redirect_back, status codes, referer, fallback                                     |
| `caching.test.ts`             | 13    | freshWhen, stale, ETag, Last-Modified, 304, expiresIn, expiresNow                               |
| `rescue.test.ts`              | 10    | rescue_from, subclass matching, inheritance, async handlers                                     |
| `test-case.test.ts`           | 51    | Rails-style controller testing: HTTP verbs, params, session, flash, assertions                  |
| `integration-test.test.ts`    | 39    | Full-stack integration: routing, session/cookie persistence, redirects, multi-request workflows |

### Supporting changes

- `actiondispatch/request.ts` — Added `getHeader()` for Rack env header access
- `actiondispatch/parameters.ts` — Added `expect()` (Rails 8), `toQuery()`, `equals()`, `UnpermittedParameters`, `actionOnUnpermittedParameters`, deep `toUnsafeHash()`, `delete()` with default
- `actiondispatch/routing/mapper.ts` — Namespace controller prefixing, nested resource parent params (`:post_id`), constraint propagation, route ordering (collection before member), member/collection scope fixes
- `actiondispatch/routing/resource-routing.test.ts` — 40 tests for RESTful resource routing
- `actiondispatch/routing/controller-routing.test.ts` — 29 tests for controller routing integration
- `scripts/test-compare/extract-ts-tests.ts` — All 8 controller test files + 2 new routing test files registered

## Current state by feature area

| #   | Feature Area                  | Missing    | Matched  | Status                                                                                                  |
| --- | ----------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Parameters                    | ~100       | 201      | Comprehensive: slice/except/merge/transform/select/compact/fetch/dig/deepDup/toQuery/equality/iteration |
| 2   | Rendering                     | ~107       | ~142     | Template pipeline done (action/partial/collection/layout). Streaming remains                            |
| 3   | Testing harness               | ~134       | 90       | TestCase (51) + IntegrationTest (39) done, more edge cases remain                                       |
| 4   | Routing (controller)          | ~150       | 80       | Resource routing, controller routing, namespace/scope/constraints done                                  |
| 5   | Other (base, assertions, etc) | ~185       | ~44      | Base skeleton done, assertions/logging/helpers remain                                                   |
| 6   | Security/Auth                 | ~113       | 45       | CSRF/auth impl exists, controller integration tests needed                                              |
| 7   | Content negotiation           | ~67        | 28       | respond_to impl exists, edge cases remain                                                               |
| 8   | Filters/Callbacks             | ~15        | ~39      | Core filters done, edge cases remain                                                                    |
| 9   | AbstractController            | ~10        | ~42      | Core done, Translation/Collector remain                                                                 |
| 10  | Streaming                     | 40         | 0        | Not started                                                                                             |
| 11  | Caching                       | ~19        | ~13      | Conditional GET done, HTTP caching edge cases remain                                                    |
| 12  | Error handling                | ~22        | ~10      | rescue_from done, show_exceptions remain                                                                |
| 13  | URL generation                | ~30        | 29       | Mostly done                                                                                             |
| 14  | Redirects                     | ~15        | ~39      | Core done, edge cases remain                                                                            |
| 15  | File sending                  | ~26        | ~0       | sendFile/sendData impl exists, needs tests                                                              |
| 16  | Flash (controller)            | ~10        | 37       | Mostly done                                                                                             |
|     | **TOTAL**                     | **~1,069** | **~843** |                                                                                                         |

## Dependency graph

```
AbstractController::Base (DONE — 22 tests)
   │
   ├── Callbacks (DONE — 22 + 17 tests)
   ├── Collector (5 tests) ── format collection
   └── Translation (21 tests) ── I18n (may defer)

ActionController::Metal (DONE — 25 tests)
   │
   └── dispatch, head, status codes, params, Rack response

ActionController::Base (DONE — 44 + 31 + 11 + 13 + 10 tests)
   │
   ├── Rendering (PARTIALLY DONE — 31 tests)
   │     ├── json/plain/html/body/text (DONE)
   │     ├── head (DONE)
   │     ├── renderToString (DONE)
   │     ├── Double render prevention (DONE)
   │     ├── Template resolver (DONE — pluggable)
   │     ├── render_action (23) ── NOT STARTED
   │     ├── render_template (18) ── NOT STARTED
   │     ├── render_layout (10) ── NOT STARTED
   │     ├── render_streaming (8) ── NOT STARTED
   │     ├── render_partial (4) ── NOT STARTED
   │     └── renderer (25) ── NOT STARTED
   │
   ├── Filters/Callbacks (DONE — 17 tests)
   │     └── before/after/around, skip, only/except/if/unless, prepend, inherit
   │
   ├── Redirecting (DONE — 11 tests)
   │     └── redirect_to, redirect_back, status codes, referer
   │
   ├── Caching (DONE — 13 tests)
   │     └── freshWhen, stale, ETag, Last-Modified, 304, expiresIn, expiresNow
   │
   ├── Rescue (DONE — 10 tests)
   │     └── rescue_from, subclass matching, inheritance, async
   │
   ├── Flash (DONE via actiondispatch — 37 tests)
   ├── CSRF (DONE via actiondispatch — 44 tests)
   ├── Parameters deep (MOSTLY DONE — 118 tests, nested permit/expect/toQuery/equality/unpermitted)
   ├── Security/Auth (113 tests, 45 matched) ── needs controller integration
   ├── Content negotiation (67 tests, 28 matched) ── needs edge cases
   ├── Routing (PARTIALLY DONE — 269 tests: resource routing, controller routing, namespaces, shallow, concerns)
   ├── File sending (26 missing) ── impl exists, needs tests
   ├── Streaming (40 missing) ── NOT STARTED
   │
   └── Other (229 missing)
       ├── ActionPack assertions (44)
       ├── Log subscriber (34)
       ├── Helpers (23)
       └── Misc (128)

ActionController::API (DONE — included in base.test.ts)

Testing (90/224 done) ── IN PROGRESS
   ├── TestCase (51 passing)
   └── IntegrationTest (39 passing)
```

## Remaining workstreams

### Stream 1: Parameters deep (~193 missing) — MOSTLY DONE

Parameters now has 118 tests covering nested permit, expect (Rails 8), toQuery, equality, unpermitted params action, delete with default, deep dup, and more. Remaining work:

- **params wrapper** (31 missing) — auto-wrapping root key
- **permit edge cases** (~30 missing) — deeply nested hashes, arrays of hashes
- **logging** (18 missing) — log unpermitted params (integration with logger)
- **other** (~114 missing) — various edge cases

### Stream 2: Rendering deep (~238 missing)

Simple rendering is done. Remaining:

- **Action-based rendering** (23) — `render :index`, implicit render
- **Template rendering** (18) — template lookup pipeline
- **Layout wrapping** (10) — layout around content
- **Standalone renderer** (25) — `ApplicationController.renderer.render`
- **Partial rendering** (4) — `render partial: "form"`
- **Streaming** (8) — `render stream: true`
- **Other render tests** (43)

### Stream 3: Security/Auth controller integration (~113 missing, 45 matched)

- CSRF controller integration (56 missing) — verify tokens in controller context
- HTTP Basic (15 missing) — controller integration tests
- HTTP Token (21 missing) — controller integration tests
- HTTP Digest (21 missing) — may defer

### Stream 4: Content negotiation deep (~67 missing, 28 matched)

- respond_to edge cases (38 missing)
- Content-Type handling (23 missing)
- Accept header parsing (6 missing)

### Stream 5: Routing from controllers (~150 missing, 80 matched)

69 new tests added across two new files. Mapper implementation improved with namespace controller prefixing, nested resource parent params (`:post_id`), constraint propagation, and route ordering (collection before member). Remaining:

- **URL generation from controller context** (~60 missing)
- **Route helpers** (~30 missing) — `_path`/`_url` helper generation
- **Advanced routing** (~60 missing) — direct routes, polymorphic URLs, mounted engines

### Stream 6: Remaining features (~170 missing)

- File sending tests (26) — sendFile/sendData (impl exists)
- Error handling edge cases (22) — show_exceptions
- Streaming / SSE (40) — ActionController::Live
- URL generation edge cases (30)
- Redirect edge cases (15)
- Flash controller integration (10)
- AbstractController remainder (10) — Translation, Collector

### Stream 7: Other and cleanup (~229 missing)

- ActionPack assertions (44) — assert_redirected_to, assert_response
- Log subscriber (34)
- Helpers (23)
- Various small features (128)

### Stream 8: Testing harness (~134 remaining) — IN PROGRESS

TestCase (51 tests) and IntegrationTest (39 tests) are built and passing. Remaining:

- TestCase edge cases (~80) — file uploads, process method, assigns, template assertions
- IntegrationTest edge cases (~54) — open_session, multipart, HTTPS, host setting

## What might be out of scope

Some Rails controller features are deeply tied to Ruby/Rails infrastructure:

- **ERB template compilation** (~50 tests) — Could support a pluggable template engine without implementing ERB itself
- **Live streaming / SSE** (40 tests) — Needs event loop / WebSocket integration
- **HTTP Digest authentication** (21 tests) — Uncommon, could defer
- **Localized templates** (5 tests) — I18n template lookup
- **Log subscriber** (34 tests) — Instrumentation/logging hooks

If deferred, effective target drops from 1,912 to ~1,762.

## Where the code lives

The package has been restructured into `packages/actionpack/` with the following layout:

```
packages/actionpack/src/
  actioncontroller/
    abstract-controller.ts      # AbstractController::Base
    abstract-controller.test.ts
    metal.ts                    # ActionController::Metal
    metal.test.ts
    base.ts                     # ActionController::Base + API
    base.test.ts
    filters.test.ts
    rendering.test.ts
    redirect.test.ts
    caching.test.ts
    rescue.test.ts
    index.ts                    # Exports
  actiondispatch/
    ...existing actiondispatch code...
  index.ts                      # Re-exports both
```

## Tracking progress

```bash
pnpm run test:compare
```

The compare script now has an `actioncontroller` package entry alongside `actiondispatch`.

Current: ~843 / 1,912 controller tests matched (~44%)
Target: 1,912 / 1,912 (100%)
