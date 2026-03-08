# ActionDispatch: Road to 100% Test Coverage

Current state: **18%** (603 matched / 3,354 total Rails tests). 0 stubs, 2,751 missing tests.

Unlike ActiveRecord (which has many `it.skip` stubs to convert), ActionDispatch's gap is entirely **missing tests** — tests that exist in Rails but have no TypeScript counterpart at all. This means the work is about implementing features and writing new test files, not unskipping existing tests.

## How coverage is measured

`npm run test:compare` matches Rails Ruby test names against our TypeScript `it()` tests by description. "Missing" means no TS test with a matching name exists.

## Current implementation

We already have 23 test files and 30 source files covering:

- **Routing** — `Mapper` DSL (resources, resource, namespace, scope, member, collection, concerns, constraints, shallow), `RouteSet` matching, `Route` objects, URL generation, route inspector
- **Request/Response** — ActionDispatch request/response wrapping Rack
- **Parameters** — `ActionController::Parameters` with permit/require
- **Cookies** — CookieJar with signed, encrypted, permanent cookies
- **Flash** — Flash messages
- **Sessions** — CookieStore
- **Security** — CSRF protection, CSP, Permissions Policy, SSL enforcement, Host Authorization, HTTP auth (Basic, Token, Digest)
- **Middleware** — Stack, Static, RequestId, SSL, HostAuthorization, DebugExceptions
- **Content** — MIME type negotiation, respond_to, redirect helpers, URL generation, uploaded files, exception wrapper

## Summary by feature area

| # | Feature Area | Missing | Matched | Key Blocker |
|---|---|---|---|---|
| 1 | Controller Core | 814 | 158 | Needs ActionController |
| 2 | Routing | 600 | 164 | Routing engine gaps |
| 3 | Controller Rendering | 295 | 28 | Needs ActionController + views |
| 4 | Controller Testing | 132 | 0 | Needs test harness |
| 5 | Request | 125 | 74 | Param parsing, edge cases |
| 6 | Middleware | 109 | 0 | Individual middleware impl |
| 7 | Cookies | 96 | 41 | Cookie edge cases |
| 8 | Sessions | 87 | 0 | Session stores |
| 9 | Security Middleware | 81 | 0 | SSL/Host auth edge cases |
| 10 | Error Handling | 73 | 5 | Debug exceptions, rescue |
| 11 | Controller Filters | 54 | 0 | Needs ActionController |
| 12 | Response | 52 | 27 | Response edge cases |
| 13 | System Testing | 44 | 0 | Browser automation — defer |
| 14 | Other small areas | 189 | 106 | Various |
| | **TOTAL** | **2,751** | **603** | |

## The ActionController question

A large portion of the missing tests (1,295 out of 2,751 — 47%) live under `controller/` and test ActionController behavior: filters, rendering, caching, streaming, test harness, params wrapping, etc. In Rails, ActionDispatch and ActionController are tightly coupled — ActionDispatch handles routing and middleware, ActionController handles the actual request processing.

We have two options:

1. **Build a minimal ActionController within actiondispatch** — just enough to run controller tests (filters, rendering to string, params handling). This is simpler but blurs package boundaries.
2. **Create a separate `@rails-ts/actioncontroller` package** — more faithful to Rails structure but more setup overhead.

Recommendation: Start with option 1, extracting to a separate package later if it grows large enough. Many controller tests can be satisfied with a lightweight controller base class that dispatches actions, runs filters, and returns responses.

## Dependency graph

