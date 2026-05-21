# TSE — Trails Server Embedded templates

Dedicated implementation plan for `.tse`, the trails analogue of Rails `.erb`.
This is a deep-dive companion to the TSE sections of
[actionview-100-percent.md](actionview-100-percent.md) (Phase 2a–2c). Where
that doc places TSE in the broader actionview port, this one focuses on:

1. How Rails ERB actually works (so we have something concrete to mirror).
2. How we implement TSE in trails (handler + compiler + trails-tsc plugin).
3. The 1-for-1 API mapping — every Rails-facing surface and its TSE twin.

The point of fidelity is to avoid a "looks like ERB, isn't quite" trap:
template handler quirks (trim modes, magic comments, source maps, recompile
keys) are exactly where userland code reaches in. If we don't mirror them
the second a feature is needed it becomes a one-off hack.

---

## 1. How Rails ERB works

Rails' ERB pipeline is three layers, in order of execution:

### 1.1 `ActionView::Template::Handlers::ERB`

Source: `actionview/lib/action_view/template/handlers/erb.rb` +
`.../erb/erubi.rb`.

Responsibilities:

- Registered against the `.erb` extension by `Template::Handlers.register_template_handler`.
- `#call(template, source) → ruby_code_string` — returns a Ruby expression
  whose evaluation, in a binding with `_buf`, produces the rendered output.
- Delegates compilation to a subclass of `Erubi::Engine`
  (`ActionView::Template::Handlers::ERB::Erubi`).
- Reads "magic comments" out of the source before compilation:
  - `<%# locals: (foo:, bar: "x") %>` — strict locals (Rails 7.1+). Causes
    the compiled method to take keyword args and raise on unknown locals.
  - `<%# frozen_string_literal: true %>` — Ruby magic comment, passed through.
- Recompile key: `[handler.class, source]` — Template caches compiled procs
  keyed by file mtime + this tuple.

### 1.2 `Erubi::Engine` (the compiler)

Source: gem `erubi` (vendored conceptually, not in Rails repo).

- Lexer/parser walks the source emitting events for:
  - **text chunks** (everything outside `<% %>`)
  - `<% code %>` — ruby statement, no output
  - `<%= expr %>` — ruby expression, output result
  - `<%== expr %>` — output without escaping (raw)
  - `<%# comment %>` — comment, dropped
  - `<%% %>` / `%%>` — literal `<% %>` / `%>`
- **Trim modes** decide how surrounding whitespace/newlines are eaten:
  - `<%- code -%>` — strip leading + trailing whitespace on the line.
  - `<%= expr -%>` — strip trailing newline only.
  - `-` is the only mode actionview enables.
- Emits a Ruby string of the form:
  ```ruby
  _buf = ActionView::OutputBuffer.new
  _buf.safe_append = "<h1>"
  _buf.append = ( @user.name )         # escapes via to_s + html_safe check
  _buf.safe_append = "</h1>\n"
  _buf
  ```
- `_buf.append =` calls SafeBuffer's `<<` which html-escapes unless the
  value is already `html_safe?`.
- Source maps: each emitted line carries a comment with the original line
  number; backtraces hit the `.erb` file, not the generated Ruby.

### 1.3 `ActionView::Template#compile!`

- Wraps the Erubi-emitted Ruby in a method definition on a transient
  module (`ActionView::CompiledTemplates`), one method per template +
  variant + locale + format combination.
- Method signature: `_app_views_users_show_html_erb__1234_5678(local_assigns, output_buffer)`
  (or, with strict locals, expanded keyword args).
- The method is invoked with `self` set to the **view context** (a
  `ActionView::Base` instance) so all helpers (`link_to`, `form_with`, etc.)
  resolve as plain method calls.

### 1.4 Public surface userland touches

These are the API points that show up in apps, plugins, and docs — anything
we omit becomes a friction point later.

