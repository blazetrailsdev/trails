# ActionController: Road to 100% Test Coverage

Current state: **11.5%** (220 matched / 1,912 total controller+abstract tests). 0 stubs, 1,692 missing.

In Rails, ActionController lives inside the ActionPack gem alongside ActionDispatch. Our `test:compare` script counts all controller tests under the `actiondispatch` package. This doc covers the `controller/` and `abstract/` test files specifically.

We do not yet have an ActionController implementation. Building one is the single largest piece of work remaining across the entire project.

## Current state

We have **no** `ActionController::Base` class. The 220 matched tests come from features that are implemented standalone in the `actiondispatch` package:

| Area | Matched | Total | Where it lives today |
|---|---|---|---|
| Parameters (permit, accessors) | 42 | 311 | `parameters.ts` |
| Flash | 37 | 47 | `flash.ts` |
| URL generation | 29 | 60 | `url-for.ts` |
| CSRF protection | 44 | 100 | `request-forgery-protection.ts` |
| respond_to | 28 | 66 | `respond-to.ts` |
| Redirects | 28 | 54 | `redirect.ts` |
| Routing (controller side) | 11 | 230 | `routing/` |
| HTTP auth | 1 | 58 | `http-authentication.ts` |
| **Total** | **220** | **1,912** | |

## Summary by feature area

| # | Feature Area | Missing | Matched | Depends On |
|---|---|---|---|---|
| 1 | Parameters | 269 | 42 | Standalone |
| 2 | Rendering | 269 | 0 | Controller base |
| 3 | Testing harness | 224 | 0 | Controller base, routing |
| 4 | Routing (controller) | 219 | 11 | Routing engine |
| 5 | Other (base, assertions, etc) | 229 | 0 | Controller base |
| 6 | Security/Auth | 113 | 45 | Controller base |
| 7 | Content negotiation | 67 | 28 | Controller base |
| 8 | Filters/Callbacks | 54 | 0 | Controller base |
| 9 | AbstractController | 52 | 0 | Standalone |
| 10 | Streaming | 40 | 0 | Controller base |
| 11 | Caching | 32 | 0 | Controller base |
| 12 | Error handling | 32 | 0 | Controller base |
| 13 | URL generation | 30 | 29 | Routing |
| 14 | Redirects | 26 | 28 | Controller base |
| 15 | File sending | 26 | 0 | Controller base |
| 16 | Flash (controller) | 10 | 37 | Controller base |
| | **TOTAL** | **1,692** | **220** | |

## What needs to be built

### 1. AbstractController::Base

The foundation. Rails' `AbstractController::Base` provides:
- Action dispatching — call a method by name based on the route
- Callbacks (before_action, after_action, around_action) — 26 tests
- Response body assignment
- Format collection — 5 tests

### 2. ActionController::Metal

Minimal controller with Rack interface:
- `dispatch(action, request, response)` — processes a request
- `params`, `request`, `response` accessors
- Status code and header management
- `head :ok`, `head :not_found`, etc.

### 3. ActionController::Base

Full controller inheriting from Metal with modules mixed in:
- **Rendering** — `render json:`, `render plain:`, `render html:`, `render body:`, `render status:`
- **Redirecting** — `redirect_to`, `redirect_back`
- **Filters** — `before_action`, `after_action`, `around_action`, `skip_before_action`
- **Strong Parameters** — `params.require().permit()`
- **Flash** — `flash[:notice]`, `flash.now[:alert]`
- **Cookies** — `cookies[:key]`, `cookies.signed`, `cookies.encrypted`
- **Session** — `session[:key]`
- **CSRF** — `protect_from_forgery`, `verify_authenticity_token`
- **Content negotiation** — `respond_to { |format| format.html; format.json }`
- **URL generation** — `url_for`, named route helpers
- **Rescue** — `rescue_from`, exception handling
- **Caching** — conditional GET (`stale?`, `fresh_when`)

### 4. ActionController::API

API-only controller (subset of Base, no view rendering):
- Everything from Base minus HTML rendering, CSRF, cookies, sessions, flash

### 5. Testing infrastructure

- `ActionController::TestCase` — `get :index`, `post :create`, `assert_response`
- `ActionDispatch::IntegrationTest` — full-stack integration tests
- Mock request/response pipeline

## Dependency graph

