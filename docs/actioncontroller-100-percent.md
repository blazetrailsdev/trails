# ActionController: Road to 100%

Current (2026-05-20):
`pnpm tsx scripts/api-compare/compare.ts --package actioncontroller --privates`
→ **429/581 methods (73.8%)**; **34 of 43 files at 100%**.

> `pnpm api:compare` is a chained `&&` script and won't forward
> `--package` to `compare.ts`; invoke `compare.ts` directly for the
> scoped totals.

## Known divergences from Rails

These are intentional differences from the Ruby/Rails implementation due to
language or ecosystem constraints. Each documents what Rails does, what we do
instead, and why.

### YAML hook (`Parameters.hookIntoYamlLoading`)

**Rails:** Registers a YAML safe-load handler so `Parameters` instances survive
`YAML.safe_load` round-trips.
**Us:** No-op. TypeScript has no built-in YAML deserialization that needs hooking.

### DidYouMean corrections — closed (no longer a divergence)

Both `ParameterMissing#corrections` (#2097) and `UrlGenerationError#corrections`
(#2100) now delegate to `@blazetrails/did-you-mean`'s `SpellChecker`, matching
Rails. Remaining: `Template::Error#corrections` in actionview uses raw
`Jaro.distance` (already exported from the barrel) — ~80 LOC follow-up.

### CSRF token stores (`SessionStore`, `CookieStore`)

**Rails:** `fetch`/`store`/`reset` take a `request` object and access
`request.session` or `request.cookie_jar.encrypted` internally.
`CookieStore` JSON-serializes the token with session ID validation and
sets `httponly`/`same_site: :lax` options.
**Us:** Our stores take the session or cookies hash directly (matching the
pre-existing store design). `CookieStore` does a plain value read/write
without encryption or session ID validation. When a real cookie jar with
encryption is wired up, these stores should be updated to match Rails.

### Cache-control (`noStore`)

**Rails:** Calls `response.cache_control.replace(no_store: true)` which
mutates a hash object on the response that's serialized to headers later.
**Us:** Builds the `Cache-Control` header string directly and sets it.
Functionally equivalent for the `no_store` case, but doesn't integrate with
a response-level `cache_control` hash (which we don't have yet).

### Etaggers (`etag`)

**Rails:** `etag` is a class method that pushes to `self.etaggers`, a
`class_attribute` with per-class inheritance and automatic duplication.
**Us:** Module-level array shared across all controllers. This works for
single-controller apps but will leak etaggers between controller classes.
Should be scoped per-class when `class_attribute` is available.

### Renderers (`Renderers.renderToBody`, `Renderers.useRenderers`)

**Rails:** `render_to_body` is an instance method on the controller that
dynamically dispatches to `_render_with_renderer_#{name}` methods. `use_renderers`
sets a per-class `_renderers` class attribute.
**Us:** Both are static methods on the `Renderers` class, and `_renderers` is a
global `Set`. When the controller mixin architecture is wired up, these should
become instance/class methods and use per-class state.

### Middleware integration (`Metal.action`, `Metal.build`)

**Rails:** `Metal.action` wraps the endpoint in `middleware_stack.build(name, app)`
which builds the middleware chain filtered by action name (only/except options).
`ActionController::MiddlewareStack` overrides `build` to accept an action name.
**Us:** `Metal.action` returns the bare endpoint without middleware wrapping.
Our `MiddlewareStack` inherits from `ActionDispatch::MiddlewareStack` but doesn't
override `build` to accept an action name. Middleware is registered (`use`/`middleware`)
but not applied during dispatch yet.

### `httpCacheForever` — no conditional request support

**Rails:** Calls `expires_in 100.years` then `yield if stale?(etag:, last_modified:)`,
so the block only executes when the response is stale (enabling 304 responses).
**Us:** Sets the `Cache-Control` header and always calls the block. The `stale?`
conditional is not integrated because it requires the full freshness check pipeline
wired into the controller response cycle.

### `Renderer.withDefaults` — no env recomputation

**Rails:** Creates a new Renderer with `(controller, @env, @defaults.merge(defaults))`,
recomputing the Rack env from the merged defaults.
**Us:** Creates a new Renderer with merged defaults but does not recompute the env
(our Renderer doesn't separate env from defaults).

### `permissionsPolicy` — directives held in the callback, not yet on Request

**Rails:** The `permissions_policy` class DSL registers a `before_action` that
clones `current_request.permissions_policy`, yields it to the block for
mutation, and assigns the result back via `request.permissions_policy = policy`
— middleware later materializes that into the `Permissions-Policy` response
header.
**Us:** The DSL registers a `before_action` whose callback closure captures the
provided block and runs it against a fresh directives object. Until
`Request#permissionsPolicy` and the corresponding response middleware are wired
up, the modified directives don't round-trip into the response header. The
class-DSL surface and parity-test coverage are complete; the response-header
wiring is the remaining work.

### `RateLimiting` — cache backend is divergent

**Rails:** `rate_limit` defaults `store:` to `cache_store`, which Rails wires from
`config.action_controller.cache_store` / `config.cache_store` — an
`ActiveSupport::Cache::Store` instance whose `increment(key, amount, expires_in:)`
returns the new counter atomically (Redis/Memcached in production).
**Us:** No global `Rails.cache` equivalent yet. The class DSL falls back to a
`cacheStore` static on the host controller class if not given `store:`, and
throws if neither is set. A `MemoryRateLimitStore` ships in this package for
tests and single-process apps; production deployments must supply a
`RateLimitStore` whose `increment(key, amount, { expiresIn })` (1) accepts
`expiresIn` in **seconds** (Rails parity, not the activesupport cache
`CacheOptions.expiresIn` which is milliseconds) and (2) initializes a
missing counter to `amount` (Redis/Memcached behavior — the in-memory
activesupport cache returns `nil` for missing keys and is not a suitable
backend on its own). The
DSL surface, key composition (`rate-limit:controllerPath:name:identity`),
`429` fallback, and `rate_limit.action_controller` instrumentation are all
parity-faithful — only the cache backend resolution differs.

### `BrowserBlocker.versions` — returns a copy

**Rails:** `attr_reader :versions` returns the object directly (mutations affect the blocker).
**Us:** Returns a shallow copy via spread. Prevents accidental mutation of internal state
but diverges from Rails' mutable return.

## Remaining backlog

Each row is one PR. Pick a row, follow the steps below verbatim, open a draft PR.

### How to ship one PR

```bash
# 1. Branch from latest origin/main in a fresh worktree
git fetch origin main
git worktree add .claude/worktrees/<slug> -b <branch> origin/main
cd .claude/worktrees/<slug>
pnpm install
pnpm vendor:fetch --source rails   # populate vendor/rails (or use scripts/start-worktree.sh which symlinks from main)

# 2. Read Rails source first (the entire file, not just the missing methods)
less vendor/rails/actionpack/lib/<rails-file>.rb

# 3. Implement in the TS file the api:compare row points to.
#    Do NOT relocate methods to a helper file or the row stops counting.
#    Use cwd-relative paths (`packages/...`), never absolute paths into the user's repo.
$EDITOR packages/actionpack/src/action-controller/<ts-file>.ts

# 4. Add tests next to the source as <ts-file>.test.ts
$EDITOR packages/actionpack/src/action-controller/<ts-file>.test.ts
pnpm test packages/actionpack/src/action-controller/<ts-file>.test.ts

# 5. Refresh and confirm api:compare row hits 100%
pnpm api:compare --package actioncontroller --privates | grep <rails-file>

# 6. Build clean, prettier clean
pnpm build
pnpm exec prettier --write packages/actionpack/src/action-controller/<ts-file>.ts \
                            packages/actionpack/src/action-controller/<ts-file>.test.ts

# 7. Commit (NO --no-verify, NO Co-Authored-By trailer) + push
git add -A
git commit -m "feat(actioncontroller): <commit subject>"
git push -u origin <branch>

# 8. Open as draft. PR body MUST quote the Rails source line(s) being mirrored
#    and reference the plan slot (e.g. "Implements P3").
gh pr create --draft --title "feat(actioncontroller): <title>" --body "$(cat <<EOF
...
EOF
)"
```

Constraints (CLAUDE.md):

- camelCase only — no snake_case identifiers, even mirroring Rails payload keys.
- PR ≤ 300 LOC additions+deletions (excl. lockfiles, snapshots).
- For methods that mix in to controllers, use the `this`-typed function pattern
  documented in CLAUDE.md (`export function foo(this: HostInterface, ...)` then
  `static foo = foo` in `base.ts`). Do NOT inline the body in `base.ts`.
- For Rails behaviors that can't be mirrored exactly (missing infra, etc.),
  add a "Known divergences" entry above describing what Rails does, what we
  do, and why.
- `instance_exec(opts, &block)` → `block.call(this, opts)` with `this: unknown`
  threaded through the function signature.
- Ruby `compact` → `.filter((e) => e !== null && e !== undefined)`, NOT
  `.filter(Boolean)` (which also drops `0`, `""`, `false`).
- Ruby `Hash#key?` → `Object.hasOwn(obj, "K")`, NOT `obj["K"] != null` (Ruby
  returns true for nil values; `"K" in obj` walks the prototype chain).

Sequencing rules:

- One agent per source file at a time; methods in the same file collide.
- Wave 4 (core) is **serial** — each PR depends on the prior one shipping.

### Wave 0 — single-file peripherals — all closed

- Slot P3 closed (form_builder.rb at 100%)
- Slot P4 closed (metal/data_streaming.rb at 100%)
- Slot P7 closed (metal/renderers.rb at 100%)
- Slot P9 closed (#2099/#2114 — deprecator.rb at 100%)

### Wave 1 — small bundle peripherals

- Slot P10 closed (metal/content_security_policy.rb at 100%)
- **P11 still open** — `metal/etag_with_template_digest.rb` 5/12 (42%). 7 missing methods include `determineTemplateEtag`, `pickTemplateForEtag`, `lookupAndDigestTemplate` + 4 privates. Depends on actionview digestor.
- **P12 still open** — `metal/helpers.rb` 0/6 (0%). Requires actionview helper integration; methods: `helpersPath`, `helpers`, `helperAttr`, `modulesForHelpers`, `allApplicationHelpers` + 1 private.

### Wave 2 — medium peripherals — all closed

- Slot P14 closed (metal/redirecting.rb at 100%)
- Slot P15 closed (metal/params_wrapper.rb at 100%)

### Wave 3 — split-file PRs

#### `metal/http_authentication.rb` — `metal/http-authentication.ts` — 13/33 (39%)

20 missing across Basic/Digest/Token. Slots P17a/P17b/P17c still **open**; bundle by module per the original split.

#### `metal/live.rb` — at 100%

- Slot P18a closed (Live::Buffer)
- Slot P18b closed (Live mixin)

#### `metal/request_forgery_protection.rb` — at 100%

- Slot P20a closed (verification predicates)
- Slot P20b closed (token generation/encoding)
- Slot P20c closed (token validation + strategy plumbing)

#### `test_case.rb` — `test-case.ts` — 23/49 (47%)

- Slot P21a closed (TestSession family — `isEnabled`, `idWas`, `loadBang`, `keys`, `values`, `destroy`, `dig`, `fetch`, `isExists`, `isSuccess`, `isMissing`, `isError`).
- **P21b/P21c still open**, split per #2094 post-merge:
  - **`<base>b`** (~250 LOC) — TestRequest helpers: `queryString=`, `contentType=`, `assignParameters`, `shouldMultipart`, `paramsParsers`, `newSession`, `create`, `defaultEnv` + TestResponse status predicates (`isSuccess`, `isMissing`, `isError`).
  - **`<base>c`** (~250 LOC) — `process`, `setupRequest`, `buildResponse`, `wrapExecution`, `processControllerResponse`, `setupControllerRequestAndResponse`, `scrubEnvBang`, `documentRootElement`, `checkRequiredIvars`, `assertTemplate`, `executorAroundEachRequest`, `generatedPath`, `queryParameterNames`.

### Wave 4 — core — all closed

- Slot P22 closed (metal/instrumentation.rb at 100%)
- Slot P23 closed (api/api_rendering.rb at 100% via #2094/#2098)
- Slot P24 closed (metal/implicit_render.rb at 100% via #2098)
- Slot P26 closed (#2121 — `_protectedIvars`, `withoutModules`, `MODULES`)

### Fresh sized followups (post-#2067 findings)

- **base.rb still 38%** — 64 remaining misses are in mixin/included-from files (`redirecting.rb`, `etag_with_*.rb`, `helpers.rb`, `request_forgery_protection.rb`, `implicit_render.rb`, `instrumentation.rb`, `params_wrapper.rb` privates). Most are upstream-blocked on rendering / dispatcher pipeline; tracked under their separate P-slots.
- **metal/etag_with_flash.rb** 5/9 (56%) — ~5 LOC + decision: switch to `toHash()` vs `toSessionValue()` for ETag inputs (verify Rails' own ETagger usage first; current TS may already match Rails).
- **metal/flash.rb** 2/3 (67%) — close out remaining mixin export.
- **metal/strong_parameters.rb** 65/89 (73%) — ~250 LOC PR ready in `actioncontroller-leaves-b` (closed at user request for CI capacity; reopen when capacity permits). Captures +24 methods.
- **metal/implicit-render** (#2098) — ~30 LOC: wire real `templateExists`/`anyTemplates` on host once ActionView lookup arrives (currently returns 204 unless host stubs them).
- **metal/instrumentation.haltedCallbackHook** (#2098) — ~50 LOC: wire from AS::Callbacks `_runCallbacks` halt path (currently takes a Notifier argument but the chain doesn't call it yet).
- **metal.buildMiddleware** (#2098) — ~10 LOC: promote inline `valid` augmentation onto the `Middleware` class.
- **Two DoubleRenderError classes** (#2094) — consolidate abstract-controller vs action-controller versions (both extend `AbstractControllerError`; `instanceof` against parent works, identity-equality between layers doesn't).
- **DidYouMean consumer left** — Template::Error#corrections (actionview) calls Rails' raw `DidYouMean::Jaro.distance`; maps to the existing `Jaro.distance` export from `@blazetrails/did-you-mean` (no new barrel symbol needed). ~80 LOC.

### Tracking

When a PR merges: strike through the row and append `#NNNN ✅`. Update the
remaining count by re-running:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts --package actioncontroller --privates | tail -1
```
