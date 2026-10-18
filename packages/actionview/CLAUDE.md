# actionview — Claude guide

Rules that bind inside `packages/actionview`. The repo-wide rules are in the
root [CLAUDE.md](../../CLAUDE.md).

## `TSETracker` answers what `RubyTracker` answers (`DependencyTracker::RubyTracker`)

Rails' `RubyTracker` reads a template's compiled Ruby through `RenderParser`
(`actionview/lib/action_view/render_parser/prism_render_parser.rb:6-37,84-88`),
and its three tests (`actionview/test/template/dependency_tracker_test.rb:274-302`)
are run against it only. No trails handler compiles to Ruby, so there is no
`RubyTracker`. By repo-owner ruling (2026-10-18), `TSETracker` answers those
three instead: a `<%#` comment is not searched for `render`, a keyword-hash
`render` call with a key outside `ALL_KNOWN_KEYS` is skipped, and a String
`spacer_template:` is a dependency ahead of the partial.
`TSETracker#renderDependencies` carries `@inventedArm if — PERMANENT` and
`@inventedArm replace — PERMANENT` against this section.
