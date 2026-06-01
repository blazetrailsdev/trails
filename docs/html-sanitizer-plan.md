# `@blazetrails/html-sanitizer` plan

Rails parallel: [`rails-html-sanitizer`](https://github.com/rails/rails-html-sanitizer)
(Loofah + Nokogiri). Used by ActionView's `SanitizeHelper` (`sanitize`,
`strip_tags`, `strip_links`) and the `sanitize` route-constraint helper.

## Goals

- Provide the Rails-parity public surface: `SafeListSanitizer`,
  `FullSanitizer`, `LinkSanitizer`, plus the module-level configuration hooks
  ActionView reads (`safeListSanitizer`, `fullSanitizer`, `linkSanitizer`
  getters/setters mirroring `Rails::Html::Sanitizer.{...}_sanitizer`).
- Use [`sanitize-html`](https://www.npmjs.com/package/sanitize-html) as the
  engine. Pure JS, no jsdom, runs anywhere (Node, edge, workers).
- Keep the engine behind a thin internal seam so a future native port (or
  alternate engine) is a localized change, **without** shipping a public
  adapter API up front.

## Non-goals (for v1)

- A public, pluggable adapter interface. Engine choice is an implementation
  detail; we revisit if a real second consumer appears.
- DOMPurify support.

## Package layout

```
packages/html-sanitizer/
  package.json              # name: @blazetrails/html-sanitizer
  src/
    index.ts                # public exports
    safe-list-sanitizer.ts  # SafeListSanitizer
    full-sanitizer.ts       # FullSanitizer
    link-sanitizer.ts       # LinkSanitizer
    scrubber.ts             # Scrubber base class + PermitScrubber / TargetScrubber
    config.ts               # default allowed tags/attrs/schemes (Rails parity)
    engine.ts               # internal: translates our config → sanitize-html opts
    *.test.ts
```

`engine.ts` is the only file that imports `sanitize-html`. Swapping the
engine later means rewriting one file.

## Dependencies

- Runtime: `sanitize-html` (^2.x)
- Dev: `@types/sanitize-html`
- Consumers: `@blazetrails/actionview` declares `@blazetrails/html-sanitizer`
  as a **direct runtime dep**, matching Rails' `actionview.gemspec`
  (`s.add_dependency "rails-html-sanitizer", "~> 1.6"`). No conditional
  loading; `SanitizeHelper` imports the package normally. The ~30 KB cost
  is negligible vs. the ergonomic win of `pnpm install` resolving it
  automatically and parity with Rails' install graph.

## Public surface (Rails parity)

| Rails                                                                      | trails                              |
| -------------------------------------------------------------------------- | ----------------------------------- |
| `Rails::Html::SafeListSanitizer`                                           | `SafeListSanitizer`                 |
| `Rails::Html::FullSanitizer`                                               | `FullSanitizer`                     |
| `Rails::Html::LinkSanitizer`                                               | `LinkSanitizer`                     |
| `SafeListSanitizer.allowed_tags` / `.allowed_attributes` (class accessors) | static getters/setters              |
| `#sanitize(html, options)`                                                 | `sanitize(html, options?)`          |
| options: `:tags`, `:attributes`, `:scrubber`                               | `{ tags?, attributes?, scrubber? }` |
| `Rails::Html::Scrubber`                                                    | `Scrubber` base class               |
| `Rails::Html::PermitScrubber`                                              | `PermitScrubber`                    |
| `Rails::Html::TargetScrubber`                                              | `TargetScrubber`                    |

### Scrubber API

Rails' `Loofah::Scrubber` is a node-walker with `#scrub(node)` returning
`Scrubber::STOP | CONTINUE`. We mirror this with an abstract `Scrubber`
class:

```ts
abstract class Scrubber {
  abstract scrub(node: SanitizerNode): "stop" | "continue";
  // optional hooks matching Rails:
  allowedNode?(node: SanitizerNode): boolean;
  skipNode?(node: SanitizerNode): boolean;
  scrubAttribute?(node: SanitizerNode, attr: string): boolean;
}
```

`SanitizerNode` is a thin wrapper over whatever DOM the engine produces
(parse5-style AST from sanitize-html's internals, exposed via our own
neutral shape so engine swaps don't break user scrubbers). `PermitScrubber`
and `TargetScrubber` are concrete subclasses matching Rails' behavior.

Implementation note: `sanitize-html`'s `transformTags` / `exclusiveFilter`
hooks give us the seam to walk nodes; we adapt those callbacks into the
Scrubber interface inside `engine.ts`.

ActionView's `SanitizeHelper` wires these via module-level singletons; we
mirror that with a `sanitizer-registry.ts` (or similar) exporting
`safeListSanitizer()`, `fullSanitizer()`, `linkSanitizer()` plus setters.

## Default allowlists

Mirror Rails' defaults **verbatim** — copy
`SafeListSanitizer::DEFAULT_ALLOWED_TAGS` and `DEFAULT_ALLOWED_ATTRIBUTES`
from `rails-html-sanitizer` exactly. Encode in `config.ts` as plain
`Set<string>` / `Map<string, Set<string>>`. A parity test pins the sets
against the Rails source so drift is caught.

## Open questions

- **Tree-shaking.** `sanitize-html` is ~30 KB min+gz. Fine for server; if
  we ever target the browser bundle, revisit.
- **HTML5 entity handling parity.** `sanitize-html` and Loofah differ on
  edge cases (e.g., `&apos;` normalization). Document divergences in
  parity tests as they surface; don't chase them preemptively.
- **`SanitizerNode` shape.** The neutral wrapper exposed to user
  `Scrubber` subclasses. Minimal viable surface: `name`, `attributes`,
  `children`, `parent`, `remove()`, `replaceWith(html)`. Lock the shape
  before exposing — adding fields is easy, removing is breakage.

## PR breakdown

Target ~250 LOC each (CLAUDE.md ceiling 500, tests + fixtures count).
Each PR ships independently with its own tests; downstream PRs build on
the previous.

### PR 1 — Package skeleton + `FullSanitizer` + `LinkSanitizer`

- `packages/html-sanitizer/` with `package.json` (runtime dep:
  `sanitize-html`), `tsconfig.json`, `src/index.ts`.
- `config.ts` with verbatim Rails default tag/attr/scheme allowlists +
  parity test pinning them against the Rails source.
- `engine.ts` — minimal sanitize-html wrapper used by Full/Link in this
  PR (allowlist plumbing comes in PR 2).
- `FullSanitizer` — strip everything.
- `LinkSanitizer` — strip `<a>` tags and descendants.
- Tests mirroring Rails' `full_sanitizer_test.rb` and
  `link_sanitizer_test.rb`.

Rationale for bundling three things: skeleton + config + the two trivial
sanitizers comes in well under ceiling, and shipping the package alone
with nothing usable would be a tiny PR (see [[feedback_no_tiny_prs]]).

### PR 2 — `SafeListSanitizer`

- `safe-list-sanitizer.ts` — the bulk of the surface (`#sanitize`,
  `:tags`/`:attributes` options, default-allowlist merging).
- Engine wiring: allowed tags + attribute filtering, URL scheme guard.
- Tests mirroring `safe_list_sanitizer_test.rb`.

**LOC ceiling exception:** PR 2 is data-heavy (the Rails
`safe_list_sanitizer_test.rb` port is mostly fixture-style assertions
over allowlists, not new logic). Approved to exceed the 500 LOC ceiling
rather than splitting fixture data across PRs. Note the exception in
the PR body.

### PR 3 — `Scrubber` API

- `scrubber.ts` — abstract `Scrubber` base + `PermitScrubber` +
  `TargetScrubber`.
- `SanitizerNode` neutral wrapper (`name`, `attributes`, `children`,
  `parent`, `remove()`, `replaceWith(html)`).
- Engine wiring: adapt sanitize-html `transformTags` /
  `exclusiveFilter` callbacks into the Scrubber walk.
- `SafeListSanitizer#sanitize` accepts `{ scrubber }`.
- Tests mirroring Rails' `scrubber_test.rb`.

### PR 4 — Registry + ActionView wiring

- `sanitizer-registry.ts` — module-level `safeListSanitizer()`,
  `fullSanitizer()`, `linkSanitizer()` getters/setters mirroring
  `Rails::Html::Sanitizer.{...}_sanitizer`.
- Add `@blazetrails/html-sanitizer` to `@blazetrails/actionview`
  `dependencies`.
- Wire `SanitizeHelper` (`sanitize`, `strip_tags`, `strip_links`,
  `sanitize_css`) to call the registry.
- Move/port existing actionview sanitize tests to mirror Rails layout
  (`actionview/test/template/sanitize_helper_test.rb`).

## CI

No dedicated job. The package is small enough (~20 tests, <100ms) that
the existing `Unit Tests` job is fine — splitting it out wouldn't
meaningfully shorten any other PR's CI. Revisit if test count grows by
an order of magnitude.

## Risks / sequencing notes

- **PR 2 LOC exception.** Approved to exceed the 500 LOC ceiling — the
  bulk is fixture-style test data, not logic, and splitting it across
  PRs creates churn without review benefit. Flag the exception in the
  PR body so reviewers know it's intentional.
- **PR 3 SanitizerNode shape.** Lock the wrapper interface in this PR;
  it's part of the public Scrubber API and harder to change post-merge.
- **PR 4 is the only one that touches actionview.** Earlier PRs are
  self-contained in the new package, so they can land in parallel with
  unrelated actionview work.

## Recent-merge followups

- **PR 1** (#1974): ~5 LOC turn `isTrivialInput(html)` into a type predicate (`html is null | undefined | ""`) so the `as string` casts in `full-sanitizer.ts` and `link-sanitizer.ts` drop. When PR 3 (Scrubber) lands, replace curated `PRESERVED_TAGS` in `engine.ts` with an htmlparser2-based walker that supports real tag blocklists (~50-100 LOC + dep change) — closes the Loofah divergence.
- **PR 2 SafeListSanitizer** (#1978): ~20 LOC copy-on-write semantics for class-level allowlists — add `getAllowedTagsFor(ctor: typeof SafeListSanitizer): Set<string>` helper that walks prototype chain or caches per-constructor (Rails uses `class_attribute`; subclasses share parent's `Set` unless they explicitly assign). ~30 LOC + dep change for `sanitize_css(styleString)` — Rails' standalone CSS sanitizer via Loofah's Crass-backed scrub; sanitize-html has no equivalent. Candidates: `postcss` custom plugin (already a transitive dep), or `css.escape`-based whitelist. **PR 3 engine rework** — revisit divergences: `<script>`/`<style>` tag _contents_ unconditionally discarded by sanitize-html (Loofah preserves text — `<a><script>baz</script></a>` becomes `<a></a>` vs Rails `<a>baz</a>`); void-element self-closing (sanitize-html `<img src="foo" />` XHTML-style; Loofah `<img src="foo">`).
