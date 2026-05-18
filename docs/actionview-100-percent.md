# actionview — Road to 100%

Current (2026-05-18): actionview 32/2530 methods (1.3%), files 6/109. Existing
package is a skeletal EJS-based renderer at flat layout — most of the work is
ahead of us.

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

### 0a. Extract `@blazetrails/trails-tsc`

- Move `packages/activerecord/src/tsc-wrapper/` → `packages/trails-tsc/src/`.
- Define a `TscPlugin` interface: `{ extensions: string[]; virtualize(path, source): { ts: string } }`.
- Refactor existing AR auto-import/remap logic into an `ar-models` plugin.
- AR depends on trails-tsc; existing `bin/trails-tsc.js` shim re-exports.
- ~300 LOC restructure + tests. **Blocker for everything else AV-typing.**

### 0b. SafeBuffer / OutputBuffer

- Port `ActiveSupport::SafeBuffer` into activesupport if absent (HTML-safe
  string subclass; `+`, `concat`, `<<` propagate safety).
- Port `ActionView::OutputBuffer` (wraps SafeBuffer with `<<`-collecting
  semantics for ERB-style templates).
- Pure leaf — no template / no renderer deps. ~150 LOC + tests.

### 0c. PathSet / TemplatePath / TemplateDetails

- `PathSet` — ordered collection of view paths with resolver protocol.
- `TemplatePath` — virtual/physical path parsing (`users/show` → name + prefix).
- `TemplateDetails` — `{locale, handler, formats, variants}` tuple used by
  LookupContext keying.
- All three are data-shape leaves with no rendering deps. ~200 LOC.

---

## Phase 0.5 — actionpack-unblocking stubs

actionpack already imports from actionview and has several followups blocked
on AV symbols that don't yet exist. These are all _interface-only_ — AP needs
a type to reference, not real behavior. Land as one bundled PR before
diving into the core port.

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

### 1a. `Template::Handlers` registry + `Raw` handler

- `Template::Handlers` — registry keyed by extension.
- `Template::Handlers::Raw` — trivial passthrough handler for `.txt`, `.html`,
  etc. Useful smoke test for the registry.
- Existing `TemplateHandlerRegistry` lives at `packages/actionview/src/template-handler.ts`
  — relocate to `template/handlers.ts` to match Rails layout.

### 1b. `Template` (base class)

- `Template` represents a single template file (path + handler + source).
- `Template#render(context, locals)` runs the compiled body.
- Existing `template.ts` is a type stub — replace with real port.
- Depends on 0b, 0c, 1a.

### 1c. `Resolver` / `FileSystemResolver` / `OptimizedFileSystemResolver`

- Resolver = source of templates given `TemplatePath` + `TemplateDetails`.
- Existing `template-resolver.ts` has `FileSystemResolver` + `InMemoryResolver`
  — keep, restructure under `resolver/` to match Rails.
- Add `OptimizedFileSystemResolver` (Rails' default; caches glob results).

### 1d. `LookupContext`

- `LookupContext` = "find me a template by name in this PathSet, given the
  current request's locale/format/variant."
- Existing `lookup-context.ts` is partial — flesh out the
  `formats`/`locale`/`variants` cascade and `find_all` semantics.

---

## Phase 2 — TSE compiler + trails-tsc plugin

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

## Phase 3 — Renderer

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

## Phase 4 — `Rendering` / `Layouts` / `Context` / `Base`

These mix into ActionController and are the integration surface.

- **Context** — module providing `output_buffer`, `view_flow`, `view_renderer`.
- **Rendering** — `render` / `render_to_string` / `render_to_body` /
  `_normalize_args` / `_normalize_options`. Mixes into AC.
- **Layouts** — layout lookup with `layout :foo` DSL, `_layout_for`,
  conditional layouts.
- **Base** — combines Context + Helpers + Rendering into a standalone view
  context (used by mailers, `render_to_string` outside a controller).

Land in this order. Each depends on Phase 3.

---

## Phase 5 — Helpers (tiered by independence)

19 helpers in Rails. Tier by what they depend on:

### T1 — Pure utility, no template/context needed

- `number_helper` (`number_to_currency`, `number_to_human`, etc.) — pure
  functions; ~300 LOC. **Leaf.**
- `text_helper` (`truncate`, `pluralize`, `word_wrap`, `simple_format`) —
  pure-ish; some need SafeBuffer. **Leaf after 0b.**
- `output_safety_helper` — `html_safe`, `raw`, `safe_join`. **Leaf after 0b.**
  (Partial exists.)
- `sanitize_helper` — depends on a sanitizer library (jsdom or sanitize-html);
  partial exists. **Leaf after picking sanitizer dep.**
- `date_helper` (date formatting only; date _select tags_ are T3) — leaf for
  the formatting half.
- `debug_helper` — `debug(obj)` pretty-prints to YAML-ish; trivial.

### T2 — Need OutputBuffer / context

- `tag_helper` — `tag`, `content_tag`, `tag.div(...)`. Partial exists.
  Foundation for all form/asset helpers. **Land first in T2.**
- `capture_helper` — `capture`, `content_for`, `provide`. Needs OutputBuffer
  swap-and-restore.
- `javascript_helper` — partial exists; small.
- `csp_helper` / `csrf_helper` — small, need Request access.
- `cache_helper` — needs `ActiveSupport::Cache` + Digestor (Phase 6).

### T3 — Need routing / models

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

- `Digestor` — recursive template digesting for cache keys; pure leaf.
- `DependencyTracker` — parses templates for `render` calls to build dep
  graph. Per-handler (ERB tracker, etc.). For us: TSE tracker only.
- `CacheExpiry` — file-system watcher for dev reload.

All three can land late; they're independent of rendering correctness.

---

## Phase 7 — TestCase + Trailtie

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

Current layout is flat (`src/template.ts`, `src/lookup-context.ts`,
`src/ejs-handler.ts`, `src/helpers/`). Rails layout is nested
(`template.rb` + `template/` dir, `renderer.rb` + `renderer/` dir, etc.).

Restructure as a `<base>` mechanical-rename PR before Phase 1c:

- `src/template.ts` stays; add `src/template/{handlers,error,resolver}.ts`.
- `src/template-handler.ts` → `src/template/handlers.ts`.
- `src/template-resolver.ts` → `src/template/resolver.ts` (+ split
  `FileSystemResolver` / `InMemoryResolver` into own files under `resolver/`).
- `src/renderer.ts` stays; add `src/renderer/{template,partial,streaming,object,collection}-renderer.ts`.
- `src/ejs-handler.ts` → delete after TSE handler lands (or keep behind a
  `legacy/` dir for migration).
- `src/helpers/` already correct; just add files as ported.

Note the mechanical rename in PR body per CLAUDE.md rule.

---

## Priority order (one-line summary)

0a trails-tsc extract → 0b SafeBuffer/OutputBuffer → 0c PathSet/TemplatePath
→ **0.5 AP-unblocking stubs** → restructure → 1a Handlers/Raw → 1b Template
→ 1c Resolver → 1d LookupContext
→ 2a TSE runtime compiler → 2b trails-tsc TSE plugin → 2c build CLI
→ 3a–c Renderer/Template/Partial → T1 helpers (parallel after 0b)
→ 4 Rendering/Layouts/Context/Base → T2 helpers → T3 helpers (as blockers clear)
→ 3d Streaming → 6 Digestor/DepTracker → 7 TestCase/Trailtie.

Phases 0–2 are the critical path. T1 helpers can fork off after 0b lands.
