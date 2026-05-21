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
- `DtsEmitter` — AST → `.d.ts` + `.d.ts.map` for publishing.
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

| TSE                               | ERB                            | Meaning                                      |
| --------------------------------- | ------------------------------ | -------------------------------------------- |
| `<% stmt %>`                      | `<% stmt %>`                   | TS statement, no output                      |
| `<%= expr %>`                     | `<%= expr %>`                  | Output expr, HTML-escape unless `SafeString` |
| `<%== expr %>`                    | `<%== expr %>`                 | Output expr, never escape                    |
| `<%- stmt -%>`                    | `<%- stmt -%>`                 | Statement + trim surrounding whitespace      |
| `<%= expr -%>`                    | `<%= expr -%>`                 | Output + trim trailing newline               |
| `<%# comment %>`                  | `<%# comment %>`               | Dropped                                      |
| `<%% / %%>`                       | `<%% / %%>`                    | Literal `<%` / `%>`                          |
| `<%= helper do %>...<% end %>`    | `<%= helper do %>...<% end %>` | Block-form output expression — see below     |
| `<%# locals: { name: string } %>` | `<%# locals: (name:) %>`       | Strict locals — see 2.5                      |
| `<%! types: { name: string } !%>` | _(none)_                       | TSE-only — extended locals type spec         |

The two locals forms are equivalent at runtime; the `<%!  !%>` form is a
**brand-new opener** with no ERB analogue, so the lexer must explicitly
recognize `<%!` (mid-tag `!` is invalid Ruby in ERB but legal here). It
accepts arbitrary TS type syntax (generics, unions, imported types)
while `<%# locals: %>` is restricted to a single TS object literal for
parser simplicity. Pick one per file.

**Block-form `<%= %>`.** Same as Rails' `BLOCK_EXPR`. When `expr` ends
in `do ... |args|` or `{`, the emitter does NOT paren-wrap the call —
it routes the trailing block as-is so the helper captures it:

```tse
<%= formWith(model: user) do |f| %>
  <%= f.textField("name") %>
<% end %>
```

emits (sketch):

```ts
outputBuffer.append(
  formWith({ model: user }, (f) => {
    outputBuffer.append(f.textField("name"));
  }),
);
```

The lexer must detect the trailing `do` / `{` to switch emit modes; the
runtime helper convention is "block helpers take a callback as their last
argument" (matches actionview's `capture` semantics).

### 2.5 Strict locals

Rails enforces strict locals by **splicing kwargs into the compiled
method's signature** — Ruby's own kwarg validation then raises
`ArgumentError` on unknown keys, with no manual check in the handler.
Source-side, the magic comment is matched by
`STRICT_LOCALS_REGEX = /\#\s+locals:\s+\((.*)\)/` and `sub!`'d out of
`source` before Erubi sees it. Empty body (`<%# locals: () %>`) becomes
`**nil` — no extra kwargs accepted.

TSE mirrors this at two layers:

- **Compile time** (the primary enforcement): the trails-tsc plugin emits
  `.tse.ts` whose default export is
  `(context: RenderContext, locals: { name: string }): SafeString`. tsc
  rejects calls that omit `name`, pass the wrong type, or pass excess
  properties (TS' excess-property check is the structural equivalent of
  Ruby's "unknown kwarg" `ArgumentError`).
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
    "users/show.json": typeof import("./views/users/show.html.tse").default;
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

---

## 3. 1-for-1 API mapping

This is the contract we ship. Anything below that says "Rails has X, we
have Y" should match behavior, not just signature.

### 3.1 Handler protocol

| Rails                                                          | TSE                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Template::Handlers.register_template_handler(:tse, TSE)`      | `Template.Handlers.register("tse", Tse)`                                |
| `Template::Handlers::ERB#call(template, source) → String`      | `Tse.call(template, source): { code: string, sourceMap: RawSourceMap }` |
| `Template::Handlers::ERB#supports_streaming? → true`           | `Tse.supportsStreaming = true`                                          |
| `Template::Handlers::ERB#handles_encoding? → true`             | `Tse.handlesEncoding = true` (TS is UTF-8; mostly cosmetic)             |
| `Template::Handlers::ERB#translate_location(spot, bt, source)` | `Tse.translateLocation(spot, frame, source)` — uses sourceMap consumer  |
| `Template::Handlers::ERB.erb_implementation` (class attr)      | `Tse.emitter` (replaceable)                                             |
| `Template::Handlers::ERB.erb_trim_mode = "-"`                  | `Tse.trimMode = "-"` (only `-` supported, matches Rails)                |
| `Template::Handlers::ERB.escape_ignore_list = ["text/plain"]`  | `Tse.escapeIgnoreList = ["text/plain"]`                                 |
| `Template::Handlers::ERB.strip_trailing_newlines = false`      | `Tse.stripTrailingNewlines = false`                                     |
| `ActionView::Base.annotate_rendered_view_with_filenames`       | `ActionView.Base.annotateRenderedViewWithFilenames`                     |
| `default_format` (e.g. `:html`)                                | `Tse.defaultFormat = "html"`                                            |

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

| Rails                                                         | TSE                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `<%# locals: (name:, count: 0) %>` (strict, defaults allowed) | `<%# locals: { name: string; count?: number } %>`                |
| `<%# locals: () %>` → `**nil` (no kwargs allowed)             | `<%# locals: {} %>` → `Record<never, never>` (empty exact)       |
| `<%# frozen_string_literal: true %>`                          | _no analogue_ — TS strings are immutable                         |
| `<%# encoding: utf-8 %>`                                      | _no analogue_ — UTF-8 only                                       |
| n/a                                                           | `<%! types: { ... } !%>` — extended (imports + generics allowed) |
| n/a                                                           | `<%! format: "json" !%>` — override filename-derived format      |

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

## 5. Fidelity checklist (verify against `vendor/rails/actionview/`)

Each implementation PR landing TSE pieces must check the box for every
item it claims to cover. Citations are file paths in vendor (current
Rails main).

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

- [ ] Regex `<%# locals: { ... } %>` matched and stripped from source
      before lex.
- [ ] Empty `<%# locals: {} %>` enforces "no extra keys" via
      `Record<never, never>` (or excess-property check).
- [ ] Defaults: `<%# locals: { name?: string } %>` → optional param;
      missing pass-through.
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

**Format triple**:

- [ ] Filename `<name>.<format>.tse` parsed into `{name, format, handler}`;
      missing format defaults to `html`.
- [ ] `<%! format: "..." !%>` override honored when present.
- [ ] `escapeIgnoreList` consulted via parsed format, not filename string
      match.

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

## 6. Open questions

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
