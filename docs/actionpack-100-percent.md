# actionpack — Road to 100%

Consolidates the ActionDispatch coverage roadmap. ActionController has its own:
[actioncontroller-100-percent.md](actioncontroller-100-percent.md) +
[actioncontroller-privates-plan.md](actioncontroller-privates-plan.md).

Forward-only — completed waves live in git.

Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts | awk '/actiondispatch  —/,/^=/' | head -80
pnpm run test:compare
```

Current (2026-05-18): actiondispatch 628/1351 methods (46.5%), files 72/83.

> `pnpm api:compare` is a chained `&&` script and won't forward `--package` to
> `compare.ts`; invoke `compare.ts` directly for scoped totals.

---

## Port gaps — files with no TS counterpart

- **system_testing/** (5 files), **system_test_case.rb**, **testing/test_helpers/page_dump_helper.rb** — defer indefinitely; trails will use Playwright / Vitest browser mode, not Capybara/Selenium.
- **http/rack_cache.rb** — intentional skip (Rack-specific).
- ~~**middleware/session/cache_store.rb**, **middleware/session/mem_cache_store.rb**~~ — `cache_store.rb` ported in #1872; `mem_cache_store.rb` ported as a `CacheStore` subclass (real `@blazetrails/activesupport` MemCacheStore still pending).
- **deprecator.rb** — 0/18; small port, no blockers.

Everything else has a TS file; gaps are method-level.

---

## Dependency map — what unblocks what

Most outstanding work clusters around a few upstream ports. Land the upstream
first and a chain of followups becomes mechanical.

| Upstream blocker                                      | Unblocks                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ActionView::Base / ERB pipeline**                   | debug_view `render()`+`lookupContext` (88→100%), `templates/rescues/*.erb`, `DebugView` wired into `DebugExceptions`, `ExceptionWrapper#unwrappedException` dispatch for `Template::Error`         |
| **ActionController (full)**                           | server_timing integration tests, test-process IntegrationTest mixin (~150 LOC), Wave 7 dispatcher `to:` form + RouteSet `#call`/`#serve` reconcile, retire `DispatcherRegistry`, debug_locks tests |
| **ActiveSupport::Executor (real port)**               | 3 skipped executor_test cases, Executor catch → ExceptionWrapper wiring                                                                                                                            |
| **ActiveSupport::Dependencies.interlock**             | debug_locks `dispatch/debug-locks.test.ts`                                                                                                                                                         |
| **ActiveSupport::Notifications**                      | `redirect.action_dispatch` notification                                                                                                                                                            |
| **activesupport Logger**                              | `parameters.logParseErrorOnce` switch from `console.error`                                                                                                                                         |
| **activesupport Railtie `before:`/`after:` ordering** | further railtie ports (silent drop today)                                                                                                                                                          |
| **activesupport `Messages::RotationConfiguration`**   | `cookiesRotations` typing                                                                                                                                                                          |
| **activemodel / `to_xml` port**                       | `middleware/public_exceptions` xml helpers relocation                                                                                                                                              |
| **Rails::Engine**                                     | `routing/endpoint.engine()` (~5 LOC)                                                                                                                                                               |
| **@blazetrails/rack `Session::Abstract::Persisted`**  | abstract_store reparent, delete local `Persisted` shim                                                                                                                                             |
| **Minitest-equivalent class-level hooks**             | `with_routing` class form (~30 LOC)                                                                                                                                                                |
| **DOM port (linkedom/jsdom)**                         | `RequestEncoder.parsedBody` HTML, unskips one test-response test                                                                                                                                   |

Anything not listed here is a **leaf** — see next section.

---

## Leaf nodes — prioritized

Sized in LOC; all unblocked. Bundle to PR-ceiling (~250 LOC) per
[feedback_bundle_to_pr_ceiling]. Group by file when batching.

### Tier 1 — tiny fidelity wins (≤30 LOC each)

- **http/url** (#1818) — clamp `extractSubdomainsFrom` end at `Math.max(0, parts.length - (tldLength+1))` (~5).
- **http/mime-type** (#1848) — register `MimeType.ALL` (intern `parse("*/*")`) + identity compare in `negotiateMime` (~10); allow null symbol for ad-hoc types so `formats` filter isn't a no-op (~10); re-parent `InvalidType` onto `MimeType.InvalidMimeType` when base lands (~10); raise `InvalidType` on media ranges missing `/` (#1861).
- **http/mime_negotiation** (#1848) — tighten `paramsReadable` catch to `[BadRequest, ParseError]` (~5).
- **routing/url_for** (#1825) — fix stale "HelperMethodBuilder (not yet ported)" wording in 3 stub branches (~30); throw on `use_route: Symbol()` with no `.description` (~5).
- **routing/endpoint** (#1836) — `engine()` returns false; ~5 LOC once `Rails::Engine` lands.
- **middleware/actionable_exceptions** (#1853) — prototype-chain walk in `ActionableError.action` (~15); warn on `_registry` collision (~10); switch endpoint to `cattrAccessor` (~5).
- **middleware/remote-ip** (#1820) — relax `customProxies` check to `Symbol.iterator in Object(...)` (~10).
- **middleware/public_exceptions** (#1861) — replace hardcoded `"utf-8"` with `Response.defaultCharset` (~10).
- **middleware/session/abstract_store** (#1863) — `privateId` + comparison helpers on `SessionId` (~10); add `cookieJar` accessor to `Request` (~20).
- **testing/assertions/routing** (#1866) — accept JS Symbol for `use_route` via `Symbol#description` (~5); URL-form path support in `assertRecognizes`/`assertGenerates` (~20).
- **testing/test-response** (#1845) — port `successful`/`notFound`/`redirection`/`serverError`/`clientError` status predicates; unblocks skipped "helpers" test.
- **http/param_error** (#1879) — extend `ExceptionWrapper.STATUS_MAP` for ParseError/ParamError family → 400, or switch to prototype-chain walk (~30); wire `ParamError` into `request.ts` parse rescue once that lands (~10).
- **http/param_builder** (#1877) — relocate ParamBuilder + QueryParser test files from `http/` to `dispatch/` for Rails layout parity (~20).
- **processAction args** (#1829) — optional ESLint rule for rest-param signature on overrides (~30, non-urgent).

### Tier 2 — medium leaves (50–150 LOC)

- **http/cache wiring** (#1828) — wire `Cache::Request`/`Cache::Response` onto Request/Response prototypes; remove conflicting `response.ts:160-199` accessors (~150). Plus: strict RFC 1123 `parseHttpDate` (~20); `Request.getHeader` HTTP\_ normalization audit; `params` getter must overlay `pathParameters` (~20).
- **http/mime_negotiation wiring** (#1848) — wire 16 mixin exports onto `Request`; drop legacy `Request.format()`; reconcile `Request.accept`; add `_variant` (~80). Plus: port `request_test.rb` MIME cluster.
- **http/parameters** (#1832) — `Request.params` must merge `pathParameters` (~20); promote `parameter_parsers=` from module-state to static on `Request` (~10).
- **http/filter-parameters + filter-redirect** (#1838) — currently dead code. Pre-req: extend `Request` with `hasHeader`/`setHeader`/`deleteHeader`/`fetchHeader` (~30–50). Then wire `FilterParameters` onto `Request` (~20) + `FilterRedirect` onto `Response` once `Response#request`/`#location` exist (~30). Caveat: WHATWG URL parser diverges from Ruby `URI.parse` — log output may byte-differ.
- **routing/routes_proxy** (#1855) — wire `PolymorphicRoutes` mixin into `UrlFor` (or `RoutesProxy`); lifts `url-for.ts` 9→13 and `routes-proxy.ts` 13→18 to 100% (~80). Widen `_routes` type on `UrlForHost`. Drop `defaultUrlOptions` placeholder (~5).
- **routing/redirection** (#1827) — wire `Redirect`/`PathRedirect`/`OptionRedirect` into `Mapper#redirect` + `RouteSet` dispatch; current code routes through `Route.resolveRedirect` (~80; `route.ts:518`, `route-set.ts:178-190`). `rackEscape` parity with `Rack::Utils.escape` for `!*'()` — extract shared util from `url.ts` (~30).
- **http/param_builder** (#1877) — rack-multipart→UploadedFile adapter (~30); `ParamValue` opaque-leaf widening with `OpaqueParamLeaf` branch removes 3 unsafe casts (~40); narrow rescue from `e.message.startsWith("ArgumentError:")` to `instanceof ArgumentError` once class exists.
- **railtie wiring stubs** (#1842) — future-wired stubs blocked on unported targets: `Response.defaultCharset`/`defaultHeaders`, `CookieJar.alwaysWriteCookie`, `Mapper.routeSourceLocations`, `ActionDispatch.testApp`, `ParamBuilder.ignoreLeadingBrackets`, `Request.ignoreAcceptHeader`, `Http::URL.secureProtocol`. Add `action_dispatch/railtie.rb` → `action-dispatch/railtie.ts` to `FILE_OVERRIDES` (~5).

### Tier 3 — bigger leaves (200+ LOC)

- **middleware/remote-ip tests** (#1820) — port full `RequestIP` test class into `dispatch/request.test.ts` as `<base>b` PR (~150).
- **testing/assertions** (#1816) — port `testing/assertions/routing.rb` properly (~250); requires `RouteSet#recognize_path` `pathParameters` shape + `RouteSet#generate_extras` + `ActionController::TestRequest#pathParameters` setter. Rewire `IntegrationTest.assertResponse`/`assertRedirectedTo` (~80). Fix `STATUS_RANGES.missing = 400–499` → `404` in `integration.ts:53–57`. Port `Redirecting._compute_redirect_to_location` for model-form `assertRedirectedTo(@customer)` (~40).
- **testing/assertions/routing generate** (#1866) — port `RouteSet#generate` properly via Journey Formatter (~150); current `generateExtras` linear-scans and can pick wrong route on shared controller/action.

---

## Wave 7 (journey) follow-ups — ~215 LOC

- ~80 LOC — Journey GTG symbol char-class widening based on requirement regex (`transition_table.ts` Builder consults `Pattern.requirements`). Unblocks SKIPPED named-character-classes test (`routing.test.ts:1268`) for `filename: /(.+)/` matching dotted paths. **Leaf.**
- ~80 LOC — Real dispatcher registry; replace throwing-stub `app` in bridge. **Blocked on ActionController.**
- ~30 LOC — Swap `RouterRequest`/`RoutableApp`/`FormatterHost` interim interfaces for real `ActionDispatch::Request` types. **Leaf.**

### Wave 7 PR 1 leftovers (~25 LOC, all leaves)

- ~10 LOC — Drop dead `ESCAPED` regex in `journey/router/utils.ts`. Audit four `UNSAFE_*` regexes for `/u` flag (non-BMP characters split into surrogate pairs and percent-encode to U+FFFD).
- ~15 LOC — `unescapeUri` non-BMP support (`codePointAt` + variable step).
- Pre-existing: `normalizePath` `%Aa` not normalized (faithful Rails port). `toGraphviz` doesn't escape labels (`@internal`, same as Rails). Grep `escapeSegment`/`unescapeUri` AR/AV callers when next touching routing.

---

## ActionDispatch test:compare — major missing clusters

Re-run `pnpm run test:compare` for current figures. Stream order
(parallelizable except Controller, which depends on AC):

- **Routing** (~600 missing) — main routing_test (178), resources_test (78), prefix generation (45), URL generation (37), routing assertions (29), inspector (28), mapper (21), concerns (11). Journey internals (72) — pattern matching (20), parser/scanner (22), GTG builder (14), routes (6), router (10).
- **Controller** (~1295 missing) — needs ActionController; tracked in actioncontroller-100-percent.md.
- **Request/Response** (~177 missing) — request core (47), param parsing (~57), request id (10), test request (11); response core (26), live (10), assertions (11), test response (5).
- **Middleware** (~109 missing) — stack (28), static (35), abstract callbacks (26), executor/reloader (19).
- **Cookies** (~96 missing) — signed/encrypted rotation, domain, JSON fallbacks, purpose metadata, size limits, SameSite, permanent max-age.
- **Sessions** (~87 missing) — depends on Cookies. CookieStore (27), session-from-request (22), cache store (11), test session (13), abstract stores (5), memcache (9, defer).
- **Security middleware** (~81 missing) — SSL (39), Host Authorization (41), Assume SSL (1).
- **Error handling** (~73 missing) — debug exceptions (42), exception wrapper (15), show exceptions (9), actionable exceptions (6), debug locks (1).
- **Security policies** (~26 missing) — CSP (17), Permissions Policy (9).
- **Small standalone** (~75 missing) — content disposition, server timing, mount, param builder, translation (i18n, defer), MIME, uploaded file, headers, query parser, collector, runner.

Out-of-scope (defer or never): system_testing (browser); full ERB rendering
(~150); fragment/page caching (32); live streaming (37) until ActionCable.
