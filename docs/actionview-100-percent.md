# actionview — Road to 100%

As of 2026-05-27: Phase 0 foundations + Phase 1 (including 1c PathRegistry) +
Phase 2 (TSE compiler + trails-tsc) + most of Phase 5 T1 + Phase 3a/3b
(Renderer + TemplateRenderer) have shipped. Critical path remaining:
Phase 3c (PartialRenderer), Phase 4 (Base / Rendering / Layouts / Context).
Per-phase status is annotated inline below.

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

Phases 0–2 core work (Foundations, AP-unblocking stubs, Template core, TSE
compiler) have shipped. Remaining tails:

**Phase 1c:** restructure `src/template-resolver.ts` under
`src/resolver/` to match Rails; add `OptimizedFileSystemResolver` (caches
glob results).

**Phase 2c:** watch mode (`trails-tsc-views dev`), manifest
generation, `postinstall` hook in app templates, CLI unification with
the AR `trails-tsc` bin.

---

## Phase 3 — Renderer ⏳ In progress

3a (Renderer, #2464) and 3b (TemplateRenderer, #2473) shipped. Known gaps
from 3b:

- `InlineTemplate.format` falls back to `lookupContext.formats.first` — should flow through `handler.default_format` once handlers land.
- Layout yield not wired — `ViewContext._layoutFor` is stubbed. Phase 4 gap.
- `MissingTemplate` passes empty `searchedPaths`/`candidatePaths` — `LookupContext.resolverNames()` is private.

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

### T1 — Pure utility ✅ All shipped

`number_helper`, `text_helper`, `output_safety_helper`, `sanitize_helper`,
`date_helper` (formatting half), `debug_helper`.

### T2 — Need OutputBuffer / context

- `tag_helper` ✅ shipped.
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

- ⏳ `src/template-resolver.ts` still at top level — move to
  `src/resolver/` and split `FileSystemResolver` / `InMemoryResolver`
  per Rails layout. Bundle with Phase 1c work.
- ⏳ Add `src/renderer/{partial,streaming,object,collection}-renderer.ts`
  as Phase 3c/3d land (`template-renderer.ts` shipped in #2473).

---

## Priority order (one-line summary)

**1c Resolver finish** → **3c PartialRenderer** → **4 Rendering/Layouts/Context/Base**
→ T2 helpers (capture/js/csp/csrf/cache) → T3 helpers (as blockers clear)
→ 3d Streaming → 6 Digestor/DepTracker → 7 TestCase.

Remaining tails: 1c Resolver restructure, 2c watch/manifest CLI.
