# actionpack — Road to 100%

Consolidates the ActionDispatch coverage roadmap. ActionController has its own:
[actioncontroller-100-percent.md](actioncontroller-100-percent.md).

Forward-only — completed waves live in git.

Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts | awk '/actiondispatch  —/,/^=/' | head -80
pnpm run test:compare
```

Current (2026-05-20): actiondispatch 1184/1351 methods (87.6%), files 75/83.

> `pnpm api:compare` is a chained `&&` script and won't forward `--package` to
> `compare.ts`; invoke `compare.ts` directly for scoped totals.

---

## Port gaps — files with no TS counterpart

- **system_testing/** (5 files), **system_test_case.rb**, **testing/test_helpers/page_dump_helper.rb** — defer indefinitely; trails will use Playwright / Vitest browser mode, not Capybara/Selenium.
- **http/rack_cache.rb** — intentional skip (Rack-specific).
- ~~**middleware/session/cache_store.rb**, **middleware/session/mem_cache_store.rb**~~ — `cache_store.rb` ported in #1872; `mem_cache_store.rb` ported as a `CacheStore` subclass (real `@blazetrails/activesupport` MemCacheStore still pending). `mem_cache_store.ts` mixin includes closed in #2096.
- ~~**deprecator.rb**~~ — ported in #2114 (action_dispatch deprecator + 17 RequestCookieMethods re-exports attributed to deprecator.rb).

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
- ~~**http/mime-type**~~ — closed by #2106 (file at 100%). Followup: ~20 LOC wire `MimeType.parseTrailingStar` / `parseDataWithTrailingStar` into `MimeType.parse()` so `Accept: text/*` expands registered types (mime_type.rb:200-225).
- **http/mime_negotiation** (#1848) — tighten `paramsReadable` catch to `[BadRequest, ParseError]` (~5).
- ~~**routing/url_for** (#1825)~~ — wording fixed; `use_route: Symbol()` with no `.description` throws via `symbolToString`. `UrlForOptions` tightened to `string|symbol|object|null|undefined` (eslint pragma + dead `Function` arm dropped).
- **routing/endpoint** (#1836) — `engine()` returns false; ~5 LOC once `Rails::Engine` lands.
- **middleware/actionable_exceptions** (#1853) — prototype-chain walk in `ActionableError.action` (~15); warn on `_registry` collision (~10); switch endpoint to `cattrAccessor` (~5).
- **middleware/remote-ip** (#1820) — relax `customProxies` check to `Symbol.iterator in Object(...)` (~10).
- ~~**middleware/public_exceptions** (#1861)~~ — `Response.defaultCharset` wired in #2067. Followup: ~30–50 LOC relocate inline `toXml`/`escapeXml` helpers once activemodel `to_xml` lands; ~20 LOC optional iconv hookup in `normalizeCharset()` if exotic charsets needed.
- **middleware/session/abstract_store** (#1863) — `privateId` + comparison helpers on `SessionId` (~10); add `cookieJar` accessor to `Request` (~20).
- ~~**testing/assertions/routing** (#1866)~~ — `symbolToString` + URL-form paths both done (#1866, #2067). Followup: ~10 LOC `assertRecognizes`/`assertGenerates` test coverage for WHATWG → base-URL fallback (e.g. `/items?next=http://example.com`).
- **controller/allow_browser** (#1947) — known divergences from Rails (`useragent` gem):
  - `isBot` uses a regex (`bot|crawl|spider|slurp`) rather than `useragent`'s curated bot list — may miss exotic crawler UAs.
  - Mobile UAs fold into desktop families (`mobile chrome`/`mobile safari`/`mobile firefox` → `chrome`/`safari`/`firefox`); Rails distinguishes them and requires explicit `mobile_safari:` keys.
  - `compareVersions` is a dot-segment numeric compare; semver prerelease tags (`120.0.0-beta`) parse to `NaN` and compare as `0` (Rails delegates to `useragent`'s `OperatingSystem::Version` which is also non-strict but handles tags).
- **testing/test-response** (#1845) — port `successful`/`notFound`/`redirection`/`serverError`/`clientError` status predicates; unblocks skipped "helpers" test.
- **http/param_error** (#1879) — extend `ExceptionWrapper.STATUS_MAP` for ParseError/ParamError family → 400, or switch to prototype-chain walk (~30); wire `ParamError` into `request.ts` parse rescue once that lands (~10).
- **http/param_builder** (#1877) — relocate ParamBuilder + QueryParser test files from `http/` to `dispatch/` for Rails layout parity (~20).
- **processAction args** (#1829) — optional ESLint rule for rest-param signature on overrides (~30, non-urgent).

### Tier 2 — medium leaves (50–150 LOC)

- **http/cache wiring** (#1828) — wire `Cache::Request`/`Cache::Response` onto Request/Response prototypes; remove conflicting `response.ts:160-199` accessors (~150). Plus: strict RFC 1123 `parseHttpDate` (~20); `Request.getHeader` HTTP\_ normalization audit; `params` getter must overlay `pathParameters` (~20).
- ~~**http/mime_negotiation wiring** (#1848)~~ — closed: mixins wired in #2087 and legacy `Request.format()` dropped in #2066. Followup: port `request_test.rb` MIME cluster.
- ~~**http/parameters** (#1832)~~ — closed by #2067 verification: `Request.params` already merges `pathParameters`; `Request.parameterParsers` already a class-level static.
- ~~**http/filter-parameters** (#1838)~~ — filter helpers wired on Request in #2107 (`envFilter`, `filteredQueryString`, static `parameterFilterFor`). **filter-redirect** still open: wire `FilterRedirect` onto `Response` once `Response#request`/`#location` exist (~30). Caveat: WHATWG URL parser diverges from Ruby `URI.parse`.
- **routing/routes_proxy** (#1855) — wire `PolymorphicRoutes` mixin into `UrlFor` (or `RoutesProxy`); lifts `url-for.ts` 9→13 and `routes-proxy.ts` 13→18 to 100% (~80). Widen `_routes` type on `UrlForHost`. Drop `defaultUrlOptions` placeholder (~5).
- **routing/redirection** (#1827) — wire `Redirect`/`PathRedirect`/`OptionRedirect` into `Mapper#redirect` + `RouteSet` dispatch; current code routes through `Route.resolveRedirect` (~80; `route.ts:518`, `route-set.ts:178-190`). `rackEscape` parity with `Rack::Utils.escape` for `!*'()` — extract shared util from `url.ts` (~30).
- **http/param_builder** (#1877) — rack-multipart→UploadedFile adapter (~30); `ParamValue` opaque-leaf widening with `OpaqueParamLeaf` branch removes 3 unsafe casts (~40); narrow rescue from `e.message.startsWith("ArgumentError:")` to `instanceof ArgumentError` once class exists.
- **railtie wiring stubs** (#1842) — future-wired stubs blocked on unported targets: `Response.defaultCharset`/`defaultHeaders`, `CookieJar.alwaysWriteCookie`, `Mapper.routeSourceLocations`, `ActionDispatch.testApp`, `ParamBuilder.ignoreLeadingBrackets`, `Request.ignoreAcceptHeader`, `Http::URL.secureProtocol`. Add `action_dispatch/railtie.rb` → `action-dispatch/railtie.ts` to `FILE_OVERRIDES` (~5).

### Tier 1b — fresh sized followups (≤30 LOC, from #2067–#2121 post-pr findings)

- **middleware/flash + debug-exceptions** (#2090) — ~5 LOC decide `metal/etag-with-flash.ts` `toSessionValue` vs `toHash` for ETag inputs (verify Rails first); ~10 LOC wire `Flash::RequestMethods` into `Request` + add `resetSession` chain wrapper; ~25 LOC extend `DebugExceptionsOptions` with `routesApp?` so `routesInspector` builds when `wrapper.isRoutingError() || isTemplateError()` (Routing inspector already ported); ~30 LOC add public `isLoaded()` to `action-dispatch/request/session.ts` and tighten `FlashRequestHost`.
- **routing/mapper** (#2116) — ~3 LOC propagate `formatted`/`anchor` in `decomposedMatch` terminal branch; ~5 LOC switch `resolve()` keying from `String(klass)` to `klass.name`/`klass.modelName?.name`; ~10 LOC add `new(cb)` scope helper for `on: "new"` dispatch.
- **routing/route-set helper/config attrs (PR b, ~30 missing)** (#2112) — `formatter`, `set`, `router`, `defaultUrlOptions=`, `relativeUrlRoot`, `apiOnly?`, `defaultScope`/`=`, `requestClass`, `makeRequest`, `defaultEnv`, `envKey`, `disableClearAndFinalize`/`=`, `resourcesPathNames`/`=`, `drawPaths`/`=`, `mountedHelpers`, `defineMountedHelper`, `generateUrlHelpers`, `defaultResourcesPathNames` (static), `newWithConfig` (static), polymorphic helpers, `fromRequirements`. Also unify `RouteSet.urlFor` to `urlFor(options, routeName?)` and switch `_routes` to `this`.
- **routing/mapper.resources** (#2112) — emits singular `name` for both `index` and `show`, causing the `addRoute` duplicate-name collision that forced the check to be relaxed. Tracked separately; file at 91% (79/87).
- **cookies signed/encrypted** (#2109) — ~20 LOC add `signedOrEncrypted` getter on `CookieJar` in `middleware/cookies.ts` (Rails exposes via `ChainedCookieJars`). Larger: ~100–150 LOC grow a `SerializedCookieJars` layer so `SignedCookieJar`/`EncryptedCookieJar` accept arbitrary hash values via `[]=` and JSON-serialize internally.
- **http/permissions-policy spec decision** (#2092, #2096) — file stuck at 50% until trails picks a spec. Current TS emits modern Permissions-Policy syntax; Rails emits legacy Feature-Policy via `applyMappings`/`applyMapping`/`buildDirectives`/`buildDirective`/`resolveSource`. Picking the Rails path closes ~7 more methods cheaply but changes header output.
- **HostAuthorization** (#2110) — ~150 LOC port `DefaultResponseApp` inner class (XHR detection + logger + `DebugView` HTML body gated on `action_dispatch.show_detailed_exceptions`); ~30 LOC route `HostAuthorization#call` through `Request#raw_host_with_port` once that lands.
- **journey/router.visualizer** — closed in #2115 (transition-table + visualizer-assets). Followup: visualizer-assets.ts is a verbatim copy of Rails `fsm.js`/`fsm.css` including upstream `"while"` typo — re-sync if Rails ever updates.
- **abstract-controller statics** (#2098, #2114) — closed; deprecator extractor attribution quirk noted (#2096): the cookies config attrs declared in `middleware/cookies.rb` (`cookie_jar`, `key_generator`, …) are bucketed under `deprecator.rb` by api:compare. One-line investigation in `scripts/api-compare/extract-ruby-api.rb` worth doing.

### Tier 3 — bigger leaves (200+ LOC)

- **middleware/remote-ip tests** (#1820) — port full `RequestIP` test class into `dispatch/request.test.ts` as `<base>b` PR (~150).
- **testing/assertions** (#1816, #2093) — `Integration::Session` core methods landed in #2093 (15→33/81). Followup `<base>b` (~150–200 LOC) Runner mixin: `integrationSession`, `createSession`, `openSession`, `copySessionVariablesBang`, `removeBang`, `assertions`/`=`, `rootSession`/`=`, `beforeSetup`. `<base>c` (~100–150 LOC): `IntegrationTest::Behavior` (`app`, `app=`, `documentRootElement`, `registerEncoder`) + `html_document`, `assigns`, `_mockSession` (needs Rack::MockSession equivalent). Still blocked: RoutingAssertions cluster, UrlFor cluster, PolymorphicRoutes cluster, TestProcess::FixtureFile. Plus port `Redirecting._compute_redirect_to_location` for model-form `assertRedirectedTo(@customer)` (~40).
- **testing/assertions/routing generate** (#1866) — port `RouteSet#generate` properly via Journey Formatter (~150); current `generateExtras` linear-scans and can pick wrong route on shared controller/action.

---

## Wave 7 (journey) follow-ups — ~215 LOC

- ~80 LOC — Journey GTG symbol char-class widening based on requirement regex (`transition_table.ts` Builder consults `Pattern.requirements`). Unblocks SKIPPED named-character-classes test (`routing.test.ts:1268`) for `filename: /(.+)/` matching dotted paths. **Leaf.** (Note: transition-table buildout itself closed in #2115.)
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
