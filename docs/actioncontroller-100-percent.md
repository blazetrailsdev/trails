# ActionController: Road to 100%

**67.6%** API (192 / 284 methods). 25 of 37 files at 100%.

## Known divergences from Rails

These are intentional differences from the Ruby/Rails implementation due to
language or ecosystem constraints. Each documents what Rails does, what we do
instead, and why.

### YAML hook (`Parameters.hookIntoYamlLoading`)

**Rails:** Registers a YAML safe-load handler so `Parameters` instances survive
`YAML.safe_load` round-trips.
**Us:** No-op. TypeScript has no built-in YAML deserialization that needs hooking.

### DidYouMean corrections (`ParameterMissing.corrections`, `UrlGenerationError.corrections`)

**Rails:** Uses `DidYouMean::SpellChecker` (Jaro-Winkler distance) integrated
into Ruby's error reporting.
**Us:** `ParameterMissing` uses Levenshtein distance ≤ 2.
`UrlGenerationError` uses case-insensitive substring matching. Both produce
useful suggestions but may differ from Rails in edge cases.

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

### `BrowserBlocker.versions` — returns a copy

**Rails:** `attr_reader :versions` returns the object directly (mutations affect the blocker).
**Us:** Returns a shallow copy via spread. Prevents accidental mutation of internal state
but diverges from Rails' mutable return.

## Remaining work

### Files at 0% (92 methods)

| File                               | Methods | Notes                                         |
| ---------------------------------- | ------- | --------------------------------------------- |
| `metal/http-authentication.ts`     | 33      | Standalone feature: Basic, Token, Digest auth |
| `metal/helpers.ts`                 | 4       | Requires ActionView integration               |
| `deprecator.ts`                    | 3       | Deprecator/addRenderer/removeRenderer         |
| `metal/content-security-policy.ts` | 2       | CSP before_action hooks                       |
| `metal/implicit-render.ts`         | 2       | Template existence checking                   |
| `api/api-rendering.ts`             | 1       | API renderToBody override                     |
| `base.ts`                          | 1       | withoutModules                                |
| `form-builder.ts`                  | 1       | defaultFormBuilder class method               |
| `metal/permissions-policy.ts`      | 1       | Permissions policy before_action              |
| `metal/rate-limiting.ts`           | 1       | Rate limiting before_action                   |

### Files partially done

| File            | Matched    | Missing | Notes                                             |
| --------------- | ---------- | ------- | ------------------------------------------------- |
| `test-case.ts`  | 9/37 (24%) | 28      | Test infrastructure: assigns, process, assertions |
| `metal/live.ts` | 3/18 (17%) | 15      | Streaming/SSE: needs architecture redesign        |

### Suggested next PRs

1. **HTTP Authentication** (33 methods) — standalone, no deep dependencies
2. **test-case.ts** (28 methods) — test infrastructure
3. **metal/live.ts** (15 methods) — streaming architecture redesign
4. **Small files** (11 methods) — deprecator, CSP, implicit render, etc.