```
Routing (600 missing)  ──── mostly standalone, some needs controller
   │
   ├── Journey (routing internals)
   │     ├── Path patterns (20 missing)
   │     ├── Route parser/scanner (22 missing)
   │     ├── Router (10 missing, 25 matched)
   │     ├── GTG builder/table (14 missing)
   │     └── Routes collection (6 missing)
   │
   ├── Mapper (21 missing) ── route DSL edge cases
   ├── RouteSet (178 missing, 116 matched) ── matching, generation
   ├── Inspector (28 missing, 3 matched) ── route listing
   ├── Resources (78 missing) ── resource routing
   ├── URL generation (37 missing) ── url_for from routes
   ├── Prefix generation (45 missing) ── engine mounting
   └── Routing assertions (29 missing, 4 matched) ── test helpers

Controller (1,295 missing) ──── needs ActionController base
   │
   ├── Core behavior (814 missing)
   │     ├── Parameters (permit/expect/dup/etc) (~170 missing, 42 matched)
   │     ├── CSRF protection (56 missing, 44 matched)
   │     ├── URL generation (29 missing, 29 matched)
   │     ├── respond_to (38 missing, 28 matched)
   │     ├── HTTP auth (36 missing, 1 matched)
   │     ├── Flash (10 missing, 14 matched)
   │     ├── Caching (32 missing)
   │     ├── Action assertions (44 missing)
   │     ├── Rescue/exceptions (23 missing)
   │     ├── Helpers (23 missing)
   │     ├── Base (21 missing)
   │     ├── Send file (26 missing)
   │     └── Other (~300 missing)
   │
   ├── Rendering (295 missing, 28 matched) ── needs view layer
   │     ├── render_test.rb (88 missing)
   │     ├── redirect_test.rb (25 missing, 28 matched)
   │     ├── render_action/template/html/plain/body/etc (~100 missing)
   │     └── Renderers, streaming (50 missing)
   │
   ├── Filters (54 missing) ── before/after/around_action
   └── Testing (132 missing) ── ActionController::TestCase

Request/Response (177 missing, 101 matched)  ──── mostly standalone
   ├── Request (125 missing, 74 matched)
   │     ├── Core request (47 missing, 74 matched)
   │     ├── JSON param parsing (15 missing)
   │     ├── Multipart param parsing (15 missing)
   │     ├── Query string parsing (17 missing)
   │     ├── URL-encoded parsing (10 missing)
   │     ├── Request ID (10 missing)
   │     └── Test request (11 missing)
   │
   └── Response (52 missing, 27 matched)
       ├── Core response (26 missing, 27 matched)
       ├── Live response (10 missing)
       ├── Response assertions (11 missing)
       └── Test response (5 missing)

Middleware (109 missing)  ──── standalone
   ├── Middleware stack (28 missing) ── insertion, deletion, ordering
   ├── Static file serving (35 missing) ── file lookup, caching headers
   ├── Abstract callbacks (26 missing) ── AbstractController callbacks
   ├── Executor/Reloader (19 missing) ── app lifecycle hooks
   └── Other (1 missing)

Cookies (96 missing, 41 matched)  ──── mostly standalone
   └── dispatch/cookies_test.rb (96 missing, 41 matched)
       ── signed, encrypted, permanent, httponly, secure, same_site,
          domain, expiry, JSON serialization, rotation

Sessions (87 missing)  ──── needs cookie infrastructure
   ├── Cookie store (27 missing) ── session in signed cookie
   ├── Session request (22 missing) ── session access from request
   ├── Cache store (11 missing) ── session backed by cache
   ├── Test session (13 missing) ── mock session for tests
   ├── MemCache store (9 missing) ── memcached backend (defer?)
   └── Abstract stores (5 missing) ── base session store

Security Middleware (81 missing)  ──── standalone
   ├── SSL enforcement (39 missing) ── HSTS, redirect, secure cookies
   ├── Host authorization (41 missing) ── allowed hosts, DNS rebinding
   └── Assume SSL (1 missing)

Error Handling (73 missing, 5 matched)  ──── mostly standalone
   ├── Debug exceptions (42 missing) ── dev error pages
   ├── Exception wrapper (15 missing, 5 matched) ── wrapping/tracing
   ├── Show exceptions (9 missing) ── prod error responses
   └── Actionable exceptions (6 missing) ── clickable fixes
   └── Debug locks (1 missing)

Security Policies (26 missing, 22 matched)  ──── standalone
   ├── CSP (17 missing, 19 matched) ── Content-Security-Policy
   └── Permissions Policy (9 missing, 3 matched)
```

## Workstreams (can run in parallel)

### Stream A: Routing (600 missing — 22% of total)

The largest standalone area. The core routing DSL already works (116 matched in routing_test.rb), but many edge cases and subsystems are missing.

**Phase A1 — Journey internals (72 missing)**

The Journey router is Rails' internal route matching engine. We have a basic implementation but need:
- Path pattern parsing and matching (20 missing)
- Route definition parser/scanner (22 missing)
- GTG (Generalized Transition Graph) builder (14 missing)
- Routes collection management (6 missing)
- Router edge cases (10 missing, 25 already matched)

**Phase A2 — Routing DSL and matching (248 missing)**

- `dispatch/routing_test.rb` — 178 missing, 116 matched. This is the main routing test file. Many edge cases: optional segments, glob routes, format constraints, engine mounting, route precedence.
- `controller/routing_test.rb` — 140 missing, 11 matched. Controller-level routing (named routes, url helpers, polymorphic routing).
- `dispatch/mapper_test.rb` — 21 missing. Mapper DSL edge cases.

