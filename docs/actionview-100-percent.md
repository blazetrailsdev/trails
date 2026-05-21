# actionview — Road to 100%

As of 2026-05-21: Phase 0 foundations + Phase 1a/1b/1d + most of Phase 5 T1
have shipped. The skeletal EJS renderer is gone (#2008). Critical path
remaining: Phase 2 (TSE compiler), Phase 3 (Renderer), Phase 4 (Base /
Rendering / Layouts / Context). Per-phase status is annotated inline below.

Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts | awk '/actionview  —/,/^=/' | head -120
```

---

## Decisions (locked)

1. **Template extension is `.tse`** (Trails Server Embedded), where Rails uses
   `.erb`. Compiled output is `.tse.js` (+ `.tse.d.ts` for typing).
2. **Tag syntax mirrors ERB 1:1** — `<% %>`, `<%= %>`, `<%- -%>`, `<%# %>`.
   TSX generics inside expressions need parens (`<%= (foo<Bar>()) %>`) — same
   class of ambiguity Rails has with Ruby's `<<`.
3. **Locals declaration: hybrid.** Rails-style for names + defaults, optional
   TS block for real types when needed:
   ```tse
   <%# locals: (user:, count: 0) %>
   <%! types: { user: User; count?: number } !%>
   ```
   The names-line is required (drives runtime arity / arg binding); the
   `types:` block is optional but recommended (drives tsc).
4. **Build-time compilation only.** All `.tse` files compile to `.tse.js` +
   `.tse.d.ts` ahead of time. Runtime imports the compiled module; no
   in-process compiler. Dev-mode hot reload re-runs the build for changed
   files.
5. **trails-tsc is promoted to its own package.** AR and AV both register
   transformer plugins against it. AV owns the `.tse` compiler; trails-tsc
   only knows how to virtualize files via plugins.
6. **Build output lives in a `.trails/` mirror dir, gitignored.** For each
   `app/views/**/*.tse`, the compiler emits
   `.trails/views/**/*.tse.ts` (shim) + `.trails/views/**/*.tse.js`
   (runtime). tsc treats the shims as first-class TS, so debugging,
   go-to-definition, and incremental builds all work. The directory is
   regenerated on every build; `postinstall` runs `trails-tsc build` once
   for fresh-clone DX, `trails-tsc dev` watches in development.
7. **Dual render API: typed registry + explicit import.** Both converge on
   the same generated `.tse.ts` shim — one source of truth.
   - **Registry path** (the default, Rails-feel): generated manifest is a
     **mapped type** over template paths. `render("users/show", locals)`
     narrows `locals` against the shim's signature. Supports `render @user`
     partial inference, implicit-render-by-action, variant/locale fallback.
   - **Explicit-import path** (escape hatch for libraries / hard deps):
     `import Show from "@views/users/show.tse"; render(Show, locals)`.
     Same `render` function, overloaded to accept a `TemplateModule`.
   - Both routes give identical type accuracy. The choice is ergonomic per
     call site, not a typing tradeoff.

   ```ts
   // .trails/views-manifest.ts (generated):
   interface TemplateRegistry {
     "users/show": typeof import("./views/users/show.tse").default;
     "users/edit": typeof import("./views/users/edit.tse").default;
     // ...
   }

   // actionview render signatures:
   function render<K extends keyof TemplateRegistry>(
     name: K,
     locals: TemplateLocals<TemplateRegistry[K]>,
   ): SafeString;
   function render<T extends TemplateModule>(template: T, locals: TemplateLocals<T>): SafeString;
   ```

   Caveats acknowledged: registry has a build-order dependency (CI must run
   `trails-tsc build` before typecheck), generates a file-rename diff each
   time a template moves, and dynamic-name call sites (`render(actionName)`)
   fall back to a `string` overload with `unknown` locals. Tree-shaking
   requires lazy thunks in the manifest (`() => import(...)`) — design for
   that from day one to avoid a breaking change later.

---

## Phase 0 — Foundations (must land before anything else)

### 0a. Extract `@blazetrails/trails-tsc` ✅ Shipped (#1943)

- `packages/trails-tsc/` exists with `TscPlugin` interface and `ar-models`
  plugin extracted.

### 0b. SafeBuffer / OutputBuffer ✅ Shipped (#1941, closed to 100% in #2117)

- `ActiveSupport::SafeBuffer` at
  `packages/activesupport/src/core-ext/string/output-safety.ts`.
- `ActionView::OutputBuffer` + `RawOutputBuffer` + `StreamingBuffer` +
  `RawStreamingBuffer` at `packages/actionview/src/buffers.ts`.

### 0c. PathSet / TemplatePath / TemplateDetails ✅ Shipped (#1942)

- `path-set.ts`, `template-path.ts`, `template-details.ts` in place.

### 0d. Remove dead EJS renderer ✅ Shipped (#2008)

- Skeletal EJS handler removed ahead of Phase 2 TSE compiler work.

---

## Phase 0.5 — actionpack-unblocking stubs ✅ Shipped (#1939)

All stub symbols below are exported from `packages/actionview/src/index.ts`
(`Template`, `PathRegistry`, `Digestor`, `Base`, `Rendering`/`Layouts`/`ViewPaths`
interfaces in `rendering.ts`, `FormBuilder` in `helpers/form-builder.ts`,
`DetailsKey` from `lookup-context.ts`, `MissingTemplate`). Real impls per
phase table below; stubs are tagged `@internal stub - real impl in Phase X`.

| Symbol                                | Shape                                                                                                                                                              | AP unblocks                                                                   | Real impl phase         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------- |
| `Template::Error`                     | Error subclass wrapping `{original, template, sourceExtract}`                                                                                                      | `exception-wrapper.ts:35` unwrap dispatch (#1834)                             | Phase 1b                |
| `PathRegistry`                        | static `all_resolvers()` returning `Resolver[]`; weak-ref under the hood                                                                                           | `exception_wrapper.rb:257` annotated-source path                              | Phase 1c                |
| `Digestor`                            | static `digest({name, format, finder}) → string` — initially a stable hash of resolved template source, no dep walk                                                | `etag_with_template_digest` wiring                                            | Phase 6 (real dep walk) |
| `Base` (type-only class with statics) | `static empty(): Base`, `static streaming_completion_on_exception: string`, `static default_formats: Symbol[]` (settable)                                          | `debug-view.ts` extends (#1859), `metal/live`, `metal/helpers`, on_load hooks | Phase 4 (real Base)     |
| `Rendering` / `Layouts` / `ViewPaths` | Module-as-host interfaces with method signatures only (`render`, `render_to_string`, `render_to_body`, `_normalize_*`, `lookup_context`, `view_paths`, layout DSL) | AC `base.rb` mixin chain compiles                                             | Phase 4                 |
| `Helpers::FormBuilder`                | Sentinel class with a few protected fields (`object_name`, `object`, `template`, `options`)                                                                        | `action-controller/form_builder.ts` default-builder setter                    | Phase 5 T3              |
| `LookupContext::DetailsKey.clear()`   | Static no-op for now                                                                                                                                               | `action_dispatch.on_load(:action_view)` trailtie hook (#1842)                 | Phase 1d                |
| `MissingTemplate`                     | ✅ already exported; verify shape matches Rails (`paths`, `prefixes`, `partial`, `template_keys`)                                                                  | `exception_wrapper.rb:31` STATUS_MAP                                          | Phase 1d (refine)       |

**Sizing:** ~250 LOC total (one PR). Most entries are 10–30 LOC each — class
shells + statics + JSDoc explaining they're stubs. Tag each method/static
with `@internal stub - real impl in Phase X` so the lint rule treats them as
Rails-private.

**Why this matters for ordering:** without Phase 0.5, every actionpack
followup that mentions ActionView (~6 from the AP roadmap's blocked list)
stays blocked on a multi-quarter AV port. With it, those AP items move from
"blocked on ActionView" to "blocked on Phase 4" — much narrower wait.

---

## Phase 1 — Template core

### 1a. `Template::Handlers` registry + `Raw` handler ✅ Shipped (#1962, closed to 100% in #2117)

- Registry at `src/template/handlers.ts`, `Raw` handler at
  `src/template/handlers/raw.ts`.

### 1b. `Template` (base class) ✅ Shipped (#1973)

- Real port at `src/template.ts` (~200 LOC).

### 1c. `Resolver` / `FileSystemResolver` / `OptimizedFileSystemResolver` ⚠️ Partial

- `FileSystemResolver` + `InMemoryResolver` exist at top-level
  `src/template-resolver.ts`.
- **Still pending:** restructure under `src/resolver/` to match Rails;
  add `OptimizedFileSystemResolver` (Rails default; caches glob results).
  `PathRegistry` is also still a Phase 0.5 stub (`allResolvers()` returns
  `[]`) — fold real impl in here.

### 1d. `LookupContext` ✅ Shipped (#1994)

- Full `formats`/`locale`/`variants` cascade + `DetailsKey` at
  `src/lookup-context.ts` (~680 LOC).

---

## Phase 2 — TSE compiler + trails-tsc plugin ⏳ Not started

(Only `src/template/tse-util.test.ts` placeholder exists. EJS handler was
removed in #2008 to clear the path.) See `docs/tse-plan.md` for the
detailed TSE handler design — Phase 0b is unblocked, so 2a is next.

### 2a. `Template::Handlers::TSE` (runtime)

- Parse `.tse` source → AST of static chunks + `<% %>` tags.
- Emit a JS function body: collect output via `OutputBuffer`, `<%= %>` calls
  `escape` unless value is `SafeString`, `<% %>` is a raw statement.
- Locals binding from the `<%# locals: ... %>` line.
- Output: ES module exporting `default (context, locals) => SafeString`.

### 2b. trails-tsc plugin: `.tse` virtualization

- Register `.tse` as a tsc-visible extension.
- For each `.tse`, lift the `<%! types: {...} !%>` block (or `unknown` for
  each local if absent).
- Emit a `.tse.d.ts` shim: `export default function(context: RenderContext, locals: <types>): SafeString;`
- Emit a `.tse.ts` body that compiles the template expressions inline so tsc
  type-checks them against `locals`. (The runtime build output is `.tse.js`
  via 2a — same compiler, different emit target.)

### 2c. Build CLI

- `trails-tsc build` walks `app/views/**/*.tse`, runs 2a/2b, writes
  `.trails/views/**/*.tse.ts` (typed shim) + `.trails/views/**/*.tse.js`
  (runtime module) into the gitignored mirror dir.
- Emits `.trails/views-manifest.ts` — the mapped-type registry from
  Decision 7. Manifest entries are lazy thunks
  (`"users/show": () => import("./views/users/show.tse.js")`) so bundlers
  can code-split.
- Watch mode (`trails-tsc dev`) re-runs per changed file + updates manifest.
- `postinstall` hook in app templates runs `trails-tsc build` once so a
  fresh clone has a working IDE before the dev server starts.

---

## Phase 3 — Renderer ⏳ Not started

(`src/renderer.ts` is still a ~110 LOC stub; no `renderer/` subdir yet.)

### 3a. `Renderer`

- Existing `renderer.ts` is a stub — replace.
- Top-level orchestrator: `render(context, options)` dispatches to
  `TemplateRenderer` or `PartialRenderer`.

### 3b. `TemplateRenderer`

- Resolves a single template via LookupContext, renders with locals + layout.

### 3c. `PartialRenderer`

- `render partial: "user", locals: {...}` — single + collection forms.
- Collection rendering with `as:`, `spacer_template:`, counter vars.
- Object/model-form (`render @users`) → partial path inference.

### 3d. `StreamingRenderer` + `Flows`

- Fiber-based in Rails; in TS use async generators yielding chunks.
- Defer until base renderer ships.

---

## Phase 4 — `Rendering` / `Layouts` / `Context` / `Base` ⏳ Not started

Stubs from Phase 0.5 exist (`base.ts`, `rendering.ts` interfaces) but
hold no real behavior. These mix into ActionController and are the
integration surface.

- **Context** — module providing `output_buffer`, `view_flow`, `view_renderer`.
- **Rendering** — `render` / `render_to_string` / `render_to_body` /
  `_normalize_args` / `_normalize_options`. Mixes into AC. (`rendering.ts`
  currently holds only the interface stubs from Phase 0.5.)
- **Layouts** — layout lookup with `layout :foo` DSL, `_layout_for`,
  conditional layouts.
- **Base** — combines Context + Helpers + Rendering into a standalone view
  context (used by mailers, `render_to_string` outside a controller).
  (`base.ts` is a 23-LOC Phase 0.5 stub.)

Land in this order. Each depends on Phase 3.

---

## Phase 5 — Helpers (tiered by independence)

19 helpers in Rails. Tier by what they depend on:

### T1 — Pure utility, no template/context needed

- `number_helper` ✅ Shipped (#1954).
- `text_helper` ✅ Shipped (#1965, #2005, #2006 — truncate, pluralize,
  word_wrap, simple_format, highlight, excerpt, cycle, concat/safeConcat).
- `output_safety_helper` ✅ Shipped (closed to 100% in #2117).
- `sanitize_helper` ✅ Shipped (closed to 100% in #2117).
- `date_helper` (formatting half) ✅ Shipped (#1984 —
  distanceOfTimeInWords, timeAgoInWords).
- `debug_helper` ✅ Shipped (#1955).

### T2 — Need OutputBuffer / context

- `tag_helper` ✅ Shipped (#1990 — full TagBuilder API surface).
- `capture_helper` ⏳ pending. `capture`, `content_for`, `provide`.
  Needs OutputBuffer swap-and-restore (now unblocked by Phase 0b).
- `javascript_helper` ⏳ pending; partial exists.
- `csp_helper` / `csrf_helper` ⏳ pending; small, need Request access.
- `cache_helper` ⏳ pending; needs `ActiveSupport::Cache` + Digestor (Phase 6).

### T3 — Need routing / models ⏳ Not started

- `url_helper` — `link_to`, `button_to`, `mail_to`. Needs RoutesProxy +
  url_for. **Cross-package blocker: actionpack url_for.**
- `form_tag_helper` — depends on T2 tag_helper.
- `form_helper` + `tags/` (the form-builder field classes) — depends on
  url_helper, form_tag_helper, model_naming. Big (~30 files).
- `form_options_helper` — `select`, `options_for_select`, etc.
- `asset_tag_helper` + `asset_url_helper` — depends on Sprockets-equivalent;
  for trails, likely Vite manifest reader. **Cross-package blocker.**
- `controller_helper` — trivial, but needs AC.
- `record_identifier` — `dom_id` / `dom_class`; needs ActiveModel naming
  (already ported).
- `routing_url_for` — bridge to actionpack url_for.
- `translation_helper` — needs i18n (`I18n.translate` exists in activesupport).
- `active_model_helper` — `error_messages_for` etc.
- `atom_feed_helper` — defer (low usage).

---

## Phase 6 — Digestor / DependencyTracker / CacheExpiry

- `Digestor` — Phase 0.5 stub exists at `src/digestor.ts` (stable hash of
  resolved source, no dep walk). Real recursive digesting still pending.
- `DependencyTracker` ⏳ pending. Parses templates for `render` calls to
  build dep graph. Per-handler — for us, TSE tracker only.
- `CacheExpiry` ⏳ pending. File-system watcher for dev reload.

All three can land late; they're independent of rendering correctness.

---

## Phase 7 — TestCase + Trailtie

`Trailtie` exists at `src/trailtie.ts` and has been wired per-framework
(#2165). `TestCase` ⏳ pending — depends on Phase 4.

- `TestCase` — view-context test harness (mixes Rendering + Helpers, fakes
  LookupContext). Depends on Phase 4.
- `Trailtie` — engine wiring (initializers for helpers, view paths,
  deprecator). Rails calls this `Railtie`; trails uses `Trailtie` for the
  framework-bootstrap class. File is `trailtie.ts` (not `railtie.ts`); the
  Ruby source mirror is still `railtie.rb`, so add the rename to
  `FILE_OVERRIDES` in `scripts/api-compare/conventions.ts` (same pattern as
  the AR/AP trailties). Class name in code is `Trailtie`; the
  `ActionView::Railtie` Rails identifier doesn't appear in TS.

---

## Cross-package blockers (must land elsewhere)

| Need                                 | Blocks                                      | Where                    |
| ------------------------------------ | ------------------------------------------- | ------------------------ |
| actionpack `url_for` fully wired     | `url_helper`, all form helpers              | actionpack roadmap       |
| actionpack RoutesProxy 100%          | `url_helper`                                | actionpack roadmap       |
| Vite-manifest reader (or equivalent) | `asset_tag_helper`                          | new package              |
| `ActiveSupport::Cache` real backend  | `cache_helper`                              | activesupport            |
| jsdom or sanitize-html selection     | `sanitize_helper` full                      | dep decision             |
| ActionController port                | `Rendering` mix-in test surface, `TestCase` | actioncontroller roadmap |

---

## Restructuring debt in existing package

Partially done. Current state:

- ✅ `src/template/` subdir exists with `handlers.ts`, `handlers/raw.ts`,
  `error.ts`, and helper-test mirrors.
- ✅ EJS handler deleted (#2008).
- ⏳ `src/template-resolver.ts` still at top level — move to
  `src/resolver/` and split `FileSystemResolver` / `InMemoryResolver`
  per Rails layout. Bundle with Phase 1c work.
- ⏳ `src/renderer.ts` stays; add
  `src/renderer/{template,partial,streaming,object,collection}-renderer.ts`
  as Phase 3 lands.
- ✅ `src/helpers/` already correct; new helpers slot in alongside.

Note any mechanical rename in PR body per CLAUDE.md rule.

---

## Priority order (one-line summary)

~~0a trails-tsc extract~~ ✅ → ~~0b SafeBuffer/OutputBuffer~~ ✅
→ ~~0c PathSet/TemplatePath~~ ✅ → ~~0.5 AP-unblocking stubs~~ ✅
→ ~~1a Handlers/Raw~~ ✅ → ~~1b Template~~ ✅
→ **1c Resolver finish (OptimizedFileSystemResolver + restructure + PathRegistry real impl)**
→ ~~1d LookupContext~~ ✅
→ **2a TSE runtime compiler → 2b trails-tsc TSE plugin → 2c build CLI** (critical path)
→ **3a–c Renderer/Template/Partial**
→ T1 helpers (mostly ✅; date-formatting + remaining bits)
→ **4 Rendering/Layouts/Context/Base**
→ T2 helpers (tag_helper ✅; capture/js/csp/csrf/cache pending)
→ T3 helpers (as blockers clear) → 3d Streaming → 6 Digestor/DepTracker
→ 7 TestCase (Trailtie ✅).

Critical path remaining: **Phase 1c finish → Phase 2 → Phase 3 → Phase 4.**
