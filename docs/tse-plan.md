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

Responsibilities (verified against `vendor/rails/actionview/lib/action_view/template/handlers/erb.rb`):

- Registered against the `.erb` extension by `Template::Handlers.register_template_handler`.
- Class attributes (user-tunable):
  - `erb_trim_mode` — default `"-"`. Only `-` is wired through to Erubi.
  - `erb_implementation` — default `ActionView::Template::Handlers::ERB::Erubi`. Swappable.
  - `escape_ignore_list` — default `["text/plain"]`. Templates whose
    `template.type` is in this list invert the meaning of `<%= %>` (see 1.2).
  - `strip_trailing_newlines` — default `false`. `erb.chomp!` before compile.
- Protocol methods on handler instance:
  - `#call(template, source) → ruby_code_string`.
  - `#supports_streaming? → true`.
  - `#handles_encoding? → true`.
  - `#translate_location(spot, backtrace_location, source)` — maps an
    ErrorHighlight `spot` from compiled-Ruby coordinates back to source
    coordinates by tokenizing `::ERB::Util.tokenize` and walking
    consecutive `:CODE`/`:TEXT` token pairs.
- Strips the encoding magic comment from source before compile via
  `ENCODING_TAG = /\A(<%#{ENCODING_FLAG}-?%>)[ \t]*/`. Magic-comment
  form is `<%# encoding: utf-8 %>`.
- Passes Erubi the options:
  ```ruby
  {
    escape: escape_ignore_list.include?(template.type),
    trim:   (erb_trim_mode == "-"),
  }
  ```
  And, when `ActionView::Base.annotate_rendered_view_with_filenames`
  is true and `template.format == :html`, also:
  ```ruby
  preamble:  "@output_buffer.safe_append='<!-- BEGIN #{template.short_identifier} -->';"
  postamble: "@output_buffer.safe_append='<!-- END #{template.short_identifier} -->';@output_buffer"
  ```
- Strict locals are **not** handled here. They are handled in
  `Template#strict_locals!` (see 1.3).
- Recompile key: not the handler's concern — `Template` invalidates by
  mtime; `compile!` is one-shot per template instance, guarded by
  `@compile_mutex`.

### 1.2 `Erubi::Engine` (the compiler)

Source: gem `erubi` upstream; actionview subclasses it in
`vendor/rails/actionview/lib/action_view/template/handlers/erb/erubi.rb`.

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
- **Subclass overrides set by actionview's `Erubi.initialize`:**
  - `bufvar = "@output_buffer"` (NOT bare-Erubi default `_buf`).
  - `escapefunc = ""` — there is no escape function call site; escaping
    is the _receiver's_ concern (SafeBuffer's `<<` decides based on
    `html_safe?`).
  - `freeze_template_literals = !Template.frozen_string_literal`.
- Emits Ruby of the form (real shape, with `@output_buffer` bufvar):
  ```ruby
  @output_buffer.safe_append = "<h1>"
  @output_buffer.append      = ( @user.name )       # html-safe? check at runtime
  @output_buffer.safe_append = "</h1>\n"
  @output_buffer
  ```
- **Three append primitives**, dispatched by `add_expression(indicator, code)`:
  | Site | Dispatch condition | Method |
  |---|---|---|
  | `<%= expr %>` in html template (`escape: false`) | indicator `=`, not `==`, not @escape | `.append=` |
  | `<%= expr %>` in text/plain template (`escape: true`) | @escape is true | `.safe_expr_append=` |
  | `<%== expr %>` | indicator `==` | `.safe_expr_append=` |
  | literal text | n/a | `.safe_append=` |
  - `.append=` routes through `SafeBuffer#<<` which HTML-escapes unless
    `html_safe?(value)`.
  - `.safe_expr_append=` writes without escaping but does `to_s` coercion.
  - `.safe_append=` writes raw without coercion (used for static chunks).
- **Block-form `<%= %>`.** `BLOCK_EXPR = /((\s|\))do|\{)(\s*\|[^|]*\|)?\s*\Z/`
  detects `<%= helper do %>...<% end %>` and `<%= helper { ... } %>`.
  When matched, the emitter writes `.append= helper do ... end` (no
  paren-wrap) so the block is captured by the helper, not by the assignment.
- **Newline coalescing.** `@newline_pending` accumulates consecutive `\n`-only
  text chunks; on the next non-newline append or code event they are flushed
  in one `safe_append`. Cuts emitted Ruby size on whitespace-heavy templates.
- Source maps: Erubi emits line directives (`# line N "path"`-equivalent) so
  backtraces hit the `.erb` file, not the generated Ruby.

### 1.3 `ActionView::Template#compile!`

- Wraps the Erubi-emitted Ruby in a method definition on a transient
  module (`ActionView::CompiledTemplates`), one method per template +
  variant + locale + format combination.
- `method_name = _#{identifier_method_name}__#{@identifier.hash}_#{__id__}`
  — `__id__` is Ruby's `object_id`; the suffix makes the name unique
  across reloads.
- Base signature: `(local_assigns, output_buffer)`.
- **Strict locals** (`Template#strict_locals!`):
  - Parses `STRICT_LOCALS_REGEX = /\#\s+locals:\s+\((.*)\)/` out of the
    source via `source.sub!(...)` — the magic comment is stripped before
    Erubi sees it.
  - Empty body (`<%# locals: () %>`) → `**nil` (no extra kwargs allowed).
  - Splices kwargs into the method signature:
    `(local_assigns, output_buffer, #{set_strict_locals})`. Unknown kwargs
    raise `ArgumentError` via Ruby's own kwarg validation — no manual check.
  - Renderer warns if `local_assigns` keys don't match `@strict_local_keys`.
- The method is invoked with `self` set to the **view context** (a
  `ActionView::Base` instance) so all helpers (`link_to`, `form_with`, etc.)
  resolve as plain method calls. `@output_buffer` is therefore an ivar on
  the view context, not a local — explaining the Erubi `bufvar` choice.

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
| `Template::Error` with `#annotated_source_code`               | error reporting  | Numbered source excerpt in dev errors |
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

TSE adopts the **full Rails grammar**, not just the minimum triple.
The minimum convention is `<name>.<format>.tse`; optional locale and
variant segments are also supported with the same parsing rules as
Rails (see §2.10.4 for the full grammar, registered-token lists, and
disambiguation). Examples in the table below show the common
`<name>.<format>.tse` shape, but `show.en.html+phone.tse` and other
locale/variant combinations are equally valid.

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

**Format-specific behavior** (matching Rails' actual model — there is
no per-format escape _function_; what varies is the dispatch of `<%= %>`):