| Rails API                                                     | Where            | Purpose                               |
| ------------------------------------------------------------- | ---------------- | ------------------------------------- |
| `Template::Handlers.register_template_handler(:erb, ERB)`     | bootstrap        | Plug a new handler at an extension    |
| `Template::Handlers::ERB#call(template, source)`              | handler protocol | Compile a source string               |
| `ActionView::Template::Handlers::ERB.erb_implementation`      | class attr       | Swap Erubi for an alternative         |
| Magic comment `<%# locals: (foo:, bar:) %>`                   | template source  | Strict locals contract                |
| `OutputBuffer#<<`, `#concat`, `#safe_append=`, `#append=`     | runtime          | Output collection + escaping          |
| `SafeBuffer` (`html_safe`, `html_safe?`)                      | runtime          | Safety marker propagation             |
| `Template::Error` with `#annoted_source_code`                 | error reporting  | Numbered source excerpt in dev errors |
| `ActionView::CompiledTemplates`                               | introspection    | Module where compiled methods live    |
| `Template#identifier`, `#virtual_path`, `#format`, `#handler` | metadata         | Render dispatch + Digestor input      |

---

## 2. How TSE implements the same shape

### 2.1 Why a custom extension at all

Two reasons we don't reuse EJS/Handlebars/Edge.js:

1. **Type-checked locals.** Rails' strict locals are a runtime check.
   In TS we can make them a _compile-time_ check via the trails-tsc plugin
   — but only if we control the syntax for declaring local types. A
   bespoke extension lets us add a `<%! types: { ... } !%>` block without
   fighting an upstream parser.
2. **1:1 ERB semantics.** We want `<%= %>`, `<% %>`, `<%- -%>`, `<%# %>`,
   `<%% %>`, and the safe-string propagation rules — all of them. EJS
   diverges (e.g. no `html_safe?` concept, different trim).

The cost is owning a small parser and a build step. Both are small (the
parser is ~200 LOC; the build step piggybacks on trails-tsc which we
already ship).

### 2.2 Filename convention — formats × handlers

Rails parses template filenames as `<name>.<locale?>.<format>.<variant?>.<handler>`,
e.g. `show.html.erb`, `show.en.json.erb`, `show.html+phone.erb`. The
**format** segment (`html`, `json`, `xml`, `text`, `js`, `css`, …) is
metadata, not part of the handler — `Template::Handlers::ERB` processes
all of them the same way. Format selection happens upstream in
`LookupContext` based on `Accept:` / `respond_to`.

TSE adopts the same triple: `<name>.<format>.tse`.

| File                                           | Format | Handler | Rails analogue                            |
| ---------------------------------------------- | ------ | ------- | ----------------------------------------- |
| `users/show.html.tse`                          | `html` | tse     | `users/show.html.erb`                     |
| `users/show.json.tse`                          | `json` | tse     | `users/show.json.erb` (often `.jbuilder`) |
| `users/show.text.tse`                          | `text` | tse     | `users/show.text.erb`                     |
| `users/show.xml.tse`                           | `xml`  | tse     | `users/show.xml.erb` (often `.builder`)   |
| `assets/app.js.tse`                            | `js`   | tse     | `assets/app.js.erb`                       |
| `assets/app.css.tse`                           | `css`  | tse     | `assets/app.css.erb`                      |
| `mailer/welcome.html.tse` + `welcome.text.tse` | both   | tse     | same pattern in mailers                   |

`.tse` is just the handler — anything Rails lets you put in front of
`.erb`, you put in front of `.tse`. Other handlers can register against
their own extensions (`.builder` → a hypothetical `XmlBuilder` handler,
`.jbuilder` → `Jbuilder`); `.tse` is one row in the
`Template::Handlers` registry, not the whole registry.

**Format-specific behavior:** the handler itself is format-agnostic, but
two things vary by format:

1. **Escape function.** `html`/`xml` formats wire `escape` to
   `escapeHtml`. `js` wires to `escapeJs`. `json` wires to
   `JSON.stringify`-of-the-value (no `<%= %>` for raw strings — output
   is structurally encoded). `text`/`css` wire `escape` to identity
   (no escape; safety is the author's job, same as Rails).
2. **Default `Content-Type`.** Set by `LookupContext` from the format
   token via a `Mime::Type` table — `html → text/html`, `json →
application/json`, etc. Same lookup Rails uses.

**`<%! format: "json" !%>`** override is allowed for the rare case
where the filename's format is wrong or absent (single-file scripts,
ad-hoc partials). Defaults to `html` if neither filename nor magic
block specify.