**Phase A3 — Resource routing (78 missing)**

`controller/resources_test.rb` — 78 missing, 0 matched. Comprehensive resource routing tests: nested resources, singular resources, namespaced resources, shallow nesting, member/collection routes, path customization.

**Phase A4 — URL generation and helpers (120 missing)**

- URL generation from routes (37 missing)
- Prefix generation / engine mounting (45 missing)
- Routing assertions for tests (29 missing, 4 matched)
- Route inspector (28 missing, 3 matched)
- Custom URL helpers (8 missing)
- Concerns (11 missing)

### Stream B: Request/Response (177 missing)

Partially implemented. Can start immediately.

**Phase B1 — Request edge cases (125 missing)**

- Core request tests (47 missing, 74 matched) — IP detection, content type parsing, host/port, xhr detection
- Param parsing: JSON (15), multipart (15), query string (17), URL-encoded (10) — these may largely delegate to Rack
- Request ID (10 missing) — middleware exists but tests don't match
- Test request (11 missing)

**Phase B2 — Response edge cases (52 missing)**

- Core response (26 missing, 27 matched) — headers, body, status, content type, cache control
- Live response (10 missing) — streaming responses
- Response assertions (11 missing) — test helpers
- Test response (5 missing)

### Stream C: Middleware (109 missing)

All standalone. Can start immediately.

- Middleware stack (28 missing) — insert, delete, swap, move operations. Implementation exists but tests don't match.
- Static file serving (35 missing) — implementation exists, needs tests
- Abstract callbacks (26 missing) — AbstractController callback lifecycle
- Executor/Reloader (19 missing) — app boot/reload lifecycle
- Misc (1 missing)

### Stream D: Cookies (96 missing)

Implementation exists with 41 matched tests. Remaining work is edge cases:

- Signed/encrypted cookie rotation
- Domain handling (multiple domains, all subdomains)
- JSON serializer fallbacks
- Purpose metadata
- Cookie size limits
- SameSite defaults and overrides
- Permanent cookie max-age

### Stream E: Sessions (87 missing)

Depends on: Cookies (for CookieStore).

- CookieStore (27 missing) — session data in signed cookies. Implementation exists but no tests match.
- Session from request (22 missing) — accessing session in request lifecycle
- Cache-backed sessions (11 missing)
- Test session mocking (13 missing)
- Abstract store base (5 missing)
- MemCache store (9 missing) — may defer, requires memcached

### Stream F: Security Middleware (81 missing)

Implementations exist for SSL and HostAuthorization but tests don't match.

- SSL (39 missing) — HSTS headers, HTTP->HTTPS redirect, secure cookies, exclude paths
- Host Authorization (41 missing) — allowed hosts patterns, DNS rebinding protection
- Assume SSL (1 missing)

### Stream G: Error Handling (73 missing)

- Debug exceptions (42 missing) — development error pages with source snippets
- Exception wrapper (15 missing, 5 matched) — exception cause chain, backtrace cleaning
- Show exceptions (9 missing) — production error responses
- Actionable exceptions (6 missing) — exceptions with suggested fixes
- Debug locks (1 missing)

### Stream H: Security Policies (26 missing)

Nearly complete. Implementations exist.

- CSP (17 missing, 19 matched) — nonce generation, report-only mode, policy merging
- Permissions Policy (9 missing, 3 matched) — feature policy directives

### Stream I: Controller (1,295 missing — 47% of total)

This is the elephant in the room. Nearly half of all missing tests require an ActionController implementation. This should be the last major stream because:
1. It depends on routing, middleware, request/response all working well
2. Many controller tests test rendering (views, templates, layouts) which is a large new subsystem
3. Some controller tests (test_case, integration) need a test harness

**Phase I1 — Minimal controller base (~200 tests)**

Build a lightweight `ActionController::Base` that can:
- Dispatch actions by name
- Run before/after/around filters (54 missing)
- Access params, request, response, cookies, session, flash
- Return simple responses (head, render text/json/plain, redirect)

This unlocks: filters_test (54), base_test (21), many action_pack tests.

**Phase I2 — Parameters deep (170 missing, 42 matched)**

Strong parameters is partially implemented but many edge cases remain:
- `permit` with nested hashes and arrays (62 + 15 missing)
- `expect` (25 missing) — Rails 8 addition
- Dup/equality semantics (14 missing)
- Logging unpermitted params (18 missing)
- Serialization (4 missing)
- Integration tests (2 missing)

**Phase I3 — Controller rendering (~295 missing)**