1. **`<%= %>` dispatch flips by format.** Rails has a class attribute
   `Template::Handlers::ERB.escape_ignore_list = ["text/plain"]`. TSE
   mirrors with `Tse.escapeIgnoreList = ["text/plain"]`. The rule:
   - If `template.type ∈ escapeIgnoreList` → `<%= %>` emits
     `outputBuffer.safeExprAppend(expr)` (no escape).
   - Otherwise → `<%= %>` emits `outputBuffer.append(expr)`, which
     routes through `SafeString`'s `<<` and HTML-escapes unless
     `expr instanceof SafeString`.
   - `<%== %>` always emits `outputBuffer.safeExprAppend(expr)`.

   Concretely: in `.html.tse`, `.json.tse`, `.xml.tse`, `.js.tse`,
   `.css.tse`, `<%= %>` HTML-escapes. In `.text.tse`, `<%= %>` does
   not escape. **There is no JS-escape or CSS-escape baked into the
   handler.** Authors writing `.js.tse` who want JS-string escaping
   call the `j(value)` helper explicitly — same as Rails.

2. **Default `Content-Type`.** Set by `LookupContext` from the format
   token via a `Mime::Type` table — `html → text/html`,
   `json → application/json`, etc. Same lookup Rails uses.

3. **HTML annotation comments.** When
   `ActionView.Base.annotateRenderedViewWithFilenames` is true and
   `template.format === "html"`, the compiler emits preamble/postamble:

   ```
   outputBuffer.safeAppend("<!-- BEGIN users/show.html.tse -->");
   ...
   outputBuffer.safeAppend("<!-- END users/show.html.tse -->");
   ```

   Matches Rails' annotation feature; default off in production.

**`<%! format: "json" !%>`** override is allowed for the rare case
where the filename's format is wrong or absent (single-file scripts,
ad-hoc partials). Defaults to `html` if neither filename nor magic
block specify.

**Compiler is one.** All these files go through the same
`Tse.call(template, source)` — the format only changes one option
(`escape: escapeIgnoreList.includes(template.type)`). Parser, AST,
trim modes, magic comments, trails-tsc plugin behavior — all
identical across formats.

### 2.3 Components — three-package split

The lexer, AST, and emitters are needed by **both** the runtime handler
(to produce `.tse.js`) and the build plugin (to produce `.tse.ts` +
`.d.ts`). Putting them in either consumer creates a dependency
inversion (trails-tsc → actionview, or vice versa). Instead, factor
them into a leaf package — directly mirroring how Rails ships `erubi`
as a separate gem that actionview consumes.

```
┌────────────────────────────────────────────────────────────────────┐
│  @blazetrails/tse-compiler  (leaf — only depends on activesupport) │
│                                                                    │
│   .tse source ──► TseLexer ──► TseAst ──► Emitter ──► artifacts    │
│                                                                    │
│                                            ├─► .tse.js (+ .js.map) │
│                                            ├─► .tse.ts             │
│                                            └─► .d.ts (+ .d.ts.map) │
└────────────────────────────────────────────────────────────────────┘
            ▲                                              ▲
            │                                              │
            │ depends on                       depends on  │
            │                                              │
┌───────────┴────────────────────┐    ┌────────────────────┴──────────┐
│  @blazetrails/actionview       │    │  @blazetrails/trails-tsc      │
│                                │    │                               │
│  • Tse handler class           │    │  • TscPlugin infra            │
│  • OutputBuffer                │    │  • tse plugin (writes files)  │
│  • Template, Resolver,         │    │  • build CLI, watch           │
│    Renderer, helpers, ...      │    │  • TS language service plugin │
│  • Render-time integration     │    │  • views-manifest generator   │
└────────────────────────────────┘    └───────────────────────────────┘
```

**`@blazetrails/tse-compiler`** — leaf package, no runtime template
behavior. Pure source → emit pipeline. Rails analogue: `erubi` gem.

- `TseLexer` — `<%`/`%>` tokenizer with trim-mode + magic-comment awareness.
- `TseAst` — typed nodes (`Text`, `Code`, `Expr`, `RawExpr`, `Comment`,
  `BlockExpr`).
- `JsEmitter` — AST → `{ code: string, sourceMap: RawSourceMap }`.
  Produces the runtime module.
- `TsEmitter` — AST → typecheck shim with declared locals signature.
- _(No DtsEmitter — `.d.ts` + `.d.ts.map` are produced by invoking
  the TypeScript compiler API on the emitted `.tse.ts` with
  `declarationMap: true`. See §6.3.)_
- `parseFilename(path) → { name, format, handler }`.
- `parseMagicComments(source) → { locals, format, sourceWithoutMagic }`.
- No I/O. No file watching. Everything is `(string, options) → string`-ish.
- Dependencies: `activesupport` (type-only, for the `SafeString` brand).
- Tested in-package against fixture `.tse` strings → expected `.tse.js`
  output. Snapshot tests catch emit-shape regressions.

**`@blazetrails/actionview`** — owns the Tse _handler_, not the
_compiler_. The handler is the runtime wrapper that knows about
`template.type`, `escape_ignore_list`, view context, etc., and
delegates the actual source → string compile to tse-compiler.

- `template/handlers/tse.ts` — `Tse.call(template, source)`. Reads
  class attrs, resolves format-derived options, calls
  `tseCompiler.compileJs(source, options)`, returns
  `{ code, sourceMap }`.
- `output-buffer.ts` — runtime substrate. Used by emitted `.tse.js`.
- `template.ts`, `resolver.ts`, `renderer.ts`, helpers — none of these
  touch the compiler; they consume the compiled module via dynamic
  import or the `TemplateRegistry`.
- Dependencies: `tse-compiler`, `activesupport`, `activemodel` (for
  helpers).

**`@blazetrails/trails-tsc`** — owns the build plugin and tooling. The
plugin is a thin shell over tse-compiler.

- `plugins/tse.ts` — `TscPlugin` impl: takes `.tse` paths, calls
  `tseCompiler.compileTs(source)` + `compileDts(source)`, writes the
  artifacts under `.trails/views/`.
- `cli/build.ts`, `cli/dev.ts` — walk `app/views/**/*.tse`, run the
  plugin, generate `views-manifest.ts`.
- `ts-plugin.ts` — TS language service plugin (`compilerOptions.plugins`).
  Intercepts `.tse` imports in-editor without requiring a build.
- Dependencies: `tse-compiler`, `typescript` (peer). **No
  actionview dependency** — trails-tsc stays usable for AR-only
  projects.

**Why this matches Rails' shape.** Rails' `erubi` gem knows nothing
about templates, views, or HTTP. It's a pure source → Ruby compiler.
`actionview` wraps it with the handler + template machinery. The
`@blazetrails/tse-compiler` ↔ `@blazetrails/actionview` split is the
direct port of that boundary.

### 2.4 Syntax (1-for-1 with ERB, plus one extension)