**Compiler is one.** All these files go through the same
`Tse.call(template, source)` — the format only changes which `escape`
the emitted code imports. Parser, AST, trim modes, magic comments,
trails-tsc plugin behavior — all identical across formats.

### 2.3 Components

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   .tse source ──► TseLexer ──► TseAst ──► Emitter ──► output   │
│                                                                │
│                                          ├─► .tse.js (runtime) │
│                                          └─► .tse.ts (for tsc) │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- **`@blazetrails/actionview/template/handlers/tse.ts`** — runtime handler.
  Owns lexer + AST + JS emitter. Rails analogue: `Template::Handlers::ERB`
  - `Erubi::Engine` collapsed into one module (TS doesn't need the engine
    swap-out plugin point Erubi exists to provide — but we expose
    `Tse.emitter` for the rare case someone wants to swap).
- **`@blazetrails/trails-tsc/plugins/tse.ts`** — virtualization plugin.
  Reads the same lexer output and re-emits as TS for typechecking. Rails
  has no analogue (Rails has no static type-check phase).
- **`@blazetrails/actionview/output-buffer.ts`** and
  **`@blazetrails/activesupport/safe-string.ts`** — runtime substrates.
  Direct Rails analogues: `ActionView::OutputBuffer` and
  `ActiveSupport::SafeBuffer`.

### 2.4 Syntax (1-for-1 with ERB, plus one extension)

| TSE                               | ERB                      | Meaning                                      |
| --------------------------------- | ------------------------ | -------------------------------------------- |
| `<% stmt %>`                      | `<% stmt %>`             | TS statement, no output                      |
| `<%= expr %>`                     | `<%= expr %>`            | Output expr, HTML-escape unless `SafeString` |
| `<%== expr %>`                    | `<%== expr %>`           | Output expr, never escape                    |
| `<%- stmt -%>`                    | `<%- stmt -%>`           | Statement + trim surrounding whitespace      |
| `<%= expr -%>`                    | `<%= expr -%>`           | Output + trim trailing newline               |
| `<%# comment %>`                  | `<%# comment %>`         | Dropped                                      |
| `<%% / %%>`                       | `<%% / %%>`              | Literal `<%` / `%>`                          |
| `<%# locals: { name: string } %>` | `<%# locals: (name:) %>` | Strict locals — see 2.4                      |
| `<%! types: { name: string } !%>` | _(none)_                 | TSE-only — extended locals type spec         |

The two locals forms are equivalent at runtime; the `<%!  !%>` form exists
because it accepts arbitrary TS type syntax (generics, unions, imported
types) while `<%# locals: %>` is restricted to a single TS object literal
for parser simplicity. Pick one per file.

### 2.5 Strict locals

Rails enforces strict locals by generating a method with explicit kwargs.
TSE does the same thing at two layers:

- **Compile time**: trails-tsc emits `.tse.ts` whose default export is
  `(context: RenderContext, locals: { name: string }): SafeString`. tsc
  rejects calls that omit `name` or pass the wrong type.
- **Runtime**: the emitted `.tse.js` checks `Object.keys(locals)` against
  the declared set and throws `ActionView.Template.Error` (subclass
  `StrictLocalsMismatch`) on mismatch. Matches Rails' `ArgumentError` for
  unknown kwargs.

