# actionpack — Road to 100%

Covers ActionDispatch, ActionController, AbstractController. ActionView
has its own plan ([actionview-100-percent.md](actionview-100-percent.md)).

Forward-only. Completed slots live in git; this doc tracks only what's
open. Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
for p in actiondispatch actioncontroller abstractcontroller; do
  pnpm tsx scripts/api-compare/compare.ts --package "$p" --privates | tail -3
done
pnpm run test:compare 2>&1 | grep -E "(actiondispatch|actioncontroller|abstractcontroller)  —"
```

> `pnpm api:compare` is a chained `&&` script and won't forward
> `--package`; invoke `compare.ts` directly for scoped totals.

## Status (2026-05-24)

| Package            | api:compare       | files at 100% | inheritance   | test:compare     |
| ------------------ | ----------------- | ------------- | ------------- | ---------------- |
| abstractcontroller | 82/82 (100%)      | 11/11         | 3/4 (75%)     | 42/52 (81%)      |
| actiondispatch     | 1277/1350 (94.6%) | 75/83         | 58/66 (87.9%) | 577/1622 (35.6%) |
| actioncontroller   | 496/578 (85.8%)   | 42/43         | 16/16 (100%)  | 552/1860 (29.7%) |

**Two large bodies of work remain:**

1. **api:compare** — 82 methods across 5 partial files (most upstream-blocked on ActionView). See [Stories — API surface](#stories--api-surface).
2. **test:compare** — ~2350 Rails test cases not yet ported. Heaviest on routing, test_case, integration, render. See [Stories — Test ports](#stories--test-ports).

### Start here (next ~3 PRs to pick up)

If you're new to this doc, these are the highest-leverage **unblocked**
stories to pick up next:

1. **S6a** (~250 LOC) — port `Basic` HTTP-auth module surface. Test suite
   already landed in #2314; unblocks `metal/http_authentication.rb` 13/33 → 19/33
   and pairs naturally with T-AC1/T-AC2 once S6b follows.
2. **T-AD11 (part 1)** (~250 LOC) — first ~60-test split of
   `dispatch/routing_test.rb` (185 missing → 3 PRs; group by Rails
   describe block). Pure test port, no upstream dependency, biggest
   single test:compare lever.
3. **S9** (~250 LOC) — Mapper `mount()` end-to-end + direct/resolve
   consumption. S8 shipped (#2487); S9 is the next routing lever.

Each has no upstream blocker and ships in one PR.

---

## Upstream blockers

Chains of stories gated on one port. Most stories below cite one.

| Blocker                                           | Unblocks                                                                                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ActionView::Base + template rendering             | DebugView render+lookupContext, rescue templates, Template::Error unwrap, S12 ActionView swap, S14 base.rb mixin chain. AC test ports: `render_test`, `layout_test`, `capture_test`, `helper_test`, `view_paths_test`, and all `new_base/*` tests. |
| ActionView digestor                               | `metal/etag_with_template_digest.rb` 7 methods (closed inheritance, but consumers blocked).                                                                                                                                                        |
| ActionView helper integration                     | `metal/helpers.rb` (6 methods).                                                                                                                                                                                                                    |
| ActionController full dispatcher                  | S18 PR-c, server_timing tests, dispatcher `to:` form, debug-locks tests, real Journey dispatcher registry.                                                                                                                                         |
| ActiveSupport::Executor (real port)               | 3 skipped executor cases.                                                                                                                                                                                                                          |
| ActiveSupport::Dependencies.interlock             | `dispatch/debug-locks.test.ts`.                                                                                                                                                                                                                    |
| ActiveSupport::Notifications                      | `redirect.action_dispatch` notification.                                                                                                                                                                                                           |
| ActiveSupport::MessageVerifier / MessageEncryptor | `SignedKeyRotatingCookieJar` / `EncryptedKeyRotatingCookieJar`; real verifier-backed signed/encrypted jars.                                                                                                                                        |
| ActiveSupport::Messages::SerializerWithFallback   | `:marshal` / `:hybrid` / `:json_allow_marshal` dispatch in cookies serializer.                                                                                                                                                                     |
| activesupport Railtie `before:`/`after:` ordering | further railtie ports.                                                                                                                                                                                                                             |
| activemodel `to_xml`                              | `middleware/public_exceptions` xml helpers relocation.                                                                                                                                                                                             |
| Rails::Engine                                     | `routing/endpoint.engine()`; `recognizePathWithRequest` engine recursion; `RouteWrapper.isEngine()`.                                                                                                                                               |
| `@blazetrails/rack` Session::Abstract::Persisted  | abstract_store reparent, drop local `Persisted` shim.                                                                                                                                                                                              |
| rails-dom-testing (Nokogiri analogue)             | `testing/assertions.htmlDocument`, IntegrationTest `documentRootElement`, AC integration test_case ports.                                                                                                                                          |
| Rack::MockSession analogue                        | IntegrationTest `_mockSession`.                                                                                                                                                                                                                    |

---

## Stories — API surface

Sized to one PR (~250 LOC, 300 ceiling). Pick the top-listed item in each
thread; dependencies marked **depends-on**.

### S4F — strong_parameters permit-dispatch wiring — AC (~50–100 LOC)

From #2254 findings. `permitValue` / `permitHash` / `permitArrayOfHashes`
exist but `_hashFilter` still inlines its own dispatch.

- Refactor `_hashFilter` to delegate to `permitValue` (Rails `hash_filter`,
  strong_parameters.rb:1349).
- Thread `explicitArrays:` kwarg through `permitFilters` → `hashFilter` →
  `permitValue` to add Rails' 4th branch (strong_parameters.rb:1361).
- Audit: any new Rails-private mirroring a helper that calls `self.each` /
  `params.each` must use trails' `each()`, NOT `Object.entries(this._data)`
  (#2254 review).

### S5 — Integration::Session followups — AD (~80 LOC)

Closes `testing/integration.rb` 78/81 → 81/81 (modulo upstream-blocked
items).

- ~30 — 404-branch options.env/headers/body merge: factor env-build out of
  matched-branch into a helper, call from both paths.
  `followRedirectBang` whose target doesn't match a route currently loses
  the injected `HTTP_REFERER`.
- ~10 — drop `host.split(":")` IPv6 mishandling in both `_processPath` and
  `_buildFullUri`.
- ~25 — expose `htmlDocument` + `documentRootElement` once rails-dom-testing
  lands. **depends-on rails-dom-testing.**
- ~15 — expose `_mockSession` once a Rack::MockSession analogue exists.
  **depends-on Rack::MockSession.**

### S6 — `metal/http_authentication.rb` Basic/Digest/Token — AC

Currently 13/33. Rails Basic test suite landed in #2314; production
methods still missing.

- **S6a (~250)** — `Basic` module surface (6 methods + privates). Port
  into `metal/http-authentication/basic.ts` using the `this`-typed
  function + `static fooBar = fooBar` mixin pattern. Pairs with **T-AC1**.
- **S6b (~250)** — `Digest` + `Token` surfaces (14 methods combined),
  split into sibling files `digest.ts`, `token.ts`. Don't split a single
  Rails submodule across PRs. Pairs with **T-AC1 / T-AC2**.

### S7 — `test_case.rb` TestRequest/TestResponse split — AC

`test_case.rb` 24/49. Split into two PRs.

- **S7a (~250)** — TestRequest helpers + TestResponse predicates.
  `queryString=`, `contentType=`, `assignParameters`, `shouldMultipart`,
  `paramsParsers`, `newSession`, `create`, `defaultEnv` (TestRequest);
  `isSuccess`, `isMissing`, `isError`, plus the `successful` / `notFound` /
  `redirection` / `serverError` / `clientError` status-predicates on
  `TestResponse`. Likely unblocks several `test-case.ts` misses on the
  controller side.
- **S7b (~250)** — `process`, `setupRequest`, `buildResponse`,
  `wrapExecution`, `processControllerResponse`,
  `setupControllerRequestAndResponse`, `scrubEnvBang`,
  `documentRootElement`, `checkRequiredIvars`, `assertTemplate`,
  `executorAroundEachRequest`, `generatedPath`, `queryParameterNames`.
  **depends-on S7a.**

### S9 — Mapper `mount()` end-to-end + direct/resolve consumption — AD (~250 LOC)

`mount` registers the app but the resulting Route has no callable
endpoint; `direct()` / `resolve()` write to write-only maps.

- ~80 — extend `Route` / `RouteOptions` to carry a callable Rack endpoint;
  thread through `RouteSet#call` / `buildJourneyRouter` for mount dispatch.
- ~60 — wire `Mapper._directHelpers` / `_polymorphicMappings` into
  `RouteSet#draw` so they merge into `RouteSet.polymorphicMappings` + a
  direct-helper registry consumed by url-for / polymorphic-routes.
- ~40 — `mount({ app, at, … })` hash-form overload (Rails idiomatic shape).
- ~20 — `define_generate_prefix` apply `currentNamePrefix` + normalization
  to the registered helper key.

### S10 — `routing/redirection` follow-ups — AD (~180 LOC)

Mapper#redirect → Redirect endpoint dispatch shipped in #2249. Remaining:

- ~80 — delete `Route.resolveRedirect` (parallel impl) and migrate ~13
  `dispatch/routing.test.ts` redirect cases to assert against
  `route.redirectEndpoint!.buildResponse(req).headers.Location`. Expected
  URLs flip from relative to absolute (Rails-faithful).
- ~50 — replace `__redirect__:N` magic-string token protocol with
  `to: Redirect` directly. Widen `RouteOptions.to`, `getToFromPath`,
  scope-frame `to`. Deletes `redirectInstances` Map + `redirectCounter`.
- ~20 — align `OptionRedirect.options` with Rails (`alias :options :block`);
  widen `RedirectBlock` type.
- ~30 — `rackEscape` parity with `Rack::Utils.escape` for `!*'()`.

### S11 — Cookies layered jar follow-ups — AD (bundle to ~250 LOC)

`signedOrEncrypted` + serialized jars shipped in #2251. Remaining
(none upstream-blocked):

- ~30–50 — Proxy bridge or `.set` integration for the future
  `ActionDispatch::Session::CookieStore` port.
- ~30 — `force_reserialize` plumbing from verifier/encryptor → `parse` →
  flag rewrite. Without it, cookies written with stale serializers stay
  stale silently.
- ~40 — `cookie_metadata` (purpose tagging + expires_at/expires_in) through
  SignedCookieJar/EncryptedCookieJar `set`.
- ~60 — port `handle_options` domain matching (`:all`, `Array`, `proc`,
  `tld_length`) on `CookieJar`.

**Out of scope until activesupport ports land:** real MessageVerifier-backed
signed jar with metadata envelope + key rotations; MessageEncryptor-backed
encrypted jar with AEAD GCM; `SignedKeyRotatingCookieJar` /
`EncryptedKeyRotatingCookieJar`.

### S12 — HostAuthorization ActionView swap — AD (~30 LOC)

**depends-on ActionView::Base template rendering.**

Swap inline `renderBlockedHostHtml` / `renderBlockedHostText` for
`DebugView.render("rescues/blocked_host", layout: "rescues/layout")`.

Pair with:

- ~20 — wire `ALLOWED_HOSTS_IN_DEVELOPMENT` into a trailties Railtie
  default config.
- ~10 — widen `exclude` to accept Request (signature
  `(envOrRequest: RackEnv | Request) => boolean`).

### S13 — DidYouMean reopen sweep — cross-package (~80 LOC)

Stacked PRs #2080 / #2082 / #2084 / #2086 were closed (not merged) for CI
capacity; each branch already carries the vitest + website alias fix.
Reopen one at a time rebased onto main.

- ~30 — `UrlGenerationError#corrections` — replace substring-match with
  `SpellChecker` against `namedRoutes.helperNames`.
- ~80 — `Template::Error#corrections` (actionview) — export `jaroDistance`
  from `@blazetrails/did-you-mean` barrel; wire into Template::Error for
  virtual-path suggestions.

### S14 — `base.rb` mixin closure (cluster) — AC

62 misses, all in mixin/included-from files. **Most upstream-blocked.**
Track inside the individual P-slots below rather than as one mega-story.

- `metal/implicit-render` — wire real `templateExists` / `anyTemplates`
  once ActionView lookup arrives (~30). **depends-on ActionView.**
- `metal/instrumentation.haltedCallbackHook` — wire from AS::Callbacks
  `_runCallbacks` halt path (~50). **depends-on AS callback halt plumbing.**
- `metal.buildMiddleware` — promote inline `valid` augmentation onto the
  `Middleware` class (~10). **Standalone.**
- `request_forgery_protection` / `redirecting` / `etag_with_*` —
  upstream-blocked on rendering pipeline.

### S15 — Smaller leaves (any-time fillers) — AD/AC

Bundle to ~250 LOC; never ship as a standalone tiny PR (review-cycle data
shows <30-LOC fidelity PRs consume disproportionate Copilot/human bandwidth).

- `routing/endpoint` — `engine()` returns false (~5). **depends-on Engine.**
- `middleware/actionable_exceptions` — prototype-chain walk in
  `ActionableError.action` (~15). Only port on real failure surface; the
  current `_actions` copy-on-write covers single-level inheritance (#2246).
- `middleware/public_exceptions` — relocate inline `toXml` / `escapeXml`
  once activemodel ships `toXml` (~30–50); optional iconv hookup in
  `normalizeCharset()` (~20).
- `middleware/session/abstract_store` — `privateId` + comparison helpers
  on `SessionId` (~10); `cookieJar` accessor on `Request` (~20).
- `testing/assertions/routing` — `assertRecognizes` / `assertGenerates`
  coverage for WHATWG → base-URL fallback (~10).
- `controller/allow_browser` — useragent-gem divergences (regex bot
  detection, mobile UA folding, semver-tag compare); decide between
  documenting the gap or porting a real UA library.
- `processAction args` — optional ESLint rule for rest-param signature on
  overrides (~30, non-urgent).
- `request/session.ts loadBang` — `_idWasInitialized` tracking + `_idWas`
  update inside `loadBang` (~30); `Session#inspect` (~10); Rails'
  `Session::Options` as a sibling class (~40). #2077 followups.
- `middleware/stack.ts` — port Rails' `MiddlewareStack::Middleware` inner
  class as `MiddlewareStackEntry` + `InstrumentationProxy`; rewire stack
  methods (~80). #2077 followup.
- `testing/test-request.ts` — Rails-faithful setters (`requestMethod=`
  upcase), `create` factory (~30). **depends-on Trailtie.** #2077.
- `routing/inspector` — `RouteWrapper.sourceLocation` (~20) — thread
  `sourceLocation` option through `match`/`get`/`post` mapper, into Route.
- `metal/mime_responds` — 1 missing method (89% → 100%). Standalone leaf.

### S17 — Journey follow-ups — AD (~215 LOC)

- ~80 — GTG symbol char-class widening based on requirement regex
  (`transition_table.ts` Builder consults `Pattern.requirements`). **Leaf.**
  Ship the unskip of the SKIPPED `filename: /(.+)/` test in the same PR.
- ~80 — Real dispatcher registry; replace throwing-stub `app` in bridge.
  **depends-on ActionController dispatcher.**
- ~30 — Swap `RouterRequest` / `RoutableApp` / `FormatterHost` interim
  interfaces for real `ActionDispatch::Request` types. **Leaf.**
- ~10 — Drop dead `ESCAPED` regex in `journey/router/utils.ts`; audit four
  `UNSAFE_*` regexes for `/u` flag (non-BMP surrogate pairs).
- ~15 — `unescapeUri` non-BMP support (`codePointAt` + variable step).

### S18 — RouteSet remaining surface — AD

- **PR-c (~250)** — `#call` / `#serve` path through the route dispatcher.
  **depends-on ActionController dispatcher.**
- **PR-c2 (~80)** — `routing::Route` → `Journey::Route` bridge. Unblocks
  real `formatter`, per-route eager-load, AST cache warmup, end-to-end
  `mount`. **Leaf — start here.**
- **~80** — extend `UrlHelpersModule` to generate per-route `${name}Path`
  / `${name}Url` once `NamedRouteCollection` is ported.
- **~5** — flip `draw()` to unconditional `clearBang` / `finalizeBang`
  once trails callers are Rails-aligned (will break some existing tests).

### S19 — `exception_wrapper` / didyoumean polish — AD (~80 LOC)

From #2081.

- ~50 — promote `MissingTemplate` / `RoutingError` / `ActionNotFound` /
  `MissingExactTemplate` `.name` assignments to Rails-qualified strings;
  drop short-key aliases from `RESCUE_TEMPLATES`.
- ~30 — extend `BacktraceCleaner.clean()` in `@blazetrails/activesupport`
  to take `kind: "silent" | "noise" | "all"`; drop the local partition in
  `cleanBacktrace`.

### S20 — railtie wiring stubs (low priority) — AD

Future-wired stubs blocked on unported targets (`Response.defaultCharset` /
`defaultHeaders`, `CookieJar.alwaysWriteCookie`, …). Add
`action_dispatch/railtie.rb` → `action-dispatch/railtie.ts` to
`FILE_OVERRIDES` in `scripts/api-compare/compare.ts` and stub forward.

---

## Stories — Test ports

`test:compare` is name-match (path + description), not behavior. Many ported
tests today have shallower assertions than Rails because the underlying API
isn't ready. As each API story lands, audit matching tests and replace
stubs with real assertions. **Goal: 100% test:compare with Rails-equivalent
assertions.**

Each story below is one Rails test file → one ~150–250 LOC PR. Read the
Rails source first; preserve test names exactly (CLAUDE.md). Open ports in
parallel unless they share a dependency.

### Independent ports (do these in any order, in parallel)

| Story  | Ruby file                                       |           Missing | Pkg | Depends-on | Notes                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------- | ----------------: | --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-AC4  | `controller/mime/respond_to_test.rb`            |                38 | AC  | S15        | 28/66. Pair with `metal/mime_responds` leaf.                                                                                                                                                                                              |
| T-AD3  | `dispatch/url_generation_test.rb`               | ~~37~~ 17 (#2423) | AD  | —          | 20 passing + 17 skipped via #2423. Remaining gaps: SCRIPT_NAME propagation, subdomain false/nil stripping, `port: false`, trailing-slash via controller dispatch + `URL.pathFor` formatting (needs `RouteSet.pathFor` to honor `format`). |
| T-AD4  | `dispatch/routing_assertions_test.rb`           |                29 | AD  | S15        | Pair with `assertRecognizes` WHATWG fix.                                                                                                                                                                                                  |
| T-AD1  | `dispatch/routing/inspector_test.rb`            |                24 | AD  | —          | Golden-output assertions; surfaces formatter divergence.                                                                                                                                                                                  |
| T-AC1  | `controller/http_digest_authentication_test.rb` |                17 | AC  | S6b        | Bundle with Digest port.                                                                                                                                                                                                                  |
| T-AC2  | `controller/http_token_authentication_test.rb`  |                16 | AC  | S6b        | Bundle with Token port.                                                                                                                                                                                                                   |
| T-AC3  | `controller/url_for_test.rb`                    | ~~28~~ 15 (#2460) | AC  | —          | 42/57 via #2460. 15 remaining need RouteSet-backed URL generation (~200-300 LOC).                                                                                                                                                         |
| T-AC5  | `controller/redirect_test.rb`                   |                14 | AC  | S10        | 39/53. Pair with redirect cleanup.                                                                                                                                                                                                        |
| T-AC8  | `controller/content_type_test.rb`               |  ~~13~~ 7 (#2422) | AC  | —          | 7 remaining blocked on ActionView (erb/builder rendering, respond_to + view).                                                                                                                                                             |
| T-AD10 | `dispatch/mount_test.rb`                        |                10 | AD  | S9         | Bundle with mount work.                                                                                                                                                                                                                   |
| T-AC21 | small-leaves bundle (≥5 missing, ≤10)           |               ~70 | AC  | mixed      | `parameter_encoding`, `show_exceptions`, `api/conditional_get`, `mime/accept_format`, `rate_limiting`, `localized_templates`, `request/test_request`. Bundle to ~250 LOC.                                                                 |

### Large port stories (sorted by size; split each into ~2–3 PRs)

| Story  | Ruby file                                              | Missing | Pkg | Depends-on                            | Split guidance                                            |
| ------ | ------------------------------------------------------ | ------: | --- | ------------------------------------- | --------------------------------------------------------- |
| T-AD11 | `dispatch/routing_test.rb`                             |     185 | AD  | —                                     | ~3 PRs at ~60 tests each; group by describe block.        |
| T-AC9  | `controller/routing_test.rb`                           |     140 | AC  | —                                     | ~3 PRs at ~50 tests each. S8 shipped (#2487); unblocked.  |
| T-AC10 | `controller/test_case_test.rb`                         |     127 | AC  | S7a, S7b                              | Port tests as S7a/S7b methods land.                       |
| T-AD12 | `dispatch/cookies_test.rb`                             |      99 | AD  | S11                                   | ~2 PRs; pair with cookie follow-ups.                      |
| T-AC11 | `controller/integration_test.rb`                       |      91 | AC  | rails-dom-testing + Rack::MockSession | ~30 cases blocked; port the rest now.                     |
| T-AC12 | `controller/resources_test.rb`                         |      78 | AC  | —                                     | 0/78. S8 shipped (#2487); unblocked.                      |
| T-AD17 | journey cluster (parser / path / router / utils / ast) |      69 | AD  | —                                     | Bundle by sub-file.                                       |
| T-AC13 | `controller/request_forgery_protection_test.rb`        |      59 | AC  | —                                     | 41/100. Bundle.                                           |
| T-AC14 | `controller/filters_test.rb`                           |      54 | AC  | —                                     | 0/54.                                                     |
| T-AbC1 | `abstract/callbacks_test.rb` + `translation_test.rb`   |      47 | AbC | —                                     | Pair; both abstractcontroller.                            |
| T-AD13 | `dispatch/prefix_generation_test.rb`                   |      45 | AD  | —                                     | 24/45 passing; 21 skipped pending Rails::Engine dispatch. |
| T-AC15 | `controller/action_pack_assertions_test.rb`            |      44 | AC  | —                                     | 0/44.                                                     |
| T-AD14 | `dispatch/host_authorization_test.rb`                  |      41 | AD  | —                                     | 0/41. Trails has 23 hand-written XHR/detailed-body cases. |
| T-AC16 | `controller/live_stream_test.rb`                       |      36 | AC  | AS::Executor (partial)                | 0/36. Some cases ship now.                                |
| T-AC17 | `controller/log_subscriber_test.rb`                    |      34 | AC  | —                                     | 0/34. S3 subscriber wiring already shipped.               |
| T-AC18 | `controller/caching_test.rb`                           |      32 | AC  | —                                     | 0/32.                                                     |
| T-AC19 | `controller/params_wrapper_test.rb`                    |      30 | AC  | —                                     | 0/30.                                                     |
| T-AC20 | `controller/renderer_test.rb`                          |      25 | AC  | ActionView                            | 0/25.                                                     |
| T-AD15 | `dispatch/debug_exceptions_test.rb`                    |      20 | AD  | ActionView (5+ render cases)          | 22/42. Port the non-render cases now.                     |

### Blocked by ActionView (do not start)

These are large but unactionable until ActionView template rendering lands.
Listed for visibility; tracked here so they aren't re-spawned prematurely:

- `controller/render_test.rb` (88)
- `controller/helper_test.rb` (23) — needs AV helper integration
- `controller/new_base/render_*_test.rb` (8 files, ~120 tests combined)
- `abstract/layouts_test.rb` (45)
- `abstract/render_test.rb` (7)
- `abstract/abstract_controller_test.rb` (19) — render-heavy
- `abstract/helper_test.rb` (8)
- `controller/capture_test.rb` (6)
- `controller/layout_test.rb` (21)
- `controller/view_paths_test.rb` (14)

---

## How to ship one PR

General workflow (worktrees, build/test/prettier loop, draft PR + `/link`)
lives in **CLAUDE.md** — start there. actionpack-specific notes only:

- Implement in the TS file the api:compare row points to; don't relocate
  methods. Scope: `--package actiondispatch|actioncontroller|abstractcontroller`.
- For class-attached mixin methods, **use declared class fields inside the
  class body** — `declare module "./X" { interface … }` declaration merging
  is NOT picked up by the api:compare extractor (#2137).
- For test-port PRs, **preserve test names exactly** — test:compare matches
  on name; renames silently drop the match.
- Quote the Rails source lines being mirrored in the PR body. Per #2129
  findings, a "Rails-design rationale" preamble listing intentional choices
  upfront cuts Copilot review noise.
- One agent per source file at a time.

---

## Post-merge follow-ups

**From #2360 (IntegrationProcessTest part 1)**

- [ ] ~64 tests: `IntegrationProcessTest` part 2 — process-lifecycle and
      multi-request session cases deferred from #2360. Depends on
      `Rack::MockSession` analogue landing (upstream blocker row in the table
      above). Track as a new T-AC11 split once the blocker is cleared.

**From #2358 (integration test infrastructure)**

- [ ] 5 infrastructure gaps documented as `it.skip` in the test file
      (session-cookie propagation across requests, multi-session interleaving,
      process-restart state, remote-addr spoofing, and chunked response drain).
      Each needs a targeted follow-up PR; do not bundle — they have different
      upstream blockers.

**From #2348 (FilterTest basic conditional/before/after)**

- [ ] ~37 tests: T-AC14b follow-up — remaining `FilterTest` tests
      (skipping/rendering/redirection/around filters) +
      `YieldingAroundFiltersTest`. Target file:
      `packages/actionpack/src/action-controller/controller/filters.test.ts`.
- [ ] 4 skipped tests pending callbacks impl gaps: non-yielding around
      halt, `beforeActions` reflection API (`addedActionToInheritanceGraph`,
      `baseClassInIsolation`, `prependingAction`).

**From #2325 + #2487 (S8 routing leaf bundle)**

- [ ] `constraints` propagated to `new`/`create` routes — Rails only
      passes to member/collection. Low risk but verify if constraint-on-new
      tests appear.

**From #2334 (routing_test.rb part 2)**

- [ ] Optional segment fallback in journey router — skipped tests
      (`optional scoped path`, `nested optional scoped path`) need the
      no-segment recognition path to return a match instead of null.

**From #2352 (host_authorization_test.rb)**

- [ ] `HostPermission` type only accepts `string | RegExp | IPAddr` —
      Rails also accepts callable predicates (lambdas). Extend union if
      needed.

**From #2422 (T-AC8 content_type_test.rb)**

- [ ] 7 ActionView-dependent tests skipped: erb/builder content-type defaults,
      `respond_to` + view rendering. Un-skip once ActionView template rendering
      lands.
- Discovery: Rails' `Response#content_type=` parses input via
  `parse_content_type` and merges with existing charset before rebuilding via
  `set_content_type`. Our naive string-concat broke
  `"text/html; fragment; charset=utf-16"`. Now mirrored in #2422.
- Discovery: Rails' `Response#charset` falls back to
  `self.class.default_charset` when no `charset=` directive is in the header.
  Trails returned `undefined`. Fixed in #2422.
- Discovery: Rails' `render body:` defaults to `Mime[:text]` (`text/plain`),
  not `application/octet-stream`. Fixed in #2422.

**From #2423 (T-AD3 url_generation_test.rb)**

- [ ] ~30 LOC: `normalizeHost` should strip subdomain when given `nil`/`false`/
      blank — currently defaults to `true`. 3 skipped tests in
      `url-generation.test.ts`.
- [ ] ~5 LOC: `UrlOptions.port` typed `number|string|null` — accept `false`
      to suppress port. 1 skipped test.
- [ ] ~50 LOC: `RouteSet.pathFor` ignores `format` param when computing
      trailing-slash placement. 6 skipped path-helper tests.
- [ ] ~80 LOC: controller dispatch with `url_for(trailing_slash: true)` /
      route-level default. 5 skipped tests.
- [ ] ~50 LOC: SCRIPT_NAME header propagation through controller dispatch and
      mounted-app wrapping. 2 skipped tests.

**From #2424 (T-AD5 request_test.rb remainder)**

- [ ] ~30 LOC: wire RemoteIp middleware into the test helper so spoof-detection
      and trusted-proxies tests can run (9 skips).
- [ ] ~20 LOC: `checkMethod` not wired into the getter — drops `Request#method`
      validation. 2 skips.
- [ ] ~80 LOC: needs Rack body parsing for `RequestParameters` /
      `RequestParamsParsing` / `RequestFormat` ParameterTypeError surface
      (13 skips combined). Bundle if Rack body parsing lands.
- [ ] ~10 LOC: TS `method` getter can't accept args like Rails'
      `request.method(:get)` mutation form. Low-priority API divergence; skip
      noted in test file.
- [ ] CustomParamEncoder + encoding validation surface — referenced by 4 skips
      in RequestParameters group.

**From #2428 (SystemTestCase + Driver + Server shell)**

- [ ] ~30 LOC: Browser class stubs (9 methods, 0% in api:compare). `:nodoc:` in Rails but tracked.
- [ ] `servedBy()` wiring into `startApplication()`.
- [ ] `urlHelpers()` returns undefined — needs routing infra.
- [ ] 3 missing `testing/integration.rb` methods — identify and bundle.

**From #2446 (ScreenshotHelper + SetupAndTeardown + PageDumpHelper)**

- All deviations are cosmetic/structural (buffer vs file-read for base64, Date.now vs seconds, platform dispatch vs Launchy). No action needed.

**From #2451 (\_mockSession, htmlDocument, documentRootElement)**

- [ ] HTML parsing in `htmlDocument` not implemented — throws for `text/html`. Blocked on rails-dom-testing port.

**From #2460 (T-AC3 url_for_test.rb remainder)**

- [ ] ~200-300 LOC: implement RouteSet-backed URL generation to unlock 15 pending tests (needs `with_routing` helper + named route helpers).
- Deviation: `relative_url_root` uses `script_name` directly instead of `RouteSet::Config.new("/subdir")`. Acceptable approximation.
- Deviation: `original_script_name` concatenation in `urlFor` directly instead of RouteSet URL helper layer. Works for direct callers but won't fire for generated route helpers.

**From #2467 (T-AD6 dispatch/response_test.rb)**

- [ ] ~20 LOC: `toRack()` should call `commitBang()` — Rails' `to_a` auto-commits. Unblocks "read body during action" test.
- [ ] ~5 LOC: `response.code` should return string (`"200"`) not number — Rails parity.
- [ ] ~10 LOC: `Response.create()` should merge `defaultHeaders` via `mergeDefaultHeaders`. Unblocks 2 skipped tests.
- [ ] ~15 LOC: implement `addHeader` (comma-joined append). Unblocks "add_header" test.
- [ ] ~large: `ResponseIntegrationTest` (10 tests) — needs minimal Rack integration harness.

**From #2470 (T-AD7 dispatch/ssl_test.rb)**

- [ ] ~5 LOC: unskip `:expires supports AS::Duration arguments` once `ActiveSupport::Duration` is ported.
- [ ] ~20 LOC: unskip 2 array-cookie tests once `set-cookie` header supports `string[]` (Rack 3).

**From #2474 (T-AC7 controller/base_test.rb)**

- [ ] ~10 LOC: wire `applyDefaultHeaders()` into `Metal#dispatch()` — function exists but is never called. Unblocks `test_response_has_default_headers`.
- [ ] ~unknown: port `ActionView::RecordIdentifier` (dom_id / dom_class).
- [ ] ~large: wire RouteSet to controller — unblocks 8 URL-options tests.

**From #2475 (T-AC6 controller/flash_test.rb)**

- [ ] ~30 LOC: add class-level `addFlashTypes` / `_flashTypes` static method to `Base`. Unblocks 2 flash-type tests.
- [ ] ~20 LOC: dynamic accessor generation for custom flash types on controller instances.
- [ ] ~large: HTTP integration stack — unblocks 4 integration-level flash tests.

**From #2486 (T-AD2 dispatch/mapper_test.rb)**

- [ ] ~30 LOC: wire `scope(via:, to:, format:, <custom keys>)` into `_scope` propagation — unblocks 3 tests.
- [ ] ~40 LOC: auto-set `/.+?/ms` requirements for glob `*name` segments — unblocks 5 tests.
- [ ] ~50 LOC: port `Mapper::Scope` and `Mapper::Mapping` internal APIs — unblocks 1 test.
- [ ] ~30 LOC: append `(.:format)` / `.:format` to route path for default and `format: true` routes — unblocks 3 tests.

**From #2487 (S8 non-inflecting resource names)**

- [ ] ~20 LOC: `on: :collection` / `on: :new` verb-method syntax (e.g. `get :search, on: :collection`). Only block form works today.
- [ ] `resources()` `as:` option for overriding collection route name prefix not supported.
- [ ] Invalid `only`/`except` action names silently ignored — Rails raises `ArgumentError`.

## Indefinite defers (do not port)

- **system_testing/** — now ported via Playwright. See `docs/system-testing-plan.md`.
- **http/rack_cache.rb** — Rack-specific.

---

## Known divergences from Rails (intentional, reference)

### ActionController

- **YAML hook (`Parameters.hookIntoYamlLoading`):** no-op; TS has no
  built-in YAML.
- **CSRF token stores (`SessionStore`, `CookieStore`):** take session/cookies
  hash directly (not `request`); `CookieStore` does plain read/write, no
  encryption or session ID validation.
- **Cache-control (`noStore`):** builds the header string directly instead
  of mutating a `response.cache_control` hash.
- **Etaggers (`etag`):** module-level array shared across controllers;
  scope per-class once `class_attribute` lands.
- **Renderers (`renderToBody`, `useRenderers`):** static methods, global
  `_renderers` Set.
- **Metal.action / Metal.build:** returns the bare endpoint without
  middleware wrapping; our `MiddlewareStack` doesn't override `build` to
  accept an action name.
- **`httpCacheForever`:** sets `Cache-Control` and always calls the block;
  no `stale?` conditional integration.
- **`Renderer.withDefaults`:** merges defaults but does not recompute the
  Rack env.
- **`permissionsPolicy` DSL:** beforeAction mutates a fresh directives
  object; until `Request#permissionsPolicy` + response middleware lands,
  modifications don't round-trip into the header.
- **`RateLimiting`:** no global `Rails.cache`; DSL falls back to a
  `cacheStore` static on the host controller and throws if neither is set.
- **`BrowserBlocker.versions`:** returns a shallow copy instead of the live
  array.
- **`TestCase.tests` / `determineDefaultControllerClass`:** uses
  `globalThis` for constant lookup; accepts String|Class only.
- **`render` guard:** `this.performed` instead of `responseBody`.
- **camelCase scriptNamer keys:** `Mapper._mountedScriptNamers` keyed on
  camelCase, matching the project-wide convention (api:compare expects
  Ruby snake_case method names to be ported as TS camelCase, including
  Rails payload keys).

### ActionDispatch

- **`Request#checkMethod`** throws a generic `Error`; Rails raises
  `ActionController::UnknownHttpMethod`.
- **`Request#rawHostWithPort` whitespace** mirrors Rails' quirk: header
  whitespace on a non-first forwarded entry is preserved.
- **`buildBacktrace`** returns raw stack lines instead of remapping
  template frames through `ActionView::PathRegistry`.
- **`isTemplateError`** uses string name-match instead of
  `instanceof ActionView::Template::Error` (avoids dependency inversion).
- **`ShowExceptions`** mutates env directly and restores in `finally`;
  Rails dups env (`env.dup`).
- **`Static`** rejects `..` escapes upfront; Rails collapses and lets the
  filesystem miss.
- **`Mapper#draw(string)`** throws — Ruby file-load form not supported.
- **`mount`** only accepts kwarg form `mount(SomeApp, { at: "/path" })`;
  Rails' hash form deferred to S9.
- **`asJson` keys `stdparam_states` by `re.source`** for symmetry with
  `regexp_states`; Rails uses Regexp objects.
- **Permissions-Policy spec** — legacy Feature-Policy syntax (Rails-shape).
- **`UploadedFile#open` / `toIo`** return `Buffer` (in-memory by design).