| TSE                                               | ERB                                | Meaning                                                             |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `<% stmt %>`                                      | `<% stmt %>`                       | TS statement, no output                                             |
| `<%= expr %>`                                     | `<%= expr %>`                      | Output expr, HTML-escape unless `SafeString`                        |
| `<%== expr %>`                                    | `<%== expr %>`                     | Output expr, never escape                                           |
| `<%- stmt -%>`                                    | `<%- stmt -%>`                     | Statement + trim surrounding whitespace                             |
| `<%= expr -%>`                                    | `<%= expr -%>`                     | Output + trim trailing newline                                      |
| `<%# comment %>`                                  | `<%# comment %>`                   | Dropped                                                             |
| `<%% / %%>`                                       | `<%% / %%>`                        | Literal `<%` / `%>`                                                 |
| `<%= helper do %>...<% end %>`                    | `<%= helper do %>...<% end %>`     | Block-form output expression — see below                            |
| `<%# locals: (name:, count: 0) %>`                | `<%# locals: (name:, count: 0) %>` | Rails-style names + defaults — drives runtime binding               |
| `<%! types: { name: string; count?: number } !%>` | _(none)_                           | TSE-only — optional TS types for tsc (coexists with `locals:` line) |

**Locals declaration is hybrid** (matches the decision in
[actionview-100-percent.md §3](actionview-100-percent.md)): the
Rails-style names line is the canonical form — `<%# locals: (name:, count: 0) %>` —
and **drives runtime binding** (the compiled function's parameter
list, arity, and defaults). The `<%! types: { ... } !%>` block is
**optional and coexists** with the names line; when present, it
sharpens the locals parameter's TS type for tsc. When absent, locals
parameter type defaults to `Record<string, unknown>`.

```tse
<%# locals: (user:, count: 0) %>
<%! types: { user: User; count?: number } !%>
```

The `<%! !%>` form is a **brand-new opener** with no ERB analogue.
The lexer recognizes `<%!` specifically and closes on `!%>` rather
than `%>` (see §2.10.1 for the single-place divergence in the
otherwise Erubi-identical scanner).

**Block-form `<%= %>`.** Same as Rails' `BLOCK_EXPR`. When `expr` ends
in `do |args|` or `{`, the emitter passes the block body as a final
callback argument to the helper, **wrapped in `context.capture(...)`**
so the inner appends are captured into a fresh buffer rather than
double-writing to the parent. See §2.10.3 for the full protocol.

```tse
<%= formWith({ model: user }) do |f| %>
  <%= f.textField("name") %>
<% end %>
```

emits:

```ts
context.outputBuffer.append(
  context.formWith({ model: user }, (f) =>
    context.capture(() => {
      context.outputBuffer.append(f.textField("name"));
    }),
  ),
);
```

The block callback returns the captured `SafeString`; the helper
embeds it in its own output and returns the combined result; the
outer `append` writes that result. No double-write.

### 2.5 Strict locals

Rails enforces strict locals by **splicing kwargs into the compiled
method's signature** — Ruby's own kwarg validation then raises
`ArgumentError` on unknown keys, with no manual check in the handler.
Source-side, the magic comment is matched by
`STRICT_LOCALS_REGEX = /\#\s+locals:\s+\((.*)\)/` and `sub!`'d out of
`source` before Erubi sees it. Empty body (`<%# locals: () %>`) becomes
`**nil` — no extra kwargs accepted.

TSE mirrors this at two layers:

- **Compile time** (the primary enforcement, with caveats): the
  trails-tsc plugin emits `.tse.ts` whose default export is
  `(context: RenderContext, locals: { name: string }): SafeString`. tsc
  rejects calls that omit `name` or pass the wrong type.

  **TS excess-property caveat.** TypeScript's excess-property check
  fires reliably **only for fresh object literals at the call site** —
  `render({ partial: ..., locals: { name: "x", extra: 1 } })` errors,
  but if `locals` is constructed and stored in a variable
  (`const l = { name: "x", extra: 1 }; render({ partial, locals: l })`)
  the excess property is accepted because TS widens the variable's
  type. This is weaker than Ruby's `ArgumentError` for unknown kwargs.

  Mitigations the emitter applies:
  1. The generated render-call helper accepts `locals` typed as an
     **exact object type** built via a `NoExtraKeys<T>` helper that
     uses conditional types to reject extra keys structurally (works
     against variables, not just literals).
  2. Users writing partial calls inline benefit from normal
     excess-property checking automatically.
  3. The runtime check below catches what slips through.

- **Runtime** (defense in depth, for dynamically-built `locals`): the
  emitted `.tse.js` checks declared keys against `locals` and throws
  `ActionView.Template.Error` subclass `StrictLocalsMismatch` on
  mismatch. Off by default in production; on under
  `ActionView.Base.raiseOnStrictLocalsMismatch`.