If neither magic block is present, locals defaults to `Record<string,
unknown>` (matching Rails' permissive default).

### 2.6 Emit shape (runtime)

The compiled `.tse.js` mirrors Erubi's `_buf` pattern with renamed primitives:

```js
// app/views/users/show.tse  →  .trails/views/users/show.tse.js
import { OutputBuffer } from "@blazetrails/actionview/output-buffer";
import { escape } from "@blazetrails/actionview/escape";

export default function render(context, locals) {
  const _buf = new OutputBuffer();
  _buf.safeAppend("<h1>");
  _buf.append(locals.name); // escapes unless SafeString
  _buf.safeAppend("</h1>\n");
  return _buf.toSafeString();
}
```

Rails analogue (the Ruby Erubi emits):

```ruby
_buf = ActionView::OutputBuffer.new
_buf.safe_append = "<h1>"
_buf.append      = ( locals[:name] )
_buf.safe_append = "</h1>\n"
_buf
```

Member-for-member:

| Rails                      | TSE                           |
| -------------------------- | ----------------------------- |
| `OutputBuffer.new`         | `new OutputBuffer()`          |
| `_buf.safe_append =`       | `_buf.safeAppend(...)`        |
| `_buf.append =`            | `_buf.append(...)`            |
| return `_buf` (SafeBuffer) | `_buf.toSafeString()`         |
| `html_safe?`               | `value instanceof SafeString` |
| `String#html_safe`         | `safe(value)` helper          |

### 2.7 Emit shape (typecheck)

`.tse.ts` is identical to `.tse.js` except:

- It carries the declared `locals` type on the function signature.
- Each `<%= expr %>` is wrapped `(expr) satisfies unknown` so tsc reports
  the original `.tse` location via the source map.
- Top of file imports types only (no runtime cost) so trails-tsc can
  delete the file after typecheck without affecting bundles.

### 2.8 Build output layout

```
app/views/
  users/
    show.html.tse
    show.json.tse
    show.text.tse
    index.html.tse
.trails/views/
  users/
    show.html.tse.ts   ← typecheck shim (gitignored)
    show.html.tse.js   ← runtime module (gitignored)
    show.json.tse.ts
    show.json.tse.js
    show.text.tse.ts
    show.text.tse.js
  views-manifest.ts    ← lazy-thunk registry, keyed by name + format
```

The mirror dir is the single source of truth for both tsc and bundler.
`trails-tsc build` populates it; `trails-tsc dev` keeps it in sync.

---

## 3. 1-for-1 API mapping

This is the contract we ship. Anything below that says "Rails has X, we
have Y" should match behavior, not just signature.

### 3.1 Handler protocol

| Rails                                                     | TSE                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Template::Handlers.register_template_handler(:tse, TSE)` | `Template.Handlers.register("tse", Tse)`                                |
| `Template::Handlers::ERB#call(template, source) → String` | `Tse.call(template, source): { code: string, sourceMap: RawSourceMap }` |
| `Template::Handlers::ERB.erb_implementation` (class attr) | `Tse.emitter` (replaceable)                                             |
| `default_format` (e.g. `:html`)                           | `Tse.defaultFormat = "html"`                                            |

Difference: our `call` returns `{code, sourceMap}` instead of a bare
string. Rails embeds source-map info as Ruby comments; we need a real
source map for tsc + dev tools. Drivers (Template#compile, error
formatter) consume both fields.

### 3.2 Runtime substrate

| Rails                       | TSE                                 | Notes                                  |
| --------------------------- | ----------------------------------- | -------------------------------------- |
| `ActiveSupport::SafeBuffer` | `SafeString` (activesupport)        | Mark + propagate                       |
| `String#html_safe`          | `safe(s: string): SafeString`       | Free function (TS has no monkey-patch) |
| `String#html_safe?`         | `(v): v is SafeString` (instanceof) | Used by `append`                       |
| `ActionView::OutputBuffer`  | `OutputBuffer`                      | `append`, `safeAppend`, `toSafeString` |
| `ERB::Util.html_escape`     | `escape(s: unknown): string`        | Coerces non-strings via `String(...)`  |

### 3.3 Magic comments

| Rails                                                         | TSE                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `<%# locals: (name:, count: 0) %>` (strict, defaults allowed) | `<%# locals: { name: string; count?: number } %>`                |
| `<%# frozen_string_literal: true %>`                          | _no analogue_ — TS strings are immutable                         |
| `<%# encoding: utf-8 %>`                                      | _no analogue_ — UTF-8 only                                       |
| n/a                                                           | `<%! types: { ... } !%>` — extended (imports + generics allowed) |

### 3.4 Trim modes

| Rails (`-` mode only, the actionview default)                | TSE       |
| ------------------------------------------------------------ | --------- |
| `<%- code -%>` strip leading + trailing whitespace + newline | identical |
| `<%= expr -%>` strip trailing newline only                   | identical |
| `%>` (no dash) keep all whitespace                           | identical |

We deliberately do not ship `>` or `<>` modes Rails leaves disabled.

### 3.5 Error reporting

| Rails                                                            | TSE                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `Template::Error` with `#annoted_source_code` returning ±2 lines | `Template.Error` ditto, via stored sourceMap + source                |
| Backtrace points at `.erb:line`                                  | Backtrace points at `.tse:line` via source map                       |
| `MissingTemplate` (no handler match)                             | `MissingTemplate` (same shape)                                       |
| n/a                                                              | `StrictLocalsMismatch < Template.Error` — strict-locals runtime miss |

### 3.6 Render-time integration

| Rails                                                                            | TSE                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Template#render(context, locals)` invokes compiled method with `self = context` | `Template.render(context, locals)` calls compiled module's default export, `context` passed as first arg |
| Helpers resolve as method calls on `self`                                        | Helpers resolve as method calls on `context` (`context.linkTo(...)`)                                     |
| `local_assigns` hash always available                                            | `locals` object always available                                                                         |
| `output_buffer` accessible as `@output_buffer`                                   | `context.outputBuffer`                                                                                   |

The biggest user-visible diff is helper invocation: Ruby's implicit
`self` vs TS's explicit `context.`. This is unavoidable — TS has no
`with` and `this`-typed callable templates would break tsc's
narrowing. We accept the prefix as the cost of static types; it
matches every other helper-binding port (e.g. activerecord scopes).

### 3.7 Caching / recompile keys

| Rails                                                          | TSE                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Cache key: `[handler.class, mtime, source_hash]` on `Template` | Build-time only — `.tse.js` is the cache; tsc/bundler invalidate by mtime |
| Dev autoreload: per-template mtime check in `LookupContext`    | `trails-tsc dev` watches + re-emits; lookup hits fresh `.tse.js`          |
| Production: precompiled, frozen                                | Same — `trails-tsc build` produces final artifacts                        |

No runtime template compilation in TSE — by design. Rails compiles
lazily on first render; we compile ahead. Rationale: we need tsc
output anyway, so we get runtime output for free.

---

## 4. Phasing (cross-reference)

Maps to [actionview-100-percent.md](actionview-100-percent.md):

| TSE plan section                            | actionview-100 phase                       |
| ------------------------------------------- | ------------------------------------------ |
| §2.3 components — SafeString / OutputBuffer | 0b                                         |
| §2.3 components — runtime handler           | 2a                                         |
| §2.3 components — trails-tsc plugin         | 2b                                         |
| §2.2 filename/format parsing                | 2a (handler) + 2b (plugin manifest keying) |
| §2.8 build output + manifest                | 2c                                         |
| §3.5 error reporting                        | 1b + 1d                                    |
| §3.6 render-time integration                | 3a–3c (renderer)                           |

This doc does not change phasing; it formalizes the 1-for-1 contract so
each phase has a fidelity bar to hit.

---

## 5. Open questions

1. **Helper binding ergonomics.** `context.linkTo` vs a generated
   `using` block (`<% using context %>`) that aliases helpers as locals.
   The latter is closer to Rails but adds a compile-time scope-tracker.
   Defer until a real view stresses it.
2. **Partials in TSE.** Rails' `render partial: "user", locals:` resolves
   path → template at runtime. With strict locals + the views manifest
   we _could_ type-check partial calls at the call site
   (`<%= render(UserPartial, { user }) %>`). Worth doing — open question
   is whether to keep the string form too for parity.
3. **Streaming.** Rails uses fibers + `Flow`. We've planned async
   generators (Phase 3d). The TSE compiler doesn't need to know — the
   handler returns a SafeString, streaming is the renderer's problem.
   Confirm during Phase 3d that no TSE syntax has to change.
4. **Source-map format.** Inline base64 in `.tse.js` vs sidecar
   `.tse.js.map`. Sidecar plays nicer with bundlers; inline survives
   transitive copy steps. Default to sidecar, allow inline via build flag.
