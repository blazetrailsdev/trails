# actionpack — Road to 100%

Covers the three actionpack sub-packages: ActionDispatch, ActionController,
AbstractController. ActionView has its own plan
([actionview-100-percent.md](actionview-100-percent.md)).

Forward-only — completed slots live in git. Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
for p in actiondispatch actioncontroller abstractcontroller; do
  pnpm tsx scripts/api-compare/compare.ts --package "$p" --privates | tail -3
done
pnpm run test:compare 2>&1 | grep -E "(actiondispatch|actioncontroller|abstractcontroller)  —"
```

> `pnpm api:compare` is a chained `&&` script and won't forward `--package`;
> invoke `compare.ts` directly for scoped totals.

Current (2026-05-21):

| Package            | API methods       | Files at 100% | test:compare   |
| ------------------ | ----------------- | ------------- | -------------- |
| abstractcontroller | 82/82 (100%)      | 11/11         | 42/52 (81%)    |
| actiondispatch     | 1268/1351 (93.9%) | 75/83         | 585/1622 (36%) |
| actioncontroller   | 429/581 (73.8%)   | 34/43         | 527/1860 (28%) |

---

## ActionDispatch — remaining

### Indefinite defers (do not port)

- **system_testing/** (5 files), **system_test_case.rb**, **testing/test_helpers/page_dump_helper.rb** — trails uses Playwright / Vitest browser mode, not Capybara/Selenium.
- **http/rack_cache.rb** — Rack-specific.

### Partial files

| File                             | %   | Missing                               | Notes                                                                                                                 |
| -------------------------------- | --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `http/permissions_policy.rb`     | 50% | 5 (`applyMappings`/`buildDirective`…) | Spec decision: legacy Feature-Policy vs modern syntax.                                                                |
| `http/response.rb`               | 94% | 5                                     | Blocked on `Cache::Request`/`Cache::Response` wiring.                                                                 |
| `middleware/debug_exceptions.rb` | 88% | 2                                     | Blocked on ActionView DebugView + `routesApp` plumbing.                                                               |
| `middleware/debug_view.rb`       | 88% | 1                                     | Blocked on ActionView Base.                                                                                           |
| `testing/assertions.rb`          | 95% | 1                                     | `with_routing` class form (~30 LOC, needs Minitest-class-level hook equivalent).                                      |
| `testing/integration.rb`         | 96% | 3                                     | IntegrationTest::Behavior tail (`app`, `documentRootElement`, `registerEncoder`); needs Rack::MockSession equivalent. |

### Upstream blockers (chains of follow-ups gated on one port)

| Blocker                                           | Unblocks                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| ActionView::Base / TSE pipeline                   | DebugView render+lookupContext, rescue templates, Template::Error exception-wrapper unwrap.        |
| ActionController (full)                           | server_timing tests, test-process IntegrationTest mixin, dispatcher `to:` form, debug-locks tests. |
| ActiveSupport::Executor (real port)               | 3 skipped executor_test cases.                                                                     |
| ActiveSupport::Dependencies.interlock             | `dispatch/debug-locks.test.ts`.                                                                    |
| ActiveSupport::Notifications                      | `redirect.action_dispatch` notification.                                                           |
| activesupport Railtie `before:`/`after:` ordering | further railtie ports.                                                                             |
| activemodel `to_xml`                              | `middleware/public_exceptions` xml helpers relocation.                                             |
| Rails::Engine                                     | `routing/endpoint.engine()` (~5 LOC).                                                              |
| `@blazetrails/rack Session::Abstract::Persisted`  | abstract_store reparent, drop local `Persisted` shim.                                              |
| DOM port (linkedom/jsdom)                         | `RequestEncoder.parsedBody` HTML.                                                                  |

### Leaf follow-ups (unblocked, sized)

Bundle to PR-ceiling (~250 LOC). Group by file.

**Tier 1 (≤30 LOC each):**

- `http/url` — clamp `extractSubdomainsFrom` end at `Math.max(0, parts.length - (tldLength+1))` (~5).
- `http/mime-type` — wire `parseTrailingStar` / `parseDataWithTrailingStar` into `MimeType.parse()` so `Accept: text/*` expands registered types (~20).
- `http/mime_negotiation` — tighten `paramsReadable` catch to `[BadRequest, ParseError]` (~5).
- `routing/endpoint` — `engine()` returns false (~5, blocked on Rails::Engine).
- `middleware/actionable_exceptions` — prototype-chain walk in `ActionableError.action` (~15); `_registry` collision warn (~10); endpoint to `cattrAccessor` (~5).
- `middleware/remote-ip` — relax `customProxies` check to `Symbol.iterator in Object(...)` (~10).
- `middleware/public_exceptions` — relocate inline `toXml`/`escapeXml` once activemodel ships `to_xml` (~30–50); optional iconv hookup in `normalizeCharset()` (~20).
- `middleware/session/abstract_store` — `privateId` + comparison helpers on `SessionId` (~10); add `cookieJar` accessor to `Request` (~20).
- `testing/assertions/routing` — `assertRecognizes`/`assertGenerates` test coverage for WHATWG → base-URL fallback (~10).
- `controller/allow_browser` — `useragent`-gem divergences (regex bot detection, mobile UA folding, semver-tag compare); document or port a real UA library.
- `testing/test-response` — port `successful`/`notFound`/`redirection`/`serverError`/`clientError` status predicates.
- `http/param_error` — extend `ExceptionWrapper.STATUS_MAP` for ParseError/ParamError → 400, or prototype-chain walk (~30); wire `ParamError` into request parse rescue (~10).
- `http/param_builder` — relocate ParamBuilder + QueryParser test files from `http/` to `dispatch/` for layout parity (~20).
- `processAction args` — optional ESLint rule for rest-param signature on overrides (~30, non-urgent).
- `middleware/flash + debug-exceptions` (#2090) — decide `etag-with-flash.ts` `toSessionValue` vs `toHash`; wire `Flash::RequestMethods` into `Request` + `resetSession`; extend `DebugExceptionsOptions` with `routesApp?`; public `isLoaded()` on session.
- `routing/mapper` (#2116) — propagate `formatted`/`anchor` in `decomposedMatch` terminal branch (~3); switch `resolve()` keying from `String(klass)` to `klass.name`/`modelName?.name` (~5); `new(cb)` scope helper for `on: "new"` (~10).

**Tier 2 (50–150 LOC):**

- `http/cache wiring` — wire `Cache::Request`/`Cache::Response` onto Request/Response prototypes; drop conflicting `response.ts:160-199` accessors (~150); strict RFC 1123 `parseHttpDate` (~20); `params` getter must overlay `pathParameters` (~20).
- `routing/routes_proxy` — wire `PolymorphicRoutes` mixin into `UrlFor`/`RoutesProxy`; lifts `url-for.ts` to 100% (~80); widen `_routes` type on `UrlForHost`.
- `routing/redirection` — wire `Redirect`/`PathRedirect`/`OptionRedirect` into `Mapper#redirect` + `RouteSet` dispatch (~80); `rackEscape` parity with `Rack::Utils.escape` for `!*'()` (~30).
- `http/param_builder` — rack-multipart→UploadedFile adapter (~30); `ParamValue` opaque-leaf widening with `OpaqueParamLeaf` branch (~40); narrow rescue from message-prefix match to `instanceof ArgumentError`.
- `routing/route-set helper/config attrs` (#2112) — ~30 missing public surface (`formatter`, `set`, `router`, `defaultUrlOptions=`, `relativeUrlRoot`, `apiOnly?`, polymorphic helpers, `fromRequirements`, etc.); unify `RouteSet.urlFor` to `urlFor(options, routeName?)`; switch `_routes` to `this`.
- `routing/mapper.resources` (#2112) — singular `name` emitted for both `index` and `show`; causes `addRoute` duplicate-name collision (file 91%).
- `cookies signed/encrypted` (#2109) — `signedOrEncrypted` getter on `CookieJar` (~20); grow a `SerializedCookieJars` layer so signed/encrypted jars accept arbitrary hash values via `[]=` and JSON-serialize (~100–150).
- `HostAuthorization` (#2110) — port `DefaultResponseApp` inner class (XHR detection + logger + DebugView body) (~150); route `#call` through `Request#raw_host_with_port` (~30).
- `railtie wiring stubs` — future-wired stubs blocked on unported targets (`Response.defaultCharset`/`defaultHeaders`, `CookieJar.alwaysWriteCookie`, etc.); add `action_dispatch/railtie.rb` → `action-dispatch/railtie.ts` to `FILE_OVERRIDES`.

**Tier 3 (200+ LOC):**

- `middleware/remote-ip tests` — port full `RequestIP` test class into `dispatch/request.test.ts` as `<base>b` (~150).
- `testing/assertions` — `<base>b` (~150–200) Runner mixin (`integrationSession`, `createSession`, `openSession`, `copySessionVariablesBang`, `beforeSetup`); `<base>c` (~100–150) `IntegrationTest::Behavior` + `html_document` + `assigns` + `_mockSession`. Still blocked: RoutingAssertions, UrlFor, PolymorphicRoutes, TestProcess::FixtureFile.
- `testing/assertions/routing generate` — port `RouteSet#generate` via Journey Formatter (~150); current `generateExtras` linear-scans and can pick wrong route on shared controller/action.

### Journey follow-ups (~215 LOC)

- ~80 — GTG symbol char-class widening based on requirement regex (`transition_table.ts` Builder consults `Pattern.requirements`). Unblocks SKIPPED named-character-classes test for `filename: /(.+)/`. **Leaf.**
- ~80 — Real dispatcher registry; replace throwing-stub `app` in bridge. **Blocked on ActionController.**
- ~30 — Swap `RouterRequest`/`RoutableApp`/`FormatterHost` interim interfaces for real `ActionDispatch::Request` types. **Leaf.**
- ~10 — Drop dead `ESCAPED` regex in `journey/router/utils.ts`; audit four `UNSAFE_*` regexes for `/u` flag (non-BMP surrogate pairs).
- ~15 — `unescapeUri` non-BMP support (`codePointAt` + variable step).

### test:compare clusters (~2500 missing tests)

Stream order (parallelizable except Controller, which depends on AC):

- **Routing** (~600) — routing (178), resources (78), prefix generation (45), URL generation (37), assertions (29), inspector (28), mapper (21), concerns (11); Journey internals (72).
- **Controller** (~1295) — needs ActionController.
- **Request/Response** (~177) — request core (47), param parsing (~57), response core (26), live (10).
- **Middleware** (~109) — stack (28), static (35), abstract callbacks (26), executor/reloader (19).
- **Cookies** (~96) — signed/encrypted rotation, domain, JSON fallback, purpose, size, SameSite, max-age.
- **Sessions** (~87) — CookieStore (27), session-from-request (22), cache store (11), test session (13), abstract (5), memcache (9, defer).
- **Security middleware** (~81) — SSL (39), Host Authorization (41), Assume SSL (1).
- **Error handling** (~73) — debug exceptions (42), exception wrapper (15), show exceptions (9), actionable (6), debug locks (1).
- **Security policies** (~26) — CSP (17), Permissions Policy (9).
- **Small standalone** (~75).

Out of scope: system_testing, full ERB rendering (~150), fragment/page caching (32), live streaming (37, until ActionCable).

---

## ActionController — remaining

### Known divergences from Rails (intentional)

- **YAML hook (`Parameters.hookIntoYamlLoading`):** no-op; TS has no built-in YAML.
- **CSRF token stores (`SessionStore`, `CookieStore`):** take session/cookies hash directly (not `request`); `CookieStore` does plain read/write, no encryption or session ID validation. Refit once a real cookie jar with encryption is wired.
- **Cache-control (`noStore`):** builds the header string directly instead of mutating a `response.cache_control` hash (we don't have that hash yet).
- **Etaggers (`etag`):** module-level array shared across controllers; scope per-class once `class_attribute` lands.
- **Renderers (`renderToBody`, `useRenderers`):** static methods, global `_renderers` Set; should become instance/class methods with per-class state when controller mixin architecture is wired.
- **Metal.action / Metal.build:** returns the bare endpoint without middleware wrapping; our `MiddlewareStack` doesn't override `build` to accept an action name.
- **`httpCacheForever`:** sets `Cache-Control` and always calls the block; no `stale?` conditional integration.
- **`Renderer.withDefaults`:** merges defaults but does not recompute the Rack env.
- **`permissionsPolicy` DSL:** registers a `before_action` that mutates a fresh directives object; until `Request#permissionsPolicy` + response middleware lands, modified directives don't round-trip into the header.
- **`RateLimiting`:** no global `Rails.cache`; DSL falls back to a `cacheStore` static on the host controller and throws if neither is set. A `MemoryRateLimitStore` ships for tests; production must supply a `RateLimitStore` where `increment` accepts seconds (not ms) and initializes a missing counter to `amount` (Redis/Memcached behavior).
- **`BrowserBlocker.versions`:** returns a shallow copy instead of the live array.

### Open slots

| File                                 | %   | Notes / Blockers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base.rb`                            | 38% | 64 misses; all in mixin/included-from files (redirecting, etag*with*\*, helpers, request_forgery_protection, implicit_render, instrumentation, params_wrapper privates). Most blocked on rendering/dispatcher pipeline; tracked under each P-slot.                                                                                                                                                                                                                                                                             |
| `log_subscriber.rb`                  | 88% | 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `metal/etag_with_flash.rb`           | 56% | 4 — decide `toHash()` vs `toSessionValue()` for ETag inputs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `metal/etag_with_template_digest.rb` | 42% | 7 — `determineTemplateEtag`/`pickTemplateForEtag`/`lookupAndDigestTemplate` + 4 privates. Blocked on ActionView digestor.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `metal/flash.rb`                     | 67% | 1 — remaining mixin export.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `metal/helpers.rb`                   | 0%  | 6 — `helpersPath`, `helpers`, `helperAttr`, `modulesForHelpers`, `allApplicationHelpers` + 1 private. Blocked on ActionView helper integration.                                                                                                                                                                                                                                                                                                                                                                                |
| `metal/http_authentication.rb`       | 39% | 20 across Basic/Digest/Token — bundle by module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `metal/strong_parameters.rb`         | 73% | 24 — PR draft was ready in `actioncontroller-leaves-b`; reopen when CI capacity permits. Captures +24 methods.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test_case.rb`                       | 49% | 25 — split into two: <br>**b** (~250) TestRequest helpers (`queryString=`, `contentType=`, `assignParameters`, `shouldMultipart`, `paramsParsers`, `newSession`, `create`, `defaultEnv`) + TestResponse status predicates; <br>**c** (~250) `process`, `setupRequest`, `buildResponse`, `wrapExecution`, `processControllerResponse`, `setupControllerRequestAndResponse`, `scrubEnvBang`, `documentRootElement`, `checkRequiredIvars`, `assertTemplate`, `executorAroundEachRequest`, `generatedPath`, `queryParameterNames`. |

### Wiring follow-ups (small)

- **`metal/implicit-render`** — wire real `templateExists`/`anyTemplates` on host once ActionView lookup arrives (~30).
- **`metal/instrumentation.haltedCallbackHook`** — wire from AS::Callbacks `_runCallbacks` halt path (~50).
- **`metal.buildMiddleware`** — promote inline `valid` augmentation onto the `Middleware` class (~10).
- **Two DoubleRenderError classes** — consolidate abstract-controller vs action-controller versions (`instanceof` against parent works, identity does not).
- **DidYouMean consumer** — `Template::Error#corrections` (actionview) maps to `@blazetrails/did-you-mean`'s exported `Jaro.distance` (~80).
- **Extractor quirk** — cookies config attrs declared in `middleware/cookies.rb` (`cookie_jar`, `key_generator`, …) are bucketed under `deprecator.rb` by api:compare; one-line fix in `scripts/api-compare/extract-ruby-api.rb`.

---

## How to ship one PR

```bash
git fetch origin main
scripts/start-worktree.sh <name>           # creates ~/github/blazetrailsdev/worktrees/<name>
cd ~/github/blazetrailsdev/worktrees/<name>
# Read Rails source first
less vendor/rails/actionpack/lib/<rails-file>.rb   # pnpm vendor:fetch if absent
# Implement in the TS file the api:compare row points to (don't relocate methods).
$EDITOR packages/actionpack/src/<sub-pkg>/<ts-file>.ts
$EDITOR packages/actionpack/src/<sub-pkg>/<ts-file>.test.ts
pnpm vitest run packages/actionpack/src/<sub-pkg>/<ts-file>.test.ts
pnpm tsx scripts/api-compare/compare.ts --package <sub-pkg> --privates | grep <rails-file>
pnpm build && pnpm exec prettier --write packages/actionpack/src/<sub-pkg>/<ts-file>.{ts,test.ts}
git add -A && git commit -m "feat(<sub-pkg>): <subject>" && git push -u origin <branch>
gh pr create --draft --title "..." --body "..."  # quote the Rails source lines being mirrored
```

CLAUDE.md constraints:

- camelCase only — no snake_case identifiers.
- PR ≤ 300 LOC (excl. lockfiles, snapshots).
- Mixin methods use the `this`-typed function pattern: `export function foo(this: HostInterface, ...)` then `static foo = foo`. Do NOT inline the body in `base.ts`.
- Add a "Known divergences" entry above for any Rails behavior that can't be mirrored exactly.
- `instance_exec(opts, &block)` → `block.call(this, opts)` with `this: unknown`.
- Ruby `compact` → `.filter((e) => e !== null && e !== undefined)` (NOT `.filter(Boolean)`).
- Ruby `Hash#key?` → `Object.hasOwn(obj, "K")` (NOT `obj["K"] != null` or `"K" in obj`).

Sequencing: one agent per source file at a time.
