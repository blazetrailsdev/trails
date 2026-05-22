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

Current (2026-05-22):

| Package            | API methods       | Files at 100% | Inheritance   | test:compare   |
| ------------------ | ----------------- | ------------- | ------------- | -------------- |
| abstractcontroller | 82/82 (100%)      | 11/11         | 3/4 (75%)     | 42/52 (81%)    |
| actiondispatch     | 1268/1351 (93.9%) | 75/83         | 58/66 (87.9%) | 585/1622 (36%) |
| actioncontroller   | 429/581 (73.8%)   | 42/43         | 16/16 (100%)  | 527/1860 (28%) |

abstractcontroller api-surface is closed. Remaining gaps live in
ActionDispatch (8 partial files) and ActionController (9 partial files,
mostly `base.rb` mixin chain + `test_case.rb` + `metal/http_authentication.rb`).

---

## Indefinite defers (do not port)

- **system_testing/** (5 files), **system_test_case.rb**,
  **testing/test_helpers/page_dump_helper.rb** — trails uses Playwright /
  Vitest browser mode, not Capybara/Selenium.
- **http/rack_cache.rb** — Rack-specific.

---

## Upstream blockers

Chains of follow-ups gated on one port. Most stories below cite one of these.

| Blocker                                           | Unblocks                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ActionView::Base / TSE pipeline                   | DebugView render+lookupContext, rescue templates, Template::Error exception-wrapper unwrap.                   |
| ActionView digestor                               | `metal/etag_with_template_digest.rb` (7).                                                                     |
| ActionView helper integration                     | `metal/helpers.rb` (6).                                                                                       |
| ActionController full dispatcher                  | server_timing tests, test-process IntegrationTest mixin, dispatcher `to:` form, debug-locks tests.            |
| ActiveSupport::Executor (real port)               | 3 skipped executor_test cases.                                                                                |
| ActiveSupport::Dependencies.interlock             | `dispatch/debug-locks.test.ts`.                                                                               |
| ActiveSupport::Notifications                      | `redirect.action_dispatch` notification.                                                                      |
| ActiveSupport::MessageVerifier / MessageEncryptor | `SignedKeyRotatingCookieJar` / `EncryptedKeyRotatingCookieJar`.                                               |
| ActiveSupport::Messages::SerializerWithFallback   | `:marshal`/`:hybrid`/`:json_allow_marshal` dispatch in cookies serializer.                                    |
| activesupport Railtie `before:`/`after:` ordering | further railtie ports.                                                                                        |
| activemodel `to_xml`                              | `middleware/public_exceptions` xml helpers relocation.                                                        |
| Rails::Engine                                     | `routing/endpoint.engine()` (~5 LOC); `recognizePathWithRequest` engine recursion; `RouteWrapper.isEngine()`. |
| `@blazetrails/rack` Session::Abstract::Persisted  | abstract_store reparent, drop local `Persisted` shim.                                                         |
| rails-dom-testing (Nokogiri equivalent)           | `testing/assertions.htmlDocument`, IntegrationTest `documentRootElement`.                                     |
| Rack::MockSession analogue                        | IntegrationTest `_mockSession`.                                                                               |

---

## Partial files at a glance

| File                                 | Pkg | %   | Missing | Story                  |
| ------------------------------------ | --- | --- | ------- | ---------------------- |
| `http/permissions_policy.rb`         | AD  | 50% | 5       | S2                     |
| `http/response.rb`                   | AD  | 94% | 5       | S1                     |
| `middleware/debug_exceptions.rb`     | AD  | 88% | 2       | upstream (ActionView)  |
| `middleware/debug_view.rb`           | AD  | 88% | 1       | upstream (ActionView)  |
| `testing/assertions.rb`              | AD  | 95% | 1       | upstream (rails-dom)   |
| `testing/integration.rb`             | AD  | 96% | 3       | S5 + upstream          |
| `base.rb`                            | AC  | 38% | 64      | upstream (mixin chain) |
| `log_subscriber.rb`                  | AC  | 88% | 1       | S3                     |
| `metal/etag_with_flash.rb`           | AC  | 56% | 4       | S3                     |
| `metal/etag_with_template_digest.rb` | AC  | 42% | 7       | upstream (digestor)    |
| `metal/flash.rb`                     | AC  | 67% | 1       | S3                     |
| `metal/helpers.rb`                   | AC  | 0%  | 6       | upstream (AV helpers)  |
| `metal/http_authentication.rb`       | AC  | 39% | 20      | S6                     |
| `metal/strong_parameters.rb`         | AC  | 73% | 24      | S4                     |
| `test_case.rb`                       | AC  | 49% | 25      | S7a, S7b               |

---

## Dev stories (~250 LOC PRs)

Each story is sized to fit one PR under the 300-LOC ceiling. Pick the
top-listed one in each thread; cross-story dependencies are marked
**depends-on**. All sized estimates exclude lockfiles and snapshots.

### S1 — `http/cache` wiring (Tier 2, ~250 LOC) — AD

Wire `Cache::Request` / `Cache::Response` onto Request/Response prototypes;
drop conflicting `response.ts:160-199` accessors. Closes the 5 missing
methods on `http/response.rb` (gets the file to 100%).

- ~150 — prototype wiring + accessor cleanup.
- ~20 — strict RFC 1123 `parseHttpDate`.
- ~20 — `params` getter overlays `pathParameters`.
- ~30–50 — global `MimeType.lookup` Rails-fallback (strip `;params`, then
  `Type.new(string)`); drop the `lookupForParse` helper added in #2246 once
  callers tolerate the new return shape. Audit:
  `collector.ts:62/90/106`, `mime-negotiation.ts`, `data-streaming.ts`,
  `respond-to.ts`.

### S2 — `http/permissions_policy` spec decision + 5 helpers (Tier 2, ~150–200 LOC) — AD

The current TS port emits **modern Permissions-Policy** syntax
(`camera=(self)`); Rails emits **legacy Feature-Policy** (`camera 'self'; …`).
Picking Rails-shape closes ~7 more methods cheaply but changes header output.
Picking modern means documenting the divergence and shipping only what's
common.

- ~30 — design decision in PR body; pick one and add a "Known divergences"
  entry if modern syntax wins.
- ~100 — port `applyMappings` / `applyMapping` / `buildDirectives` /
  `buildDirective` / `resolveSource` (5 methods) for the chosen spec.
- ~20 — `permissionsPolicy` / `permissionsPolicy=` accessors on `Request`
  (env-backed under `action_dispatch.permissions_policy`).

### S3 — Flash + ETag + LogSubscriber bundle (~100–150 LOC) — AD + AC

Bundles three small-surface files into one fidelity-sweep PR. After this
story, `metal/flash.rb` →100%, `metal/etag_with_flash.rb` →100%, and
`log_subscriber.rb` →100%. Total LOC budget is intentionally under the
~250 ceiling — pair with the DoubleRenderError consolidation below to fill
to ~150 LOC.

- ~10 — wire `Flash::RequestMethods` into `Request` and add a `resetSession`
  wrapper that chains to the original then calls the flash hook.
- ~30 — public `isLoaded()` on `action-dispatch/request/session.ts`;
  tighten the `FlashRequestHost` contract to require it (drops the
  unconditional cleanup branch in `commitFlash`).
- ~5 + decision — `metal/etag-with-flash.ts`: pick `toSessionValue` (current,
  matches Rails ETagger) or `toHash` (busts ETag on `flash.now` changes).
  Verify Rails source before flipping. Add inline justification either way.
- ~25 — extend `DebugExceptionsOptions` with `routesApp?: { routes: { routes: unknown } }`
  and build an `ActionDispatch::Routing::RoutesInspector` when
  `wrapper.isRoutingError() || wrapper.isTemplateError()`. Routing inspector
  is already ported; this is just plumbing.
- ~15 — `log_subscriber.rb` last method + wire `LogSubscriber.attachTo("action_controller")`
  via the trailtie (Rails wires this in `action_controller/railtie.rb`).
  Determine appropriate log levels for `startProcessing` / `processAction` /
  `halted`. **Note on the namespace string:** `"action_controller"` is the
  AS::Notifications event channel — a cross-package wire identifier shared
  with `@blazetrails/activesupport` subscribers, not a JS-side identifier.
  Keep snake_case to match the existing AS::Notifications surface (audit
  trail in MEMORY [feedback_camelcase_only]; this is the documented
  cross-package channel exception). Flipping to `"actionController"` would
  require an activesupport-wide subscriber audit and is out of scope here.
- ~20 — **Consolidate DoubleRenderError.** Two classes exist:
  `abstract-controller/rendering.ts:20` and `action-controller/base.ts:949`,
  both `extends AbstractControllerError`. `instanceof` against the parent
  works; identity does not. Delete the `action-controller/base.ts` body
  and switch `action-controller/index.ts:11` to re-export from
  `../abstract-controller/rendering.js`.

### S4 — `metal/strong_parameters.rb` reopen (Tier 2, ~250 LOC) — AC

Branch `actioncontroller-leaves-b` (PR #2101, closed for CI capacity, not
merged) holds +24 methods on strong_parameters. As of fetch on 2026-05-22
the branch has 2 commits ahead of `origin/main`
(`feat(actionpack): permitted_scalar_filter copies multi-parameter keys`
and `feat(actionpack): strong-parameters Rails-private surface to 100%`).
Before reopening, run `git fetch origin actioncontroller-leaves-b &&
git log --oneline origin/main..origin/actioncontroller-leaves-b` and
rebase if main has moved beyond the merge-base. Then reopen with a fresh
PR, verify CI, ship.

- ~250 — `strong_parameters.rb` 65/89 → 89/89.

**depends-on:** nothing. Pure surface port.

### S5 — Integration::Session followups (Tier 1, ~80 LOC) — AD

Closes the last 3 methods on `testing/integration.rb` (96% → 100%, blocked
parts excepted).

- ~30 — 404-branch options.env/headers/body merge: factor env-build out of
  matched-branch into a helper, call from both paths. `followRedirectBang`
  whose target doesn't match a route currently loses the injected
  `HTTP_REFERER`.
- ~10 — drop `host.split(":")` IPv6 mishandling in both `_processPath` and
  `_buildFullUri` (Rails-parity bug, fix both layers together).
- ~25 — expose `htmlDocument` + `documentRootElement` once rails-dom-testing
  lands (**upstream-blocked**, leave a TODO if shipping pre-port).
- ~15 — expose `_mockSession` once a Rack::MockSession analogue exists
  (**upstream-blocked**).

`RouteSet.urlFor` Rails-shape rewrite (the throwing `_routes.urlFor`
adapter) was already addressed in #2129's PR-d slot — re-verify before
implementing the followup.

### S6 — `metal/http_authentication.rb` Basic/Digest/Token (Tier 2, split into 2 PRs, ~250 LOC each) — AC

Closes `metal/http_authentication.rb` 13/33 → 33/33 across **two** PRs.

- **S6a (~250)**: `Basic` surface — 6 methods + privates.
- **S6b (~250)**: `Digest` + `Token` surfaces — 14 methods combined.

Rails source: `actionpack/lib/action_controller/metal/http_authentication.rb`.

**Porting shape:** Rails' three submodules port to sibling files
`metal/http-authentication/basic.ts`, `digest.ts`, `token.ts`, each
exporting `this`-typed functions that mix into the host Controller via
the `static fooBar = fooBar` pattern (CLAUDE.md). Do NOT inline as
instance methods on a class literal. Bundle each module's privates with
its public surface; do NOT split a single module across PRs (review
thrash).

### S7 — `test_case.rb` TestRequest/TestResponse split — AC

#2094 followup. Split into two ~250 LOC PRs.

- **S7a (~250)** — TestRequest helpers + TestResponse predicates.
  `queryString=`, `contentType=`, `assignParameters`, `shouldMultipart`,
  `paramsParsers`, `newSession`, `create`, `defaultEnv` (TestRequest);
  `isSuccess`, `isMissing`, `isError`, plus the rest of the
  `successful`/`notFound`/`redirection`/`serverError`/`clientError`
  status-predicate set on `TestResponse`. Per #2142, this likely also
  unblocks several `test-case.ts` misses on the controller side.
- **S7b (~250)** — `process`, `setupRequest`, `buildResponse`,
  `wrapExecution`, `processControllerResponse`,
  `setupControllerRequestAndResponse`, `scrubEnvBang`, `documentRootElement`,
  `checkRequiredIvars`, `assertTemplate`, `executorAroundEachRequest`,
  `generatedPath`, `queryParameterNames`.

**S7a depends-on:** nothing. **S7b depends-on:** S7a (shared helpers).

### S8 — Routing leaf bundle (Tier 1, ~200 LOC) — AD

Bundles several tiny mapper/route-set tweaks. Cited from #2116 + #2138
findings.

- ~3 — propagate `formatted` / `anchor` in `decomposedMatch` terminal branch
  (`mapper.ts`).
- ~5 — switch `resolve()` keying from `String(klass)` to
  `klass.name` / `klass.modelName?.name`.
- ~10 — add `new(cb)` scope helper so `on: "new"` dispatch works.
- ~10 — `Route.requirements` getter so `fromRequirements` matches Rails'
  canonical field (currently matches `route.defaults`).
- ~30 — align `resources()` / `resource()` `update` emission to **PATCH-then-PUT**
  to match `setMemberMappingsForResource()` and Rails (#2138). Likely touches
  `resource-routing.test.ts` expectations.
- ~40 — shallow **name** prefix preservation in `resources()`. `shallowName()`
  currently drops all name prefixes when shallow; Rails keeps outer
  non-resource `as:` / namespace prefixes (`admin_comment_path`, not
  `comment_path`).
- ~20 — `namespace` inside a resource scope should delegate through `nested`
  (Rails `mapper.rb:1626-1632`).
- ~30 — fix `mapper.resources` singular-vs-plural so `index`/`show` don't
  both emit the singular `name`; once fixed, re-enable the relaxed
  `addRoute` duplicate-name check in `route-set.ts` (#2112 followup).

### S9 — Mapper `mount()` end-to-end + direct/resolve consumption (Tier 2, ~250 LOC) — AD

From #2116. Currently `mount` registers the app but the resulting Route has
no callable endpoint; `direct()` / `resolve()` write to write-only maps.

- ~80 — extend `Route` / `RouteOptions` to carry a callable Rack endpoint;
  thread through `RouteSet#call` / `buildJourneyRouter` for mount dispatch.
- ~60 — wire `Mapper._directHelpers` / `_polymorphicMappings` into
  `RouteSet#draw` so they merge into `RouteSet.polymorphicMappings` and a
  new direct-helper registry consumed by url-for / polymorphic-routes.
- ~40 — `mount({ app, at, … })` hash-form overload (Rails' idiomatic shape).
- ~20 — `define_generate_prefix` should apply `currentNamePrefix` +
  normalization to the registered helper key (matches Rails for nested-scope
  mounts).

### S10 — `routing/redirection` (Tier 2, ~150 LOC) — AD

- ~80 — wire `Redirect` / `PathRedirect` / `OptionRedirect` into
  `Mapper#redirect` + `RouteSet` dispatch.
- ~30 — `rackEscape` parity with `Rack::Utils.escape` for `!*'()`.

### S11 — Cookies SerializedCookieJars layer (Tier 2, ~250 LOC) — AD

From #2109 findings. `CookieStore`'s round-tripping of session hashes
through real signed/encrypted jars currently doesn't work.

- ~20 — `signedOrEncrypted` getter on `CookieJar` (delegates to existing
  standalone helper).
- ~150 — grow a `SerializedCookieJars` layer so `SignedCookieJar` /
  `EncryptedCookieJar` accept arbitrary hash values via `[]=` and
  JSON-serialize internally (Rails defaults JSON; Marshal legacy).
- ~60 — port `handle_options` domain matching (`:all`, `Array`, `proc`,
  `tld_length`) on `CookieJar` once `Request#host` wiring solidifies.

**Out of scope here** (depends on `ActiveSupport::MessageVerifier` /
`MessageEncryptor`): `SignedKeyRotatingCookieJar` /
`EncryptedKeyRotatingCookieJar`. Track as a separate story when those
activesupport ports land.

### S12 — DefaultResponseApp ActionView swap (~30 LOC) — AD

**depends-on:** ActionView::Base template rendering.

Swap inline `renderBlockedHostHtml` / `renderBlockedHostText` in
`host-authorization.ts` for `DebugView.render("rescues/blocked_host",
layout: "rescues/layout")` once ActionView lands (#2244 followup).

Pair with:

- ~20 — wire `ALLOWED_HOSTS_IN_DEVELOPMENT` into a trailties Railtie default
  config (currently exported but consumers must pass manually).
- ~10 — widen `exclude` to accept Request (signature
  `(envOrRequest: RackEnv | Request) => boolean`) or switch fully to Request.

### S13 — DidYouMean reopen sweep (~80 LOC across packages) — cross-package

Stacked PRs #2080 / #2082 / #2084 / #2086 were closed (not merged) for CI
capacity. Each branch already carries the vitest + website alias fix from
#2079 + its feature commit on top.

- Reopen `didyoumean-pr4-parameter-missing`, `didyoumean-pr5-association-not-found`,
  `didyoumean-pr6-template-error`, `didyoumean-pr7-url-generation-error`
  rebased onto main, one at a time.
- ~30 — `UrlGenerationError#corrections` (actionpack
  `metal/exceptions.ts:59`) — replace substring-match with `SpellChecker`
  against `namedRoutes.helperNames`.
- ~80 — `Template::Error#corrections` (actionview) — export `jaroDistance`
  from `@blazetrails/did-you-mean` barrel, wire into Template::Error for
  virtual-path suggestions.

### S14 — `base.rb` mixin closure (multi-PR cluster, ~250 LOC each) — AC

64 misses, all in mixin/included-from files (`redirecting`, `etag_with_*`,
`helpers`, `request_forgery_protection`, `implicit_render`,
`instrumentation`, `params_wrapper` privates). **Most are upstream-blocked**
on rendering/dispatcher pipeline. Track inside individual P-slots in this
doc rather than as one mega-story.

- `metal/implicit-render` — wire real `templateExists` / `anyTemplates`
  once ActionView lookup arrives (~30). **depends-on ActionView.**
- `metal/instrumentation.haltedCallbackHook` — wire from AS::Callbacks
  `_runCallbacks` halt path (~50). **depends-on activesupport callback halt
  plumbing.**
- `metal.buildMiddleware` — promote inline `valid` augmentation onto the
  `Middleware` class (~10). Standalone.
- `request_forgery_protection` / `redirecting` / `etag_with_*` —
  upstream-blocked on rendering pipeline.

### S15 — Smaller leaves (any-time fillers, bundle to 250 LOC) — AD

These are <30-LOC items. Per MEMORY [feedback_no_tiny_prs] /
[feedback_bundle_to_pr_ceiling], do NOT ship standalone — pile into one
fidelity-sweep PR.

- `routing/endpoint` — `engine()` returns false (~5). **depends-on Engine.**
- `middleware/actionable_exceptions` — prototype-chain walk in
  `ActionableError.action` (~15). Only port if a real failure surfaces;
  current `_actions` copy-on-write covers single-level inheritance (#2246).
- `middleware/public_exceptions` — relocate inline `toXml` / `escapeXml`
  once activemodel ships `toXml` (Rails `to_xml`; trails port lands
  camelCase) (~30–50); optional iconv hookup in
  `normalizeCharset()` (~20).
- `middleware/session/abstract_store` — `privateId` + comparison helpers on
  `SessionId` (~10); add `cookieJar` accessor to `Request` (~20).
- `testing/assertions/routing` — `assertRecognizes` / `assertGenerates` test
  coverage for WHATWG → base-URL fallback (~10).
- `testing/test-response` — already covered in S7a.
- `controller/allow_browser` — `useragent`-gem divergences (regex bot
  detection, mobile UA folding, semver-tag compare); decide between
  documenting the gap or porting a real UA library.
- `processAction args` — optional ESLint rule for rest-param signature on
  overrides (~30, non-urgent).
- `request/session.ts loadBang` — `_idWasInitialized` tracking + `_idWas`
  update inside `loadBang` (~30); `Session#inspect` (~10); port Rails'
  `Session::Options` as a sibling `SessionOptions` class exported alongside
  `Session`, with `Session#id` / `Session#options` delegating to it (~40).
  #2077 followups.
- `middleware/stack.ts` — port Rails' `MiddlewareStack::Middleware` inner
  class as a sibling `MiddlewareStackEntry` (or nested static on
  `MiddlewareStack`) plus `InstrumentationProxy`; rewire stack methods
  (~80). #2077 followup.
- `testing/test-request.ts` — Rails-faithful setters (notably
  `requestMethod=` upcase), `create` factory (~30, deps-on Trailtie). #2077.
- `routing/inspector` — `RouteWrapper.sourceLocation` (~20) — thread a
  `sourceLocation` option through `match`/`get`/`post` mapper, propagate
  into Route. Expanded formatter already wired to print it. #2075.

### S16 — Routing test:compare ports (Tier 3, multi-PR) — AD

`test:compare` for routing is 0/178 on routing.rb, 0/45 on
prefix_generation, etc. — these are test-name ports, not implementation.
Each Rails test file should be a ~150–250 LOC PR.

Priority order (parallelizable):

1. `inspector_test.rb` — 22 missing (golden-output assertions). Would
   surface column-alignment or constraint-formatting divergence (#2075).
2. `routing.rb` (178), `resources.rb` (78), `prefix_generation.rb` (45),
   `url_generation.rb` (37), `assertions.rb` (29).
3. `mapper_test.rb` — 17 remaining (`dispatch/mapper_test.rb` is at 4/21).
   Mostly scope/anchor/via/format behavior (#2150).
4. `host_authorization_test.rb` — 0/41 ported (trails currently has 23
   hand-written cases). New behaviors XHR format / detailed body /
   logger.error are covered by hand-written tests (#2244).

### S17 — Journey follow-ups (~215 LOC) — AD

- ~80 — GTG symbol char-class widening based on requirement regex
  (`transition_table.ts` Builder consults `Pattern.requirements`). **Leaf**
  (no upstream blocker). Ship the unskip of the SKIPPED named-character-classes
  test for `filename: /(.+)/` in the same PR.
- ~80 — Real dispatcher registry; replace throwing-stub `app` in bridge.
  **depends-on ActionController.**
- ~30 — Swap `RouterRequest` / `RoutableApp` / `FormatterHost` interim
  interfaces for real `ActionDispatch::Request` types. **Leaf.**
- ~10 — Drop dead `ESCAPED` regex in `journey/router/utils.ts`; audit four
  `UNSAFE_*` regexes for `/u` flag (non-BMP surrogate pairs).
- ~15 — `unescapeUri` non-BMP support (`codePointAt` + variable step).

### S18 — RouteSet remaining surface (depends-on ActionController dispatcher) — AD

From #2089 / #2112 / #2129 findings.

- **PR-c (~250)** — `#call` / `#serve` path through the route dispatcher.
  **depends-on ActionController port.**
- **PR-c2 (~80)** — `routing::Route` → `Journey::Route` bridge. Unblocks
  real `formatter`, per-route eager-load, AST cache warmup, and `mount`
  end-to-end (cross-refs S9).
- **~80** — extend `UrlHelpersModule` to generate per-route `${name}Path` /
  `${name}Url` once `NamedRouteCollection` is ported.
- **~5** — flip `draw()` to unconditional `clearBang` / `finalizeBang` once
  trails callers are Rails-aligned (will break some existing tests).

### S19 — `exception_wrapper` / didyoumean polish (~80 LOC) — AD

From #2081.

- ~50 — promote `MissingTemplate` / `RoutingError` / `ActionNotFound` /
  `MissingExactTemplate` `.name` assignments to Rails-qualified strings;
  drop short-key aliases from `RESCUE_TEMPLATES`.
- ~30 — extend `BacktraceCleaner.clean()` in `@blazetrails/activesupport`
  to take `kind: "silent" | "noise" | "all"`; drop the local partition in
  `cleanBacktrace`.

### S20 — railtie wiring stubs (low priority) — AD

Future-wired stubs blocked on unported targets (`Response.defaultCharset` /
`defaultHeaders`, `CookieJar.alwaysWriteCookie`, etc.). Add
`action_dispatch/railtie.rb` → `action-dispatch/railtie.ts` to
`FILE_OVERRIDES` in `scripts/api-compare/compare.ts` and stub forward.

---

## Known divergences from Rails (intentional)

### ActionController

- **YAML hook (`Parameters.hookIntoYamlLoading`):** no-op; TS has no
  built-in YAML.
- **CSRF token stores (`SessionStore`, `CookieStore`):** take session/cookies
  hash directly (not `request`); `CookieStore` does plain read/write, no
  encryption or session ID validation. Refit once a real cookie jar with
  encryption is wired.
- **Cache-control (`noStore`):** builds the header string directly instead
  of mutating a `response.cache_control` hash (we don't have that hash yet).
- **Etaggers (`etag`):** module-level array shared across controllers;
  scope per-class once `class_attribute` lands.
- **Renderers (`renderToBody`, `useRenderers`):** static methods, global
  `_renderers` Set; should become instance/class methods with per-class
  state when controller mixin architecture is wired.
- **Metal.action / Metal.build:** returns the bare endpoint without
  middleware wrapping; our `MiddlewareStack` doesn't override `build` to
  accept an action name.
- **`httpCacheForever`:** sets `Cache-Control` and always calls the block;
  no `stale?` conditional integration.
- **`Renderer.withDefaults`:** merges defaults but does not recompute the
  Rack env.
- **`permissionsPolicy` DSL:** registers a `beforeAction` that mutates a
  fresh directives object; until `Request#permissionsPolicy` + response
  middleware lands, modified directives don't round-trip into the header.
- **`RateLimiting`:** no global `Rails.cache`; DSL falls back to a
  `cacheStore` static on the host controller and throws if neither is set.
  A `MemoryRateLimitStore` ships for tests; production must supply a
  `RateLimitStore` where `increment` accepts seconds (not ms) and
  initializes a missing counter to `amount` (Redis/Memcached behavior).
- **`BrowserBlocker.versions`:** returns a shallow copy instead of the live
  array.
- **`TestCase.tests` / `determineDefaultControllerClass`:** uses
  `globalThis` for constant lookup (closest JS analogue to Ruby
  `constantize`); accepts String|Class only (Symbol dropped).
- **`render` guard:** `this.performed` instead of `responseBody` —
  trails' Metal `responseBody` getter returns `""` even when unrendered.
- **camelCase scriptNamer keys:** `Mapper._mountedScriptNamers` keyed on
  camelCase `scriptName`/`originalScriptName` (CLAUDE.md "camelCase only,
  even for Rails payload keys").

### ActionDispatch

- **`Request#checkMethod`** throws a generic `Error`; Rails raises
  `ActionController::UnknownHttpMethod`. Port that error first.
- **`Request#rawHostWithPort` whitespace** mirrors Rails' quirk: header
  whitespace on a non-first forwarded entry is preserved (#2244 c2/c3).
- **`buildBacktrace`** returns raw stack lines instead of remapping
  template frames through `ActionView::PathRegistry` (#2081).
- **`isTemplateError`** uses string name-match instead of
  `instanceof ActionView::Template::Error` (avoids actionpack→actionview
  dependency inversion).
- **`ShowExceptions`** mutates env directly and restores in `finally`;
  Rails dups env (`env.dup`). Equivalent return value but diverges if
  `exceptionsApp` keeps a reference.
- **`Static`** rejects `..` escapes upfront; Rails collapses and lets the
  filesystem miss (#2083).
- **`Mapper#draw(string)`** throws — Ruby file-load form not supported.
- **`mount`** only accepts kwarg form `mount(SomeApp, { at: "/path" })`;
  Rails' hash form `mount(SomeApp => "/path")` deferred to S9.
- **`asJson` keys `stdparam_states` by `re.source`** for symmetry with
  `regexp_states`; Rails uses Regexp objects (functionally inert) (#2115).
- **Permissions-Policy spec divergence** — see S2.
- **`UploadedFile#open` / `toIo`** return `Buffer` (in-memory by design).

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

- camelCase only — no snake_case identifiers (including Rails payload keys).
- PR ≤ 300 LOC (excl. lockfiles, snapshots).
- Mixin methods use the `this`-typed function pattern:

  ```ts
  export function foo(this: HostInterface, ...) { ... }
  // then on the host class:
  static foo = foo;
  ```

  Do NOT inline the body in `base.ts`.

- For class-attached mixin methods, **use declared class fields inside the
  class body** — `declare module "./X" { interface … }` declaration merging
  is NOT picked up by the api:compare extractor (#2137).
- Add a "Known divergences from Rails" entry above for any behavior that
  can't be mirrored exactly.
- `instance_exec(opts, &block)` → `block.call(this, opts)` with
  `this: unknown`.
- Ruby `compact` → `.filter((e) => e !== null && e !== undefined)`
  (NOT `.filter(Boolean)`).
- Ruby `Hash#key?` → `Object.hasOwn(obj, "K")` (NOT `obj["K"] != null` or
  `"K" in obj`).
- Per MEMORY [feedback_no_tiny_prs] / [feedback_bundle_to_pr_ceiling]:
  don't ship <30-LOC items standalone — pile into S15 fidelity sweeps.
- Per MEMORY [feedback_copilot_rails_fidelity]: verify Copilot suggestions
  against `scripts/api-compare/.rails-source/` before accepting.
- Per #2129 findings: a "Rails-design rationale" preamble in the PR
  description listing intentional choices upfront cuts Copilot review noise
  on Rails-faithful PRs (mounted-helpers shared module, `supports_path`
  scope, etc.).

Sequencing: one agent per source file at a time.
