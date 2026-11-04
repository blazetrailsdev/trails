# actionview — Claude guide

Rules that bind inside `packages/actionview`. The repo-wide rules are in the
root [CLAUDE.md](../../CLAUDE.md).

## `TSETracker` answers what `RubyTracker` answers (`DependencyTracker::RubyTracker`)

Rails' `RubyTracker` reads a template's compiled Ruby through `RenderParser`
(`actionview/lib/action_view/render_parser/prism_render_parser.rb:6-37,84-88`),
and its three tests (`actionview/test/template/dependency_tracker_test.rb:274-302`)
are run against it only. No trails handler compiles to Ruby, so there is no
`RubyTracker`. By repo-owner ruling (2026-10-18), `TSETracker` answers those
three tests, and only those, instead: a `<%#` comment is not searched for `render`, a keyword-hash
`render` call whose options fail `render_call_options` is skipped, and a String
`spacerTemplate:` is a dependency ahead of the partial.

`parity:api` measures `ruby_tracker.rb` against `TSETracker` through a
`RUBY_FILE_TS_OVERRIDES` row: its pass admits `erb_tracker.rb`'s names, so
neither class's members read as moved.

The tracker reads render calls from `@blazetrails/tse-compiler`'s `parse`
node list, not the raw source: a `<%#` comment is its own node kind and is
never searched, and a `%>` closes a tag exactly where the compiler closes it.
Within each node, `renderCallOptions` mirrors `render_call_options`
(`prism_render_parser.rb:42-91`) over the node's JS text: parentheses are
unwrapped, one or two positional arguments are `{ partial, locals }`, a
keyword hash (an object literal or bare `key: value` pairs) must have only
identifier keys, the keys must intersect `RENDER_TYPE_KEYS` and lie inside
`ALL_KNOWN_KEYS` (camelCase), and the argument list is split at top-level
commas only, so a nested hash or a `key:` inside a string or ternary is not
read as an option. `renderDependencies` then takes `render_calls`'
`object:`/`collection:`-without-`partial:` skip (`:21-24`). The template is
`renderCallTemplate(options[renderType])` (`render_call_template`, `:97-135`):
a plain string, a backtick literal with each `${}` as `*`, or an
identifier/member chain or call, and a call with no template is skipped
(`:18-19`). A String `spacerTemplate:` or `layout:` is added as written
(`:26-32`). A `render` inside a string literal is not scanned, except inside a
backtick's `${}`. The answer keeps `ERBTracker`'s shape (no `_` prefix). An
argument list ends at a top-level ` do`, where Ruby's block begins. No full JS parse is run, so a regex
literal, a JS comment, or a backtick nested inside `${}` in a render call's
arguments can still be misread.

## Templates are precompiled (`Template#compile`'s `module_eval`)

Rails compiles a template at its first render: `compiled_source`
(`vendor/rails/v8.0.2/actionview/lib/action_view/template.rb:443-486`) wraps
the handler's Ruby in a `def`, and `compile` (`:500-539`) hands it to
`mod.module_eval(compiled_source, identifier, offset)`. JS can only evaluate
source text through `eval`, `new Function` or `vm`, each of which runs code
that was never type-checked, and a `with` scope chain is sloppy-mode only, so
it cannot appear in an ES module. By repo-owner ruling (2026-10-19,
2026-10-20), **file-backed `.tse` templates are precompiled in every
environment, and shipped code has no eval pipeline.** The split is:

- **`compileJs` is the Erubi step.** `@blazetrails/tse-compiler` turns TSE
  into JS, as Erubi turns ERB into Ruby.
- **The typed stand-in is `compiled_source`.** `virtualizeTse`
  (`packages/trails-tsc/src/plugins/tse.ts`) writes the method body, its
  locals binding (Rails' `locals_code`) and its strict-locals signature as a
  TypeScript module, and `build-views` (`trails-tsc-views build`) writes one
  for every `.tse` file, partials and unused templates included, into
  `.trails/views/` (`--in-place` beside the file, for a package's own
  templates). It builds each stand-in with the options `Tse#call` would use
  (annotation, trim mode, trailing newlines, escape-ignore), and a file under
  any other registered handler gets a module wrapping that handler's `call`
  output, built at build time.
- **`tsc` is the compiler.** `build-views` emits `<template>.js` with a source
  map chained back to the `.tse` file, so a backtrace names the template's own
  line (Rails' `identifier, offset`). `Application#initialize` turns on
  Node's source-map support (`setSourceMapsSupport`, through the process
  adapter) before any template module loads.

The loader reads a template's module from where `build-views` writes it by
default: an identifier under `<root>/app/views/` loads
`<root>/.trails/views/<path>.js`, and any other identifier loads
`<identifier>.js`, which is where `--in-place` writes outside an `app/views`
root; inside one it writes `.trails/views/`, so no module sits where an
autoloader reads code. A build with a custom
`--out` (`BuildViewsOptions.outDir`) or a views directory not named
`app/views` and not built in place is for type-checking only, and rendering
from it raises `LoadError`.

`Template#compile` keeps its name and call site. It loads the emitted module
with an awaited `import()` under a URL no earlier load used (the `rbFLoad`
shape), names the method after `method_name`, and seats it on
`mod._compiledMethods`; Rails' `SyntaxError` rescue and non-keyword strict
locals check follow as written. A JS function has no keyword parameters, so
the seated method raises Ruby's `missing keyword` / `unknown keyword` /
`no keywords accepted` `ArgumentError`s itself before it calls the module's
default export. ESM never evicts a module record, so each
compile keeps its module for the life of the process where Rails' redefined
method is collected. That growth is bounded by the number of compiles: a
template compiles once per `Template` object, and only a cleared template
cache (a development reload) compiles it again. A file-backed template with no emitted module
raises `LoadError` ("cannot load such file -- <path>"), and a string-source
template (`Template::Inline`, `render inline:`, a `Template` built from a
string) raises `NotImplementedError` from the same loader in
`packages/actionview/src/template.ts`. Test code compiles from source instead:
`packages/actionview/src/test-helpers/compile-template.ts` builds the same
stand-in, runs `transpileModule` and evaluates it, and the `other` vitest
project's setup installs it through `setTemplateCompiler`.

**`Template#spot` is line-based.** Rails' `spot`
(`vendor/rails/v8.0.2/actionview/lib/action_view/template.rb:231-246`) parses
`compiled_source` with Prism to find the failing node's span. trails builds no
second compiler, by repo-owner ruling (2026-10-19), so no in-process JS parser
stands in for Prism: `spot` answers the backtrace line of `compiled_source`,
from the reported column to the end of that line, and carries
`@missingRailsCall parse — PERMANENT` against this section.

This is a genuine language shortcoming, ratified repo-wide here. Code that
serves it cites this section, and a new instance is not a new decision to
argue.