If neither magic block is present, locals defaults to `Record<string,
unknown>` (matching Rails' permissive default).

The magic comment is `sub!`'d out of the source by the lexer before AST
construction — mirroring Rails' `Template#strict_locals!` mutation — so
the emitted Ruby/TS never contains the type declaration.

### 2.6 Emit shape (runtime)

The compiled `.tse.js` mirrors Rails' actionview-flavored Erubi output.
Note that Rails uses `@output_buffer` (an ivar on the view context) as
its `bufvar`; the TS equivalent is `context.outputBuffer`. There is no
local `_buf`.

```js
// app/views/users/show.html.tse  →  .trails/views/users/show.html.tse.js
export default function render(context, locals) {
  const _ob = context.outputBuffer; // alias for brevity in emitted code
  _ob.safeAppend("<h1>");
  _ob.append(locals.name); // → SafeString#<< → HTML-escape unless SafeString
  _ob.safeAppend("</h1>\n");
  return _ob; // returns the OutputBuffer (a SafeString) — matches Rails
}
```

Rails analogue (the Ruby Erubi actually emits — verified against
`vendor/rails/actionview/.../erb/erubi.rb`):

```ruby
@output_buffer.safe_append = "<h1>"
@output_buffer.append      = ( locals[:name] )
@output_buffer.safe_append = "</h1>\n"
@output_buffer
```

For `<%== expr %>` (or `<%= expr %>` when `escape: true`, i.e. text/plain):

```js
_ob.safeExprAppend(expr); // to_s coercion, no HTML-escape
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

### 2.9 TypeScript-specific concerns

Rails ERB has none of these — they exist because we're targeting tsc +
editors + bundlers, not just a runtime interpreter. Each point below is
load-bearing for "imports resolve, types flow, errors point at the right
line" — without them the user experience falls apart even if the
runtime is perfect.

**Emitted artifacts per `.tse`.** For every
`app/views/users/show.html.tse`, `trails-tsc build` writes:

| File                                         | Purpose                                                           | Shipped in published package?         |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `.trails/views/users/show.html.tse.ts`       | Typecheck shim — what tsc sees                                    | No (build artifact)                   |
| `.trails/views/users/show.html.tse.js`       | Runtime module — what bundlers/Node import                        | Yes (or compiled further)             |
| `.trails/views/users/show.html.tse.js.map`   | Maps `.tse.js` lines → `.tse` source (runtime stacktraces)        | Yes                                   |
| `.trails/views/users/show.html.tse.d.ts`     | Declarations — what downstream consumers typecheck against        | **Yes — required for npm publishing** |
| `.trails/views/users/show.html.tse.d.ts.map` | Maps `.d.ts` → `.tse` source ("Go to Definition" jumps to `.tse`) | Yes                                   |

The `.tse.ts` is consumed only by the app's own `tsc` run. The `.d.ts`

- `.d.ts.map` pair is what makes a published gem (e.g. a view-component
  library on npm) usable without the consumer having to run
  `trails-tsc build` themselves.

**Module resolution: `import Show from "./show.html.tse"`.** Three
strategies, in increasing order of magic:

1. **`allowArbitraryExtensions: true`** (TS 5.0+) + sidecar
   `show.html.d.tse.ts` declaration files. Vanilla tsc resolution; no
   plugin needed. Verbose filenames, but it Just Works in any editor
   that respects tsconfig.
2. **`paths` mapping** — `"@views/*": [".trails/views/*"]` so imports
   become `import Show from "@views/users/show.html.tse"` and resolve
   to `.trails/views/users/show.html.tse.ts` at typecheck and
   `.trails/views/users/show.html.tse.js` at runtime via Node's
   `customConditions` / a bundler resolver.
3. **TS language service plugin** — `@blazetrails/trails-tsc/ts-plugin`
   registered in tsconfig under `compilerOptions.plugins`. The plugin
   intercepts `.tse` imports, compiles them on the fly, and surfaces
   diagnostics inline without the user having to run a build.

**Default to (1) + (2) together.** The plugin (3) is an optional DX
booster for in-editor live typecheck; recommended for app dev, not
required for libraries.

**Ambient declaration for bundlers/editors that haven't run the build:**

```ts
// @blazetrails/actionview/types.d.ts (shipped with the package)
declare module "*.tse" {
  import type { SafeString, RenderContext } from "@blazetrails/actionview";
  const template: (context: RenderContext, locals: unknown) => SafeString;
  export default template;
}
```

This guarantees `import Show from "./show.html.tse"` typechecks (as
`unknown` locals) even before `trails-tsc build` has run — important
for a fresh clone, where tsc would otherwise error on the import before
the build can succeed. Once the build runs, the more specific
`.tse.d.ts` shadows the ambient fallback.

**tsconfig.json the user adds:**

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "paths": {
      "@views/*": [".trails/views/*"]
    },
    "plugins": [{ "name": "@blazetrails/trails-tsc/ts-plugin" }]
  },
  "include": ["src/**/*", ".trails/views/**/*"]
}
```

`trails init` writes this; manual setup documented for migrations.

**Source maps — three kinds, each mapping to `.tse`:**

| Map                                      | Consumer                             | What it enables                                       |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `.tse.js.map`                            | Node, browsers, bundlers             | Runtime stack traces point at `.tse:line:col`         |
| `.tse.d.ts.map`                          | tsc, editors                         | Hover/Go-to-Definition jumps to `.tse`, not `.tse.ts` |
| `sourceMap` field on `Tse.call`'s return | `Template.Error#annotatedSourceCode` | Server-side error pages render `.tse` excerpts        |

All three are the TS-side analogue of Rails' single `translate_location`
mechanism. They have to be three because each consumer (Node, tsc,
template renderer) has its own map format.

**`RenderContext` is module-augmentable.** Helper packages extend it
via declaration merging so `context.linkTo(...)` typechecks once
`@blazetrails/actionview/helpers/url` is imported:

```ts
// @blazetrails/actionview/helpers/url/types.d.ts
declare module "@blazetrails/actionview" {
  interface RenderContext {
    linkTo(name: string, path: string, options?: LinkToOptions): SafeString;
    urlFor(target: UrlTarget): string;
  }
}
```

Same shape as ActiveRecord scope augmentation. Apps register custom
helpers the same way.

**`TemplateRegistry` is augmentable across packages.** The generated
`views-manifest.ts` declares:

```ts
declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "users/show.html": typeof import("./views/users/show.html.tse").default;
    "users/show.json": typeof import("./views/users/show.json.tse").default;
    // ... one entry per .tse file
  }
}
```

Engines (gems-equivalent) can ship their own manifest fragment so a
parent app sees the union — matches Rails' multi-engine view-path lookup.

**Strict-mode cleanliness.** Emitted `.tse.ts` and `.tse.js` must pass
under `strict: true`, `noUncheckedIndexedAccess: true`, and
`exactOptionalPropertyTypes: true`. Key consequences for the emitter:

- Locals access must use `locals.name` with the declared type, not
  `(locals as any).name`.
- `<%# locals: {} %>` emits parameter type `Record<never, never>`
  (excess-property check). Implicit `unknown` locals (no magic block)
  emits `Record<string, unknown>` so indexed access is type-safe.
- Output buffer must not be `undefined` at any point — guarantee by
  construction (always assigned before first `safeAppend`).
- Block helpers' callback types must be inferable from the helper
  signature, not the call site (the emitter can't synthesize them).

**`verbatimModuleSyntax` / `erasableSyntaxOnly`.** Emitted `.tse.ts`
uses only erasable syntax (`import type` for types, no `enum`, no
namespaces). Lets users with strict-strip configs (Bun, Deno, ts-blank-space)
consume `.tse.ts` directly if they bypass our build.

**`package.json#exports` for shipping `.tse` to npm:**

```json
{
  "exports": {
    "./views/*.tse": {
      "types": "./.trails/views/*.tse.d.ts",
      "default": "./.trails/views/*.tse.js"
    }
  }
}
```

The conditional export ensures tsc reads the `.d.ts` and Node/bundlers
read the `.js`. Without `types` first, tsc would fall back to inferring
from the JS, losing locals typing.

**Build ordering for CI.** Because `.tse.ts` is generated, CI must run
`trails-tsc build` before `tsc --noEmit`. Documented in the generated
GitHub Actions workflow + `pnpm prepare` hook. (Same constraint as
gRPC-codegen or Prisma-client-generate flows — common pattern, just
needs a callout so it doesn't surprise people.)

### 2.10 Tokenization, helpers, and template features (Erubi parity)

This section closes the remaining design gaps. Where Rails/Erubi has an
answer, we match it exactly — including its known limitations. Where
TS forces a divergence, the divergence is explicit.

#### 2.10.1 Tokenization: same heuristics as Erubi

The TSE lexer uses **Erubi's regex-based tag tokenization, not a
TS-aware tokenizer**. This is a deliberate fidelity choice: Erubi's
heuristics are well-understood, well-documented, and template authors
already know their edge cases from the Ruby world. We inherit both
the simplicity and the limits.

Concretely (matching upstream erubi's lexer):

- A tag opens on `<%` and closes on the next `%>`. The scanner does
  **not** inspect string literals, comments, brace structure, or
  generic syntax inside the tag.
- **Known limit (same as ERB):** `<% const x = "foo %> bar" %>` is
  mis-tokenized. The tag closes at the first `%>`. Template authors
  must avoid literal `%>` inside tag bodies — Ruby authors face the
  same constraint. Workaround: escape with `<% const x = "foo " + "%>" + " bar" %>`,
  or use `<%= "..." %>` and assemble outside the template.
- **Known limit (same as ERB):** the lexer is line-based for trim
  detection. A `-%>` followed by `\r\n` on Windows still strips
  correctly (we normalize line endings to `\n` before lex, matching
  Rails' `source.b` + encoding handling).
- `<%%` / `%%>` escape to literal `<%` / `%>` (same as ERB).
- `<%#` opens a comment that runs to the matching `%>`. Comment bodies
  may contain anything except `%>` — same restriction as `<% %>`. The
  comment AND its trailing newline are dropped from output (Erubi
  parity: `add_text("")` after a comment, no `<br>`).
- `<%! ... !%>` (the TSE-only types/format block) is parsed as a
  separate token class with its own delimiter. The scanner looks for
  `!%>` specifically when it has opened on `<%!`. This is the one
  place the lexer state machine has more than one closing delimiter;
  the bodies are restricted to TS type expressions and small JSON-ish
  values, neither of which legitimately contains `!%>`.

The cost of this choice is the same as in Rails: ~5 lines of
documentation about literal `%>` and that's it. The benefit is a
straightforward 200-LOC lexer instead of a TS-AST-aware one.

#### 2.10.2 `RenderContext` — the helper interface

Helpers are **typed methods on the `RenderContext` interface**, not
free functions, not globals, not `with`-bound names. The renderer
constructs a `RenderContext` instance per render call and passes it as
the first argument to the compiled template. Helper invocations in
templates compile to `context.helperName(...)` calls.

```ts
// @blazetrails/actionview/render-context.ts
export interface RenderContext {
  readonly outputBuffer: OutputBuffer;

  // Capture / concat — see 2.10.3
  capture(callback: () => void): SafeString;
  concat(value: unknown): void;
  raw(value: unknown): SafeString; // alias for safe(value)

  // Translation
  t(key: string, options?: TranslateOptions): SafeString;

  // Yield (layouts)
  yield(section?: string): SafeString;
  contentFor(section: string, callback: () => void): void;

  // Partials
  render<K extends keyof TemplateRegistry>(options: {
    partial: K;
    locals?: TemplateLocals<TemplateRegistry[K]>;
  }): SafeString;
  render(options: { partial: string; locals?: Record<string, unknown> }): SafeString;
}
```

Helper packages add methods by **declaration merging** (see §2.9):

```ts
declare module "@blazetrails/actionview" {
  interface RenderContext {
    linkTo(name: string, path: string, options?: LinkToOptions): SafeString;
    formWith<T>(options: FormWithOptions<T>, block: (f: FormBuilder<T>) => void): SafeString;
    // ...
  }
}
```

The emitted `.tse.ts` carries `context: RenderContext` as the first
parameter. Once any helper-providing module is imported anywhere in
the app, its augmentation is in scope and `context.linkTo(...)`
typechecks.

**Why explicit `context.`** Rails resolves helpers via Ruby's implicit
`self`. TS has no equivalent (`with` is dead, `this`-typed callable
modules break narrowing, eval-based name lifting breaks
tree-shaking). The explicit prefix is the smallest divergence from
ERB ergonomics that still gives static types. Same trade-off as
activerecord scopes (`User.scopes.active()` vs Ruby's implicit
class-method lookup).

**Context lifecycle.** A fresh `RenderContext` is constructed per
top-level render call. `outputBuffer` is owned by that context; no
sharing across renders, no thread-local concerns. Nested partial
renders **inherit the parent context** (so `concat` in a partial
writes to the parent buffer) — matches Rails' behavior where partials
share `@output_buffer` with the calling template.

#### 2.10.3 `capture`, `concat`, `raw` — block semantics ported from Rails

The earlier draft's block-form `<%= helper do %>...<% end %>` example
was incorrect: it would double-write (inner appends + outer
`append(helper-return-value)`). The Rails mechanism is **`capture`**,
which temporarily redirects `@output_buffer` to a fresh buffer for the
duration of the block, returning the captured string to the helper.
TSE ports this directly.

```ts
// in @blazetrails/actionview/output-buffer.ts
class RenderContextImpl implements RenderContext {
  capture(callback: () => void): SafeString {
    const saved = this.outputBuffer;
    const fresh = new OutputBuffer();
    this.outputBuffer = fresh;
    try {
      callback();
    } finally {
      this.outputBuffer = saved;
    }
    return fresh.toSafeString();
  }
  concat(value: unknown): void {
    this.outputBuffer.append(value);
  }
}
```

Block-form `<%= helper do |args| %>...<% end %>` therefore emits:

```ts
// <%= formWith({ model: user }) do |f| %><%= f.textField("name") %><% end %>
context.outputBuffer.append(
  context.formWith({ model: user }, (f) =>
    context.capture(() => {
      context.outputBuffer.append(f.textField("name"));
    }),
  ),
);
```

The helper receives the block as a callback whose **return value is a
SafeString** (the captured output). It can use that return value
directly (e.g. wrapping it in `<form>...</form>`) or call the
callback for side effects and read the buffer separately.

Block helpers that follow Rails' convention return their full
rendered output as a SafeString; the outer `append` writes it. No
double-write, because the inner `append` calls went to the captured
buffer, not the parent.

**`concat(value)` semantics.** Inside a block, helpers (and template
code) can call `context.concat(value)` to write to the _currently
active_ buffer — which is the captured buffer if inside `capture`,
otherwise the top-level one. Same as Rails' `concat` helper.

**`raw(value)` / `safe(value)`.** Both mark a value as html-safe (i.e.
wrap as `SafeString`). Rails has both `raw` (a view helper) and
`html_safe` (a String method); we expose `safe()` as a free function
(no monkey-patch) AND `context.raw()` (helper alias). They are
identical.

#### 2.10.4 Filename parsing — locale, format, variant, handler

Rails parses `<name>.<locale?>.<format>.<variant?>.<handler>` left-to-right
against **registered token lists**: known locales (`I18n.available_locales`),
known formats (`Mime::Type.lookup` keys), known variants (registered
via `request.variant`), and registered handlers. Anything that's not
in a known list is treated as part of `name`.

TSE adopts the same model:

- `Mime.formats` registers the known format tokens
  (`html`, `json`, `xml`, `text`, `js`, `css`, …).
- `I18n.availableLocales` registers locales (`en`, `de`, …).
- `LookupContext.variants` registers variants (e.g. `phone`, `tablet`).
- `Template.Handlers.registered` provides the handler list (`tse`,
  potentially `raw`/`html`/`builder` analogues later).
- Filename parser: split on `.`, take handler from the end (must be
  registered), then walk right-to-left for variant / format / locale
  tokens that match registered lists, leaving everything else as
  `name`.

Examples (all valid):

| Filename                 | Parse                                              |
| ------------------------ | -------------------------------------------------- |
| `show.tse`               | name=`show`, format=html (default), locale=default |
| `show.html.tse`          | name=`show`, format=html                           |
| `show.en.html.tse`       | name=`show`, locale=en, format=html                |
| `show.html+phone.tse`    | name=`show`, format=html, variant=phone            |
| `show.en.html+phone.tse` | full quad                                          |
| `users.index.html.tse`   | name=`users.index` (no token matches), format=html |

Ambiguity is resolved by registration: a token only acts as a
locale/format/variant if it's in the registered list at parse time.
Apps that register `en` as both a locale AND don't have an `en`
format don't trip over `show.en.tse` (locale wins because handler
parse already consumed `.tse`).

#### 2.10.5 Layouts and `yield`

Rails layouts wrap a template's rendered output. `<%= yield %>` in a
layout returns the inner template's `SafeString`. `<%= yield :name %>`
returns content captured by `<% content_for :name do %>...<% end %>`
elsewhere.

TSE port (exposed on `RenderContext`):

```ts
context.yield(); // → inner template output
context.yield("sidebar"); // → captured :sidebar content
context.contentFor("sidebar", () => {
  /* writes via concat */
});
```

The renderer captures the inner template's output before invoking the
layout, stores `:default` and named buffers on the context, and the
layout's compiled function reads them through `yield()`. Same flow as
Rails' `ActionView::Layouts`.

**Typed yield.** `RenderContext#yield(section?)` returns `SafeString`
for all section names; section-name typing (e.g. only `"sidebar"` |
`"footer"` for a given layout) is deferred — would require
layout-to-template binding info the renderer doesn't have at type
level today. Listed as a future enhancement.

#### 2.10.6 Partials and collection rendering

`context.render({ partial, locals })` dispatches to the
`TemplateRegistry`. Two overloads:

- **Statically known partial name** → typed locals via
  `TemplateLocals<TemplateRegistry[K]>`. Wrong locals are a tsc error.
- **Dynamic name** → falls back to `Record<string, unknown>` locals
  and a runtime registry lookup. Matches Rails' string-form dispatch.

Collection form (`render(@users)` in Rails):

```ts
context.render({ partial: "users/user", collection: users, as: "user" });
context.render({ partial: "users/user", collection: users }); // implicit as:
```

Counter (`user_counter`) and spacer (`spacer_template`) options match
Rails' `PartialRenderer` 1:1.

**Object-form partial inference (`render @users`)** — defers to
ActionView's polymorphic-routes equivalent (Phase 5 helpers). The
type signature accepts a typed model, and the renderer resolves
`Model.modelName.partialPath` to a path string at runtime. Listed
in the helpers tier.

#### 2.10.7 Streaming

`Tse.supportsStreaming = true` is the protocol claim, but the **default
emit shape** in §2.6 returns a single `OutputBuffer` synchronously. A
streaming emit variant is **deferred to Phase 3d** (renderer streaming):

- Streaming-emit shape: the compiled function becomes an
  `async function*` that yields chunks at each `safeAppend` /
  `append` call instead of accumulating in a buffer.
- Selection: the renderer decides at render time which emit variant
  to invoke based on response streaming flag. Both variants are
  emitted into the same `.tse.js` (two exports: `default` and
  `stream`).
- Until Phase 3d lands, `supportsStreaming` is technically true (the
  handler supports it) but the renderer doesn't yet exploit it.

This contradiction is acknowledged and tracked; not a fidelity miss
vs Rails (Rails' renderer is the same — handler supports streaming;
whether it's used is the renderer's call).

#### 2.10.8 Strict locals — preserve dual mechanism

Rails passes both `local_assigns` (Hash) and spread kwargs to the
compiled method. Templates can read either way. TSE ports both:

```ts
export default function render(
  context: RenderContext,
  locals: { name: string; count?: number },
): SafeString {
  // typed access:        locals.name
  // dynamic access:      locals["name"]
  // (both are the same object; no separate local_assigns hash needed)
  ...
}
```

We collapse `local_assigns` and the typed kwargs into a single typed
object because TS objects already support both keyed and dynamic
access via indexed type. No information loss vs Rails; one fewer
parameter.

#### 2.10.9 i18n `t()` and `cache do` blocks

- `context.t(".title")` — dotted lookup scoped to the template's
  virtual path (e.g. `users/show` → `users.show.title`). Implemented
  by passing the virtual path into `RenderContext` construction and
  having `t()` prefix-resolve. Phase 5 (helpers).
- `context.cache(key, block)` — Russian-doll fragment caching.
  Phase 6+, gated on `Digestor` (already a Phase 0.5 stub).

This is the contract we ship. Anything below that says "Rails has X, we
have Y" should match behavior, not just signature.

### 3.1 Handler protocol

| Rails                                                          | TSE                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Template::Handlers.register_template_handler(:tse, TSE)`      | `TemplateHandlers.registerTemplateHandler("tse", new TseHandler())` ([existing API](../packages/actionview/src/template/handlers.ts)) |
| `Template::Handlers::ERB#call(template, source) → String`      | `Tse.call(template, source): { code: string, sourceMap: RawSourceMap }`                                                               |
| `Template::Handlers::ERB#supports_streaming? → true`           | `Tse.supportsStreaming = true`                                                                                                        |
| `Template::Handlers::ERB#handles_encoding? → true`             | `Tse.handlesEncoding = true` (TS is UTF-8; mostly cosmetic)                                                                           |
| `Template::Handlers::ERB#translate_location(spot, bt, source)` | `Tse.translateLocation(spot, frame, source)` — uses sourceMap consumer                                                                |
| `Template::Handlers::ERB.erb_implementation` (class attr)      | `Tse.emitter` (replaceable)                                                                                                           |
| `Template::Handlers::ERB.erb_trim_mode = "-"`                  | `Tse.trimMode = "-"` (only `-` supported, matches Rails)                                                                              |
| `Template::Handlers::ERB.escape_ignore_list = ["text/plain"]`  | `Tse.escapeIgnoreList = ["text/plain"]`                                                                                               |
| `Template::Handlers::ERB.strip_trailing_newlines = false`      | `Tse.stripTrailingNewlines = false`                                                                                                   |
| `ActionView::Base.annotate_rendered_view_with_filenames`       | `ActionView.Base.annotateRenderedViewWithFilenames`                                                                                   |
| `default_format` (e.g. `:html`)                                | `Tse.defaultFormat = "html"`                                                                                                          |

Difference: our `call` returns `{code, sourceMap}` instead of a bare
string. Rails embeds source-map info as Ruby comments + relies on
`translate_location` walking tokens; we precompute a real source map for
tsc + dev tools. Drivers (`Template#compile`, error formatter) consume
both fields.

### 3.2 Runtime substrate

| Rails                                                        | TSE                                          | Notes                                                                 |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| `ActiveSupport::SafeBuffer`                                  | `SafeString` (activesupport)                 | Mark + propagate                                                      |
| `String#html_safe`                                           | `safe(s: string): SafeString`                | Free function (TS has no monkey-patch)                                |
| `String#html_safe?`                                          | `(v): v is SafeString` (instanceof)          | Used by `append`                                                      |
| `ActionView::OutputBuffer`                                   | `OutputBuffer extends SafeString`            | Mutable buffer that is itself html-safe (mirrors Rails)               |
| `OutputBuffer#safe_append=` (text)                           | `OutputBuffer#safeAppend(s)`                 | Raw concat, no coercion, no escape                                    |
| `OutputBuffer#append=` (default `<%=`)                       | `OutputBuffer#append(v)`                     | `to_s` coercion + HTML-escape unless `SafeString`                     |
| `OutputBuffer#safe_expr_append=` (`<%==` / text/plain `<%=`) | `OutputBuffer#safeExprAppend(v)`             | `to_s` coercion, no escape                                            |
| `OutputBuffer#<<` / `#concat`                                | `OutputBuffer#concat(v)` (alias of `append`) | Same dispatch rules as `append`                                       |
| `ERB::Util.html_escape`                                      | `escape(s: unknown): string`                 | Coerces non-strings via `String(...)`                                 |
| `ERB::Util.json_escape` (helper `j`)                         | `j(s: unknown): SafeString`                  | JS-string escaping, used inside `.js.tse` (handler does **not** wire) |

### 3.3 Magic comments

| Rails                                                         | TSE                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `<%# locals: (name:, count: 0) %>` (strict, defaults allowed) | `<%# locals: (name:, count: 0) %>` + optional `<%! types: { name: string; count?: number } !%>` |
| `<%# locals: () %>` → `**nil` (no kwargs allowed)             | `<%# locals: () %>` → no kwargs allowed (locals param `Record<never, never>`)                   |
| `<%# frozen_string_literal: true %>`                          | _no analogue_ — TS strings are immutable                                                        |
| `<%# encoding: utf-8 %>`                                      | _no analogue_ — UTF-8 only                                                                      |
| n/a                                                           | `<%! types: { ... } !%>` — extended (imports + generics allowed)                                |
| n/a                                                           | `<%! format: "json" !%>` — override filename-derived format                                     |

Parsing rule (mirrors Rails' `Template#strict_locals!`): the magic
comment is matched by a regex (`/<%#\s+locals:\s+(\{[^}]*\})\s+%>/` for
TSE) and `String.prototype.replace`'d out of the source before the
lexer constructs the AST. The type info is captured separately and
threaded into the emitted `.tse.ts` signature; the runtime `.tse.js`
never sees it.

### 3.4 Trim modes

| Rails (`-` mode only, the actionview default)                | TSE       |
| ------------------------------------------------------------ | --------- |
| `<%- code -%>` strip leading + trailing whitespace + newline | identical |
| `<%= expr -%>` strip trailing newline only                   | identical |
| `%>` (no dash) keep all whitespace                           | identical |

We deliberately do not ship `>` or `<>` modes Rails leaves disabled.

### 3.5 Error reporting

| Rails                                                              | TSE                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `Template::Error` with `#annotated_source_code` returning ±2 lines | `Template.Error` ditto, via stored sourceMap + source                |
| Backtrace points at `.erb:line`                                    | Backtrace points at `.tse:line` via source map                       |
| `MissingTemplate` (no handler match)                               | `MissingTemplate` (same shape)                                       |
| n/a                                                                | `StrictLocalsMismatch < Template.Error` — strict-locals runtime miss |

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

### Package ownership per phase

| Phase | New package or file?                                                  | Owning package             | Depends on              |
| ----- | --------------------------------------------------------------------- | -------------------------- | ----------------------- |
| 0a    | extract trails-tsc                                                    | `@blazetrails/trails-tsc`  | activerecord (existing) |
| 0b    | SafeString / OutputBuffer                                             | activesupport / actionview | —                       |
| 2a-0  | **new** `@blazetrails/tse-compiler` (lexer, AST, JS/TS/d.ts emitters) | `tse-compiler`             | activesupport           |
| 2a-1  | `Tse` handler class                                                   | `actionview`               | tse-compiler            |
| 2b    | `tse` plugin (file I/O + manifest writes)                             | `trails-tsc`               | tse-compiler            |
| 2c    | build CLI + watch + TS language service plugin                        | `trails-tsc`               | tse-compiler            |

Phase 2a-0 (the new tse-compiler package) is the largest single piece
and must land first; both 2a-1 and 2b depend on it but are independent
of each other and can land in parallel from sibling branches.

---

## 5. Fidelity checklist

Each implementation PR landing TSE pieces must check the box for every
item it claims to cover. The checklist is split into two parts:

- **5A — Rails fidelity.** Items verified against
  `vendor/rails/actionview/`. These are non-negotiable: deviation
  requires a documented rationale and approval.
- **5B — TS hygiene.** TSE-specific design decisions. Not present in
  Rails; defensible to revisit per implementation needs as long as
  the decision is recorded in this doc.

---

### 5A. Rails fidelity

**Handler protocol** (`lib/action_view/template/handlers/erb.rb`):

- [ ] `Tse.call(template, source)` strips encoding tag (TSE: no-op,
      documented).
- [ ] `Tse.call` reads `escape_ignore_list` and passes `escape:` option.
- [ ] `Tse.call` reads `strip_trailing_newlines` and `chomp!`s source.
- [ ] `Tse.call` reads `annotateRenderedViewWithFilenames` + format and
      emits BEGIN/END comments for html format.
- [ ] `Tse.supportsStreaming === true`.
- [ ] `Tse.handlesEncoding === true`.
- [ ] `Tse.translateLocation(spot, frame, source)` implemented (can be
      a stub returning frame as-is until ErrorHighlight equivalent lands).
- [ ] `Tse.trimMode`, `Tse.escapeIgnoreList`, `Tse.stripTrailingNewlines`,
      `Tse.emitter` all class-attribute-settable.

**Emitter** (`lib/action_view/template/handlers/erb/erubi.rb`):

- [ ] bufvar resolves to `context.outputBuffer`, not a local.
- [ ] `<%= %>` dispatches to `.append()` (escape) or `.safeExprAppend()`
      (no escape) based on `escape:` option — verified with paired
      `.html.tse` + `.text.tse` fixtures rendering the same expression.
- [ ] `<%== %>` always dispatches to `.safeExprAppend()`.
- [ ] Static text dispatches to `.safeAppend()` with backslash-escape of
      `'` and `\` in the emitted string literal.
- [ ] `BLOCK_EXPR` equivalent: `<%= helper do |...| %>...<% end %>` and
      `<%= helper { %>...<% } %>` emit without paren-wrap.
- [ ] Newline coalescing: consecutive `\n`-only chunks collapse into one
      `.safeAppend("\n\n\n")` call.
- [ ] `<%# %>` comments dropped entirely (no AST node, no emit).
- [ ] `<%% %>` / `%%>` produce literal `<%` / `%>` in output.
- [ ] Trim `-`: `<%- ... -%>` strips line, `<%= ... -%>` strips trailing
      newline only.

**Strict locals** (`lib/action_view/template.rb`, `strict_locals!`):

- [ ] Rails-style `<%# locals: (name:, count: 0) %>` matched via the
      same regex Rails uses (`/\#\s+locals:\s+\((.*)\)/`) and stripped
      from source before lex.
- [ ] Optional `<%! types: { ... } !%>` block parsed separately,
      sharpens the locals param type, coexists with the names line.
- [ ] Empty `<%# locals: () %>` enforces "no extra keys" — locals param
      typed `Record<never, never>` and runtime check rejects any keys.
- [ ] Defaults from the names line (`count: 0`) emit as TS default
      params in the compiled function signature.
- [ ] `NoExtraKeys<T>` helper applied to `locals` parameter so excess
      properties are rejected even for variable-typed argument values
      (not just object literals — see §2.5 caveat).
- [ ] Runtime `StrictLocalsMismatch` thrown when
      `raiseOnStrictLocalsMismatch` is on and `Object.keys(locals)`
      doesn't match declared set.

**Runtime substrate** (`active_support/safe_buffer.rb`, `lib/action_view/buffers.rb`):

- [ ] `SafeString` instance check; `safe()` wrapper; `escape()` HTML
      escape for `<`, `>`, `&`, `"`, `'`.
- [ ] `OutputBuffer extends SafeString` — itself html-safe.
- [ ] `OutputBuffer#append` html-escapes when arg is plain string,
      passes through when `SafeString`.
- [ ] `OutputBuffer#safeAppend` and `#safeExprAppend` never escape.
- [ ] Concatenating two `SafeString`s yields a `SafeString`.

**Filename parsing** (`lib/action_view/template/resolver.rb` +
`Mime::Type` registry):

- [ ] Filename `<name>.<locale?>.<format>.<variant?>.tse` parsed via
      registered token lists (see §2.10.4).
- [ ] Missing format defaults to `html`.
- [ ] `<%! format: "..." !%>` override honored when present.
- [ ] `escapeIgnoreList` consulted via parsed format, not filename string
      match.

**Helpers and capture** (`lib/action_view/helpers/capture_helper.rb`,
`lib/action_view/helpers/output_safety_helper.rb`):

- [ ] `RenderContext#capture(callback)` redirects `outputBuffer`,
      restores on finally, returns captured `SafeString`.
- [ ] `RenderContext#concat(value)` writes to currently-active buffer.
- [ ] `RenderContext#raw(value)` ≡ `safe(value)`.
- [ ] Block-form `<%= helper do %>...<% end %>` emits with `capture()`
      wrapper — no double-write (see §2.10.3).
- [ ] Nested partial renders inherit parent context's `outputBuffer`.

**Layouts and yield** (`lib/action_view/layouts.rb`):

- [ ] `<%= yield %>` returns inner template output via
      `RenderContext#yield()`.
- [ ] `<% contentFor("name", () => ...) %>` captures and stores by name.
- [ ] `<%= yield("name") %>` returns named capture or empty SafeString.

**Partials** (`lib/action_view/renderer/partial_renderer.rb`):

- [ ] Static partial name → typed locals via `TemplateRegistry`.
- [ ] Dynamic partial name → string form with `Record<string, unknown>`.
- [ ] `collection`, `as`, `counter`, `spacer_template` options match
      Rails 1:1.

---

### 5B. TS hygiene (TSE-specific decisions)

**TypeScript artifacts** (see §2.9):

- [ ] `.tse.ts`, `.tse.js`, `.tse.js.map`, `.tse.d.ts`, `.tse.d.ts.map`
      all emitted for every `.tse` source.
- [ ] `.d.ts.map` makes Go-to-Definition jump to `.tse` (not `.tse.ts`).
- [ ] `.tse.js.map` makes runtime stack traces report `.tse:line:col`.
- [ ] Ambient `declare module "*.tse"` shipped in
      `@blazetrails/actionview` so imports typecheck before first build.
- [ ] Emitted `.tse.ts` clean under `strict`,
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- [ ] Emitted `.tse.ts` uses only erasable syntax (passes
      `verbatimModuleSyntax`).
- [ ] `RenderContext` declared as an `interface` (augmentable), not a
      `type` alias.
- [ ] `TemplateRegistry` interface in `@blazetrails/actionview`;
      generated manifest augments it via `declare module`.
- [ ] `package.json#exports` for `*.tse` lists `"types"` before
      `"default"` so tsc picks the `.d.ts`.
- [ ] `tsconfig` template enables `allowArbitraryExtensions` and the
      `@blazetrails/trails-tsc/ts-plugin` plugin.
- [ ] `trails-tsc build` is a `pnpm prepare` dependency so fresh clones
      typecheck without manual steps.

When all boxes are checked and `api:compare` / `test:compare` show
non-negative deltas, the corresponding implementation PR is mergeable.

---

## 6. Resolved decisions (2026-05-21)

1. **Helper binding.** Helpers live on the `RenderContext` interface;
   render provides a typed instance; templates call `context.foo(...)`.
   See §2.10.2.
2. **Partials.** Dispatch via `context.render({ partial, locals })`
   with overloaded type signature — typed locals for known names,
   string-form fallback for dynamic. See §2.10.6.
3. **`.d.ts.map` production.** trails-tsc writes the `.tse.ts` shim and
   then invokes the TypeScript compiler API programmatically to emit
   `.d.ts` + `.d.ts.map` from it (with `declarationMap: true`). tsc
   owns the map format. Go-to-Definition jumps `.d.ts` → `.tse.ts` →
   `.tse` via the chain (tsc's `.d.ts.map` + our `.tse.ts → .tse`
   sourcemap composed by bundlers/editors). No hand-rolled VLQ.
4. **Diagnostics primary path.** Emitted `.d.ts` is the source of
   truth — tsc (CI + editor) consumes them. The TS language service
   plugin is an optional DX enhancer that adds live-update without
   a rebuild; it does NOT introduce a second diagnostic code path.
   CI and editor surface the same errors.
5. **`js` / `css` format escaping.** Matches Rails exactly: `<%= %>`
   html-escapes via `append()` like other non-text formats; authors
   call `context.j(value)` for JS-string escaping. Same XSS surface
   and idioms as Rails.
6. **Source-map format.** Default to sidecar `.tse.js.map`; allow
   inline base64 via a `--inline-source-maps` build flag for
   transitive-copy scenarios.

---

## 7. Open questions

1. **Dev-time reload mechanism.** `trails-tsc dev` re-emits `.tse.js`
   on file change, but the running server's reload story (Node
   `--watch` + import-cache bust vs bundler-driven HMR vs server
   framework hook) is **deferred to Phase 3 (renderer)**. Implementers
   should not block on this for Phase 2c — the build CLI ships the
   watch + emit half; the consume-side story is a Phase 3 deliverable
   bundled with renderer work.
2. **Compile-time error UX format.** When `<% expr %>` is invalid TS,
   the diagnostic format (terminal pretty-print vs editor squiggles
   vs CI annotation) needs a unified shape. Decision will live in
   `trails-tsc/cli/diagnostics.ts` during Phase 2c implementation.
3. **Typed `yield` section names.** `RenderContext#yield(section?)`
   currently returns `SafeString` for any section name. Layout-to-
   template binding info would let us type legal names per layout,
   but the renderer doesn't surface that at type level today. Future
   enhancement.
4. **Streaming emit shape.** Phase 3d will need a second compiled
   export (`stream` as `async function*`) alongside `default`.
   Confirmed deferred (see §2.10.7); not blocking Phase 2.