```
AbstractController::Base (52 tests)  ──── no dependencies
   │
   ├── Callbacks (26 tests) ── before/after/around_action
   ├── Collector (5 tests) ── format collection
   └── Translation (21 tests) ── I18n (may defer)

ActionController::Metal (2 tests)  ──── depends on AbstractController
   │
   └── dispatch(action, request, response)

ActionController::Base  ──── depends on Metal + ActionDispatch
   │
   ├── Parameters deep (269 tests, 42 matched)  ──── mostly standalone
   │     ├── permit / require (63 tests)
   │     ├── accessors (77 tests, 39 matched)
   │     ├── mutators (40 tests, 2 matched)
   │     ├── expect (25 tests) ── Rails 8
   │     ├── nested permit (15 tests)
   │     ├── params wrapper (31 tests)
   │     ├── logging unpermitted (18 tests)
   │     └── other small (22 tests)
   │
   ├── Rendering (269 tests)  ──── needs controller dispatch
   │     ├── render_test.rb (88 tests) ── comprehensive
   │     ├── render_action (23) ── action-based rendering
   │     ├── render_template (18) ── template rendering
   │     ├── render_html/plain/body (40) ── simple string rendering
   │     ├── render_json (10) ── JSON responses
   │     ├── render_layout (10) ── layout wrapping
   │     ├── render_streaming (8) ── streaming responses
   │     ├── render_partial (4) ── partial rendering
   │     ├── renderer (25) ── standalone rendering
   │     └── other (43)
   │
   ├── Filters/Callbacks (54 tests)  ──── needs controller dispatch
   │     └── before_action, after_action, around_action, skip_*
   │
   ├── Security/Auth (113 tests, 45 matched)
   │     ├── CSRF (56 missing, 44 matched) ── controller integration
   │     ├── HTTP Basic (15 missing)
   │     ├── HTTP Digest (21 missing) ── may defer
   │     └── HTTP Token (21 missing, 1 matched)
   │
   ├── Content negotiation (67 tests, 28 matched)
   │     ├── respond_to (38 missing, 28 matched)
   │     ├── content_type (23 missing)
   │     └── accept format (6 missing)
   │
   ├── Routing from controllers (219 tests, 11 matched)
   │     ├── controller routing (140 missing)
   │     ├── resource routing (78 missing)
   │     └── route helpers (1 missing)
   │
   ├── URL generation (30 missing, 29 matched)
   ├── Redirects (26 missing, 28 matched)
   ├── Flash (10 missing, 37 matched)
   ├── File sending (26 missing) ── send_file, send_data
   ├── Error handling (32 missing) ── rescue_from, show_exceptions
   ├── Caching (32 missing) ── conditional GET, ETag, stale?
   ├── Streaming (40 missing) ── SSE, live streaming
   │
   └── Other (229 missing)
       ├── ActionPack assertions (44) ── assert_redirected_to, etc.
       ├── Log subscriber (34) ── request logging
       ├── Helpers (23) ── helper modules
       ├── Base tests (34) ── base + new_base
       ├── Bare metal (22) ── minimal controller
       ├── ConditionalGet (10) ── stale?/fresh_when
       └── Misc (62) ── encoding, rate limiting, etc.

Testing (224 tests)  ──── depends on everything above
   ├── TestCase (132) ── controller test DSL
   └── IntegrationTest (92) ── full-stack tests
```

## Workstreams

### Stream 1: Parameters deep (269 missing) — STANDALONE, START NOW

Parameters is the most independently testable area. We already have `parameters.ts` with 42 matched tests. The remaining work is:

- **permit edge cases** (62 missing) — nested hashes, arrays of hashes, scalar filtering
- **expect** (25 missing) — Rails 8's `params.expect(post: [:title, :body])`
- **mutators** (38 missing) — `delete`, `extract!`, `merge`, `reverse_merge`, `transform_keys`
- **nested permit** (15 missing) — deeply nested strong parameters
- **dup/equality** (14 missing) — `dup`, `==`, `eql?`, `hash`
- **params wrapper** (31 missing) — auto-wrapping root key
- **logging** (18 missing) — log unpermitted params
- **serialization** (4 missing) — to_h, to_query, to_unsafe_h
- **required params** (12 missing) — ActionController::ParameterMissing
- **other** (50 missing)

### Stream 2: AbstractController (52 missing) — STANDALONE, START NOW

Build `AbstractController::Base`:
- Callbacks system (26 tests) — can reuse activesupport's callback infrastructure
- Collector (5 tests) — format collection for respond_to
- Translation (21 tests) — I18n lookup from controller context (may defer)

### Stream 3: Controller::Metal + Base skeleton (~100 tests) — AFTER Stream 2

Build the minimal controller dispatch pipeline:

```typescript
class Metal {
  request: Request;
  response: Response;
  params: Parameters;

  dispatch(action: string, req: Request, res: Response): Response {
    this.request = req;
    this.response = res;
    this.params = req.parameters;
    this[action]();
    return this.response;
  }
}

class Base extends Metal {
  // Mix in: Rendering, Redirecting, Filters, Flash, Cookies, etc.
}
```

This unlocks: base_test (21), bare_metal (22), metal_test (2), many other controller tests.

### Stream 4: Filters/Callbacks (54 missing) — AFTER Stream 3

Implement the filter chain on controller base:
- `before_action :authenticate`, `after_action :log`, `around_action :wrap`
- `skip_before_action`, `only:`, `except:`, `if:`, `unless:`
- Halting (rendering/redirecting in a before_action stops the chain)

### Stream 5: Rendering (269 missing) — AFTER Stream 3

**Phase 5a — Simple rendering (~80 tests)**