This is the hardest part. Rails rendering involves:
- Template lookup and compilation (ERB/Haml/etc)
- Layout wrapping
- Partial rendering
- Streaming responses
- Content negotiation per format

For TypeScript, we likely want a simplified rendering pipeline that supports:
- `render json:`, `render plain:`, `render html:`, `render body:`
- `render status:`, `head :ok`
- Redirects (25 missing, 28 matched)
- Maybe a pluggable template engine interface

Full view rendering (ERB, partials, layouts) is probably out of scope initially.

**Phase I4 — Controller testing (132 missing)**

`ActionController::TestCase` provides `get`, `post`, `assert_response`, etc. This needs a mock request/response pipeline.

**Phase I5 — Remaining controller features (~300 missing)**

- Caching (32) — fragment/page/action caching
- HTTP auth controller tests (36) — testing auth in controllers
- CSRF protection controller tests (56 missing, 44 matched)
- respond_to controller tests (38 missing, 28 matched)
- Live streaming (37)
- Send file (26)
- URL generation from controllers (29 missing, 29 matched)
- Flash from controllers (10 missing, 14 matched)
- Rescue/exception handling (23)
- Helpers (23)
- Various smaller features

### Stream J: Small standalone areas (~75 missing)

| Area | Missing | Notes |
|---|---|---|
| Content negotiation (MIME) | 5 | Nearly complete (27 matched) |
| Uploaded file | 12 | Partially done (8 matched) |
| Mapper internals | 21 | Route definition edge cases |
| Headers | 19 | Request/response header API |
| Query parser | 9 | URL query string parsing |
| Content disposition | 5 | Filename encoding for downloads |
| Server timing | 5 | Server-Timing header |
| Mount | 10 | Mounting Rack apps in routes |
| Param builder | 6 | Building params for testing |
| Translation | 21 | I18n integration — may defer |
| Collector | 5 | Abstract format collection |
| Runner | 1 | App runner |
| Rack cache | 1 | HTTP caching integration |

## Recommended execution order

```
Phase 1 — Standalone areas (parallel):
  Stream B: Request/Response (177 missing)
  Stream C: Middleware (109 missing)
  Stream D: Cookies (96 missing)
  Stream F: Security Middleware (81 missing)
  Stream G: Error Handling (73 missing)
  Stream H: Security Policies (26 missing)
  Stream J: Small areas (75 missing)
  Total: ~637 tests, would bring coverage to ~37%

Phase 2 — Routing (sequential):
  Stream A1: Journey internals (72 missing)
  Stream A2: Core routing (248 missing)
  Stream A3: Resource routing (78 missing)
  Stream A4: URL generation (120 missing)
  Total: ~518 tests, would bring coverage to ~52%

Phase 3 — Sessions:
  Stream E: Sessions (87 missing)
  Total: ~87 tests, would bring coverage to ~55%

Phase 4 — Controller (sequential):
  Stream I1: Minimal controller base (~200 tests)
  Stream I2: Parameters deep (~170 tests)
  Stream I3: Rendering (~295 tests)
  Stream I4: Testing harness (~132 tests)
  Stream I5: Remaining features (~300 tests)
  Total: ~1,097 tests, would bring coverage to ~88%

Phase 5 — Cleanup:
  System testing (44 missing — may defer, requires browser)
  Translation (21 missing — requires I18n)
  Remaining edge cases
  Total: ~100+ tests to reach 100%
```

## Key differences from ActiveRecord roadmap

1. **No stubs** — All 2,751 missing tests need new test files and often new feature implementations.
2. **ActionController dependency** — 47% of tests need a controller layer that doesn't exist yet.
3. **Test file creation** — Most Ruby test files have zero TS counterparts. Need to create ~100 new test files.
4. **Some areas can be deferred** — System testing (browser automation), MemCache session store, template rendering (ERB) may not make sense in TypeScript.

## What "out of scope" might look like

Some Rails features don't translate to TypeScript:
- **System testing** (44 tests) — Selenium/browser automation
- **Template rendering** (~150 tests) — ERB/Haml compilation, partials, layouts
- **Caching** (32 tests) — Fragment/page caching tied to views
- **Live streaming** (37 tests) — SSE/WebSocket via ActionCable

If we defer these, the effective target drops from 3,354 to ~3,091, making 100% more achievable.

## Tracking progress

```bash
npm run test:compare
```

Key metric:
```
actiondispatch: XX% real (NNN matched, 0 stub / 3354 total)
```

Target: `actiondispatch: 100% real (3354 matched, 0 stub / 3354 total)`
