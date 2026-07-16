# RFC 0065 — Prism-driven deterministic codegen from ActiveRecord Ruby → trails JS

- **Status:** Spike / exploratory (evidence-gathering, not a commitment to ship)
- **Area:** Tooling / infrastructure (NOT `docs/activerecord/` — that tree is
  frozen)
- **Tool:** `scripts/prism-codegen/` (`pnpm codegen:generate`,
  `pnpm codegen:from-ts <ts-path>`)

## Summary

This spike proves out a deterministic (no-LLM) source-to-source translator that
ingests Rails ActiveRecord Ruby and emits best-effort **JavaScript** — class /
module shape, imports, method signatures, **and attempted method bodies** —
following the Ruby→JS conventions this repo already encodes in
`scripts/api-compare/conventions.ts`. It answers three questions: (1) is
`@ruby/prism` viable in Node with no Ruby runtime, (2) can an extensible
handler-registry architecture translate the hardest AR files without drowning,
and (3) what does the coverage evidence say about productionizing this.

**Verdict:** Feasible as a _scaffolding accelerator_, not a _correctness
oracle_. `@ruby/prism` works in Node. The registry translates **99.8% of AST
node instances** across the 10 most-central AR files with a real handler (only
22 of 9,804 node instances fall to marked passthrough). But node-instance
coverage measures _handler presence, not semantic correctness_ — the generated
JS reproduces control-flow and call shape faithfully while systematically
mistranslating Ruby's metaprogramming and implicit-receiver semantics. See
[Honest limits](#honest-limits).

## Pipeline (fixed)

1. **Parse** — `@ruby/prism` v1.9 official JS/WASM build. Runs entirely in
   Node via WASI; **no Ruby subprocess**.
2. **Translate** — deterministic walk of the Prism AST through a handler
   registry. **No LLM.**
3. **Emit** — plain JavaScript (`.js`, no type annotations); where repo
   conventions are TS-typed (the `this`-typed mixin pattern), we emit the
   runtime shape and drop the types.

### `@ruby/prism`-in-Node feasibility finding

Confirmed viable. `loadPrism()` returns a parser that yields a fully-typed AST
whose node kind is `constructor.name` (`"CallNode"`, `"DefNode"`, …) with both
named field getters and a generic `compactChildNodes()`. Parsing all 10 target
files (≈9,800 nodes) is instantaneous. The only friction points, both handled:

- String/symbol literals expose decoded text as an object
  `{ encoding, validEncoding, value }`, not a bare string — must read `.value`.
- Node fields are own-enumerable properties, not prototype getters, so generic
  field introspection uses `Object.keys(node)`.

No Ruby runtime, no native addon, no subprocess. The `require("@ruby/prism")`
must resolve from the repo `node_modules` (WASI + the bundled `prism.wasm`).

## Architecture — the extensible handler registry

The architectural constraint was: **NOT** a giant switch/if-chain. Dispatch is a
`Map<nodeKind, Handler>` lookup (`scripts/prism-codegen/registry.ts`). A handler
is `(node, emitter) => string`. Adding support for a new Ruby construct means
writing a handler module and calling `registry.on("SomeNode", handler)` — there
is **no central dispatch block to edit**. Handlers recurse via `emitter.emit()`
rather than dispatching themselves, so the registry is the single dispatch
surface and every visited node is counted exactly once.

Unhandled kinds **degrade gracefully**: the emitter emits a marked
`/* TODO(NodeKind) */` and _still recurses into children_, so handled
descendants below an unhandled parent are emitted and counted. A file therefore
always produces output; the tool never throws on an unknown node.

Handler modules (grouped only for readability — the grouping has no dispatch
role):

| Module                    | Kinds                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `handlers/literals.ts`    | strings, symbols, numbers, booleans, nil, arrays, hashes, ranges, interpolation        |
| `handlers/expressions.ts` | calls (incl. operator-method → infix), var/ivar/cvar/const read+write, self, and/or    |
| `handlers/structure.ts`   | program, statements, module, class, def, parameters                                    |
| `handlers/control.ts`     | if/unless/while/until, case/when, return/next/break, begin/rescue → try/catch          |
| `handlers/misc.ts`        | splats, `super`, compound assignment, multi-assign targets, `defined?`, regex, `alias` |

Convention reuse: naming goes through `rubyMethodToTs` / `snakeToCamel` /
`rubyFileToTs` from `scripts/api-compare/conventions.ts` (the repo's source of
truth) — no parallel scheme. `def save!` → `saveBang`, `def valid?` → `isValid`,
`@x` → `this.x`, `initialize` → `constructor`. Module-level `def`s become
exported free functions (the mixin-as-function runtime shape, TS types dropped);
`def`s inside a `class` become method syntax.

## Coverage metric (the feasibility evidence)

Emitted by `pnpm codegen:generate`. "Handled" = AST node instances that hit a
real handler; "passthrough" = instances that fell to the marked TODO.

```text
file                               handled   nodes    tag
base.rb                            100.0%      136    pathological
relation.rb                         99.8%     1694    pathological
persistence.rb                      99.6%     1045    tractable*
associations.rb                     99.3%      276    pathological
relation/query_methods.rb           99.8%     2654    pathological
core.rb                             99.8%     1142    pathological
relation/finder_methods.rb         100.0%      833    tractable*
relation/calculations.rb            99.6%     1093    tractable*
inheritance.rb                      99.8%      405    pathological
model_schema.rb                    100.0%      526    pathological
------------------------------------------------------------------
ROLLUP (all 10)                     99.8%     9804    handled=9782 passthrough=22
DEEP-DRILL (tractable*, 3 files)    99.7%     2971    handled=2963 passthrough=8
```

`tractable*` marks the three deepest-drill targets (chosen by tractability): the
verdict rests on these, where deterministic codegen shows its ceiling on
ordinary method-body input — not on the macro-DSL files it drowns in.

Dominant passthrough kinds (rollup, self-prioritizing the next handlers to
build): `RequiredParameterNode` (8, block/lambda param contexts),
`InterpolatedSymbolNode` (2), `SourceFileNode`/`SourceLineNode` (`__FILE__` /
`__LINE__`, 2 each), then singletons: `ForwardingArgumentsNode` (`...`),
`LambdaNode`, `MatchWriteNode`, `InterpolatedRegularExpressionNode`,
`BackReferenceReadNode`, `NumberedReferenceReadNode`.

**Caveat the numbers demand:** 99.8% _node-handler_ coverage is not 99.8%
_correct output_. Leaf nodes (identifiers, literals, argument lists) dominate
the instance count and are trivially handled, which inflates the headline
number. Coverage is the right metric for "which handlers are missing", the wrong
metric for "is the output right". The honest correctness picture is below.

## File selection & ranking rationale

**Signal: membership in `ActiveRecord::Base`'s `include`/`extend` list**
(`base.rb:283-332`). Every module mixed into `Base` is, by construction,
depended on by every model — maximal dependency centrality. The Relation query
core (`relation.rb` + its `query_methods` / `finder_methods` / `calculations`
mixins) is the other hub: every lazy query flows through it. We ranked by that
centrality (not Zeitwerk `require` edges, which are near-absent under
autoloading), then chose the deepest-drill targets by **tractability**.

Tractability was scored by metaprogramming density (class-macro DSLs,
`define_method`, Builder dispatch, reflection). Deep-drill targets (all
`tractable`): **`persistence.rb`, `relation/finder_methods.rb`,
`relation/calculations.rb`** — method-body-heavy with ordinary control flow,
where deterministic codegen shows its best case. `base.rb`, `relation.rb`,
`associations.rb`, `query_methods.rb`, `core.rb`, `inheritance.rb`,
`model_schema.rb` are `pathological` (macro-DSL / reflection dominated).

## What translated well vs. the gaps

**Well** (see `relation/calculations.rb#pluck`, `finder_methods.rb#find`): class
and method scaffolding, imports, parameter lists (positional / optional-default
/ `*rest` → `...rest` / keyword → destructured object / `&block`), control flow
(`if`/`unless`/`case` → `if/else` chains, `begin/rescue` → `try/catch`), string
interpolation → template literals, operator-method calls → infix, compound and
logical assignment, blocks → arrow functions, `super` → `super(...arguments)`,
`case/when` → `caseEq(matcher, subject)` chains (Ruby `#===` order), and
`async`/`await` lifted from the trails port (source of truth, not inferred). The
tractable files produce genuinely readable, structurally faithful JS.

**Gaps** (see [Honest limits](#honest-limits)).

## Honest limits

Deterministic codegen **cannot** recover semantics that Ruby leaves implicit or
computes at runtime:

1. **Implicit receiver ambiguity.** A bare `valid?` could be a method call on
   `self` or a local read. The tool emits the identifier `isValid` (no `this.`,
   no `()`) because it cannot know. Every implicit-`self` method call is
   under-qualified.
2. **Class-macro DSLs are mistranslated as calls.** `base.rb` emits
   `include(Core)` / `extend(Querying)` _inside the class body_ — not valid JS
   class syntax, and not the repo's `Model.staticMethod = fn` mixin wiring. The
   macro _shape_ survives; the _mechanism_ does not. `has_many :posts` becomes
   `hasMany("posts")` — right name, but the repo realizes associations through a
   different declaration surface.
3. **Async is read from the port, not the Ruby.** Ruby has no `async`, so the
   tool cannot infer it from the source. Instead it treats the hand-ported
   trails TS as the **source of truth**: for each Rails file it scrapes the set
   of `async`-declared methods from the matching `.ts` (via `rubyFileToTs`) and
   marks the generated `def` `async` iff its twin is (see `async-source.ts`),
   awaiting calls to those names inside async bodies. This is faithful where a
   port exists; its limits are (a) files with no port yet fall back to sync, and
   (b) `await` placement is file-local — a call to an async method defined in a
   _different_ file is not awaited.
4. **Ruby stdlib idioms pass through untranslated.** `attributes.collect { }`,
   `arr.first`, `Array(x)`, `raise` — emitted verbatim; no runtime shim.
5. **Metaprogramming is opaque.** `define_method`, `method_missing`, `send`,
   `class_eval` string-eval have no deterministic JS image and are left as-is.

The correct framing: this is a **first-draft scaffolder** that eliminates the
mechanical 60–70% of a port (shape, signatures, control flow) and leaves the
semantic 30–40% (receiver resolution, cross-file async, macro wiring, stdlib) to
a human — not an automated porter.

## Productionization roadmap

Pursue only if the scaffolding value justifies it. Sequenced by the coverage
data (biggest correctness gaps first, not biggest node buckets):

1. **Receiver resolution pass** — a scope/symbol table so bare calls resolve to
   `this.x()` vs. a local. Highest correctness leverage.
2. **Async cross-file propagation** — the file-local source-of-truth scrape
   (`async-source.ts`) already marks `def`s async from their trails twin and
   awaits same-file async calls; extend it to a whole-program async manifest so
   calls into async methods defined in _other_ files are awaited too.
3. **Macro-DSL handlers** — translate `include`/`extend`/`has_many`/`validates`
   into the repo's actual mixin + declaration wiring instead of bare calls.
4. **Stdlib idiom mapping** — a Ruby-core → JS/trails-runtime shim table
   (`collect`→`map`, `Array()`, `blank?`, `raise`→`throw`).
5. **Long-tail handlers** — the passthrough leaders above (lambda/block params,
   `defined?` edge forms, back-references).
6. **Golden-output tests** — snapshot the generated JS per file so handler
   changes are reviewable.

These are registered as stories under RFC 0065 in the `tasks` repo.

## Deliverables map

- Tool: `scripts/prism-codegen/` — extensible registry, `pnpm codegen:generate`.
- Generated JS: `scripts/prism-codegen/out/` (**gitignored**; regenerate).
- TS→JS entrypoint: `pnpm codegen:from-ts <trails.ts>` prints generated JS for
  the corresponding Rails file, resolving via the existing `rubyFileToTs`.
- Coverage metric: per-file + rollup + passthrough leaders (above).
- This RFC.
- Follow-up stories: RFC 0065 epic (`tasks` repo).
