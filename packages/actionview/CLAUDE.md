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
(`:18-19`). A `render` inside a string literal is not scanned. The answer keeps
`ERBTracker`'s shape (no `_` prefix), and `layout:` is still found by
`LAYOUT_DEPENDENCY`. No full JS parse is run, so a regex
literal, a JS comment, or a backtick nested inside `${}` in a render call's
arguments can still be misread.