The easy wins — rendering strings and data without templates:
- `render plain: "hello"` → set body to string
- `render html: "<h1>Hi</h1>"` → set body with text/html
- `render json: { ok: true }` → JSON.stringify + application/json
- `render body: "raw"` → raw body
- `render status: 404` / `head :not_found`
- `render_to_string` — render without sending

**Phase 5b — Action/template rendering (~120 tests)**

This is the hard part. Rails looks up templates by controller name + action:
- `render :index` → looks for `app/views/posts/index.html.erb`
- Implicit render — action without explicit render renders its template
- Layout wrapping — wrap in `application.html.erb`

For TypeScript, we could support a pluggable template resolver without implementing ERB:
```typescript
Base.templateResolver = (controller, action, format) => string | null;
```

**Phase 5c — Partial and streaming (~70 tests)**

- Partial rendering — `render partial: "form"`
- Streaming — `render stream: true`, ActionController::Live
- Content negotiation rendering — different templates per format

### Stream 6: Security/Auth (113 missing, 45 matched) — AFTER Stream 3

- CSRF protection controller integration (56 missing) — needs controller to verify tokens
- HTTP Basic auth (15 missing) — implementation exists, needs controller integration tests
- HTTP Token auth (21 missing, 1 matched) — similar
- HTTP Digest auth (21 missing) — complex, may defer

### Stream 7: Content negotiation (67 missing, 28 matched) — AFTER Stream 3

- respond_to edge cases (38 missing) — format blocks, any/all, custom types
- Content-Type handling (23 missing) — setting response content type
- Accept header parsing (6 missing)

### Stream 8: Routing from controllers (219 missing) — AFTER Stream 3

- Controller routing (140 missing) — generating URLs from controller context, polymorphic routing
- Resource routing (78 missing) — RESTful resource route testing through controllers
- Route helpers (1 missing)

### Stream 9: Remaining features (parallel, ~170 missing) — AFTER Stream 3

- URL generation controller integration (30 missing)
- Redirects controller integration (26 missing)
- File sending (26 missing) — `send_file`, `send_data`
- Error handling (32 missing) — `rescue_from`, exception display
- Caching (32 missing) — `stale?`, `fresh_when`, conditional GET
- Flash controller integration (10 missing)
- Streaming (40 missing) — ActionController::Live, SSE

### Stream 10: Other and cleanup (~229 missing)

- ActionPack assertions (44) — `assert_redirected_to`, `assert_response`
- Log subscriber (34) — request logging
- Helpers (23) — controller helper modules
- Various small features (128)

### Stream 11: Testing harness (224 missing) — LAST

- `ActionController::TestCase` (132 tests) — functional test DSL
- `ActionDispatch::IntegrationTest` (92 tests) — full-stack testing

This should be built last because it tests everything else.

## Recommended execution order

```
Phase 1 — No controller needed (parallel):
  Stream 1: Parameters deep (269 tests)
  Stream 2: AbstractController (52 tests)
  Total: ~321 tests → coverage ~28%

Phase 2 — Controller skeleton:
  Stream 3: Metal + Base (100 tests)
  Stream 4: Filters/Callbacks (54 tests)
  Total: ~154 tests → coverage ~36%

Phase 3 — Core controller features (parallel):
  Stream 5a: Simple rendering (80 tests)
  Stream 6: Security/Auth (113 tests)
  Stream 7: Content negotiation (67 tests)
  Stream 9: Remaining features (170 tests)
  Total: ~430 tests → coverage ~58%

Phase 4 — Advanced rendering and routing:
  Stream 5b: Template rendering (120 tests)
  Stream 5c: Partial/streaming (70 tests)
  Stream 8: Routing from controllers (219 tests)
  Total: ~409 tests → coverage ~80%

Phase 5 — Testing and cleanup:
  Stream 10: Other (229 tests)
  Stream 11: Testing harness (224 tests)
  Total: ~453 tests → 100%
```

## What might be out of scope

Some Rails controller features are deeply tied to Ruby/Rails infrastructure:

- **ERB template compilation** (~50 tests) — Could support a pluggable template engine without implementing ERB itself
- **Live streaming / SSE** (40 tests) — Needs event loop / WebSocket integration
- **HTTP Digest authentication** (21 tests) — Uncommon, could defer
- **Localized templates** (5 tests) — I18n template lookup
- **Log subscriber** (34 tests) — Instrumentation/logging hooks

If deferred, effective target drops from 1,912 to ~1,762.

## Where to put the code

Options:
1. **Inside `packages/actiondispatch/`** — Matches how Rails bundles ActionPack. Simplest.
2. **New `packages/actioncontroller/`** — Cleaner separation. More packages to manage.

Recommendation: Start inside `actiondispatch` under `src/controller/`. Extract later if it grows beyond ~1,000 lines. The test:compare script already maps `controller/` tests to actiondispatch.

## Tracking progress

```bash
npm run test:compare
```

Controller coverage is embedded in the actiondispatch number. To track controller-specific progress, grep the comparison report for `controller/` files.

Current: 220 / 1,912 controller tests matched (11.5%)
Target: 1,912 / 1,912 (100%)
