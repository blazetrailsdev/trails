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
oracle_. `@ruby/prism` works in Node. The AST-building registry (handlers emit
`ts.factory` nodes, printed by the TypeScript printer — see the re-baseline
note under [Coverage metric](#coverage-metric-the-feasibility-evidence))
translates **89.6% of AST node instances** across the 10 most-central AR files
with a real handler, with **parse-clean output by construction** (0 parse
errors) and **406/469 defs (86.6%) fully handled** end-to-end. But
node-instance coverage measures _handler presence, not semantic correctness_ —
the generated JS reproduces control-flow and call shape faithfully while
systematically mistranslating Ruby's metaprogramming and implicit-receiver
semantics. See [Honest limits](#honest-limits).

## Pipeline (fixed)

1. **Parse** — `@ruby/prism` v1.9 official JS/WASM build. Runs entirely in
   Node via WASI; **no Ruby subprocess**.
2. **Translate** — deterministic walk of the Prism AST through a handler
   registry. **No LLM.**
3. **Emit** — handlers build TypeScript AST nodes (`ts.factory`), printed by
   `ts.createPrinter` as plain JavaScript (`.js`, no type annotations); where
   repo conventions are TS-typed (the `this`-typed mixin pattern), we emit
   the runtime shape and drop the types. Because nothing can splice raw text
   into expression position, the output parses by construction.

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
is `(node, emitter) => ts.Expression | null` (statement-position kinds register
a parallel `(node, emitter, isLast) => ts.Statement[] | null`). Adding support
for a new Ruby construct means writing a handler module and calling
`registry.on("SomeNode", handler)` — there is **no central dispatch block to
edit**. Handlers recurse via `emitter.expr()` / `emitter.stmts()` rather than
dispatching themselves, so the registry is the single dispatch surface and
every dispatched node is counted exactly once.

Unhandled kinds **degrade gracefully but honestly**: the emitter emits a
`__PRISM_TODO("NodeKind")` marker call and counts the ENTIRE unhandled subtree
as passthrough (a handler may also decline a specific case by returning
`null`, with the same accounting). A file therefore always produces parseable
output; the tool never throws on an unknown node, and there is no raw-text
escape hatch through which invalid syntax could leak.

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
real handler; "passthrough" = instances that fell to the counted
`__PRISM_TODO` marker.

> **Re-baseline (AST emitter).** The original string-concatenation emitter
> reported 99.8% rollup coverage while its output carried **301 parse errors**
> across the 10 files (`oc.<<(x)`, `yield(...)` in module scope,
> `super(...arguments)` in free functions, statements inside class bodies):
> "handled" meant "a handler returned a string", not "valid JS came out". The
> emitter now builds TypeScript AST nodes (`ts.factory`) and prints them, with
> NO raw-text escape hatch: a handler either produces a well-formed node with
> already-decided semantics or declines, and declining counts the whole
> subtree as passthrough. The numbers below are lower **because they are now
> true** — and the output is parse-clean by construction (0 parse errors,
> asserted by `generateFromSource` on every run).

```text
file                               handled   nodes   defs=clean/all   tag
base.rb                             17.1%      187        0/0         pathological
relation.rb                         85.6%     1968       81/84        pathological
persistence.rb                      92.8%     1188       47/56        tractable*
associations.rb                     99.3%      285       10/11        pathological
relation/query_methods.rb           95.0%     3012      101/127       pathological
core.rb                             82.2%     1318       48/56        pathological
relation/finder_methods.rb          97.9%      956       38/43        tractable*
relation/calculations.rb            90.8%     1250       32/36        tractable*
inheritance.rb                      90.9%      473       19/23        pathological
model_schema.rb                     87.5%      607       30/33        pathological
--------------------------------------------------------------------------
ROLLUP (all 10)                     89.6%    11244    handled=10077 passthrough=1167
DEEP-DRILL (tractable*, 3 files)    93.5%     3394    defs 406/469 clean overall
```

`tractable*` marks the three deepest-drill targets (chosen by tractability): the
verdict rests on these, where deterministic codegen shows its ceiling on
ordinary method-body input — not on the macro-DSL files it drowns in.
`base.rb`'s 17% is the honesty bar working: its body is macro DSL
(`include`/`extend` chains inside `class Base`) that has no JS class-member
image — the old emitter printed it as statements inside a class body, which
was a parse error.

**`defs=clean/all`** is the new per-method attribution: defs whose body
emitted with ZERO passthrough nodes. 406/469 (86.6%) of defs are fully
handled — this set is the trustworthy denominator for any structural
comparison of generated output against the hand-written port (a diff inside a
tainted method can blame the generator; a diff inside a clean one cannot).

## Decided conventions (round 2)

Owner-decided semantics (previously declines or known-wrong output):

1. **Runtime shims are allowed.** `scripts/prism-codegen/runtime.ts` hosts
   `caseEq` (Ruby `#===` dispatch) and `range`; a generated file imports only
   the helpers it actually uses.
2. **`recv << x` → `recv.push(x)`** — the port's established idiom.
3. **Block protocol**: the implicit Ruby block becomes a trailing `block`
   parameter (added automatically to any def that yields or checks
   `block_given?`); `yield(args)` → `block(args)`; `block_given?` →
   `block !== undefined`; `&:sym` → `x => x.sym()`.
4. **Receiverless calls resolve to `self`.** Prism already distinguishes
   locals from method calls at parse time (a name with a local in scope is a
   `LocalVariableReadNode`; anything else receiverless is a `CallNode`), so a
   receiverless call is ALWAYS a self-call: `this.name(args)` inside a def
   (parens/args → call, parenless-zero-arg → property access, matching the
   port's getter convention). Attr-writer calls (`other.name = v`) become
   assignments; expression-position `raise` becomes an immediately-invoked
   throw. Module top-level macros (`require`, `include`) stay bare.
5. **Statement-position `super` in a module-level def is omitted** — the
   port flattens super chains at the composition point (e.g. Rails'
   `Associations#init_internals` body `super; @association_cache = {}`
   is ported as an `initInternals` free function holding ONLY the module's
   own contribution, with `base.ts` orchestrating the chain). Value-position
   `super` (`x = super`) still declines: the value flows, so omission would
   be lossy.

## Conformance scorer (`pnpm codegen:score`)

The convergence-guard v1: for every **clean** generated def (zero
passthrough), find its port counterpart and compare normalized body
skeletons — control-flow tokens plus callee/property reference names, with
`perform` prefixes, `is` predicate prefixes, `_` private prefixes, and
stdlib idiom tokens (`forEach`→`each`, `size`→`length`, `toA`→`toArray`, …)
canonicalized on both sides. Resolution chases exported functions, the
`perform*` mixin-map indirection, wrapper calls, and both predicate name
candidates — with an arity guard on fallback candidates (Rails `readonly?`
must not match the port of Rails `readonly(value)`) — and falls back to a
global index over `packages/activerecord/src` for methods ported into a
different file than the Rails twin (unambiguous hits only). Between exact
match and divergent sits a `reordered` tier (identical token multiset,
different order); on the current corpus it is empty — reordered-looking
bodies also differ by a token or two, so strict multiset equality
correctly refuses them.

Current baseline:

```text
file                        matched reordered divergent missing  conformance
relation.rb                      12         0        60       8      16.7%
persistence.rb                    7         0        37       3      15.9%
query_methods.rb                  4         0        62      34       6.1%
core.rb                           7         0        37       4      15.9%
inheritance.rb                    2         0        12       5      14.3%
finder_methods.rb                 0         0        31       7       0.0%
calculations.rb                   0         0        14      17       0.0%
(others)                          0         0        39       1       0.0%
TOTAL                            32         0       292      79       9.9%
```

27 defs resolve in a different port file than the Rails twin (missing
dropped from 104 with the global index; finder_methods alone went 26 → 7).
Conformance reads lower than the pre-index 10.7% because those cross-file
defs joined the denominator as mostly-divergent — more honest, not worse.

A stratified 33-def hand triage of the divergent set (verified against
vendor/rails and the port for the alarming cases) split roughly:
~48% port-deliberate restructure, ~21% tooling artifacts (now partially
fixed by the arity guard and token canon), ~9% already catalogued, and
~21% candidate untracked deviations — including three source-verified
finds (update_attribute! missing its readonly verification; a
verify_readonly_attribute error-class mismatch; column_for_attribute
returning a bare shape instead of NullColumn). The guard is mostly
signal, not cleanup.

(The first scorer run, before receiver resolution, measured 17/282/104 =
5.7% — resolving receiverless calls to `self` nearly doubled the match rate
with zero coverage change, confirming the scorer can attribute generator
improvements.)

Read this as the guard's review queue, not a failure grade: `divergent`
means the port's body structure differs from the Rails-faithful skeleton —
overwhelmingly the port realizing helpers inline (`take` inlining
`find_take`), reaching internals (`_records`/`_loaded`) the Rails source
reaches via methods, or remaining generator gaps (delegation
macros: Rails `Relation#name` delegates to `model.name` via `delegate`,
which the generator renders as `this.name`). `missing` covers methods ported into a _different_ file plus naming
paths the resolver does not chase yet. The 17 exact matches are the floor;
every generator improvement (receiver resolution, stdlib idioms) converts
divergent-for-generator-reasons rows into genuine signal about the port.

Dominant passthrough kinds (rollup, self-prioritizing the next handlers to
build): `CallNode` (operator methods with no JS image like `<=>`,
reserved-word bare calls, and lossy shapes the emitter declines — multi-arg
indexes, splat multi-assign), `ForwardingSuperNode` (value-position `super`
has no image in free functions), plus the argument/statement subtrees under
those declined parents.

**Caveat the numbers demand:** _node-handler_ coverage is still not
_correct output_. Leaf nodes (identifiers, literals, argument lists) dominate
the instance count and are trivially handled, which inflates the headline
number. Coverage is the right metric for "which handlers are missing", the
wrong metric for "is the output right". The honest correctness picture is
below.

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
   trails TS as the **source of truth**: for each Rails file it collects the
   async method-name set from the matching `.ts` (via `rubyFileToTs`) and marks
   the generated `def` `async` iff its twin is (see `async-source.ts`), awaiting
   calls to those names inside async bodies. The collector resolves both async
   declarations _and_ the Rails-name method maps the mixins install
   (`export const FinderMethods = { find: performFind }`,
   `{ count: inQueryConnection(performCount) }`, and alias chains) via a
   fixpoint over references — so `find`/`findBy`/`take`/`count`/`sum` come out
   async even though their impls are the differently-named `perform*` functions.
   For the relation family (`relation/*.rb`, `relation.rb`) it also reads
   `relation.ts`, since Rails mixes those modules into `Relation` and trails
   ports some methods (`pluck`/`ids`, defined in calculations.rb) directly onto
   the `Relation` class — but the `relation.ts` supplement is intersected with
   the method names the Rails file itself `def`s, so generic Relation async
   names the file merely _calls_ on other receivers (`Array#first`, `#one?`) are
   not swept in (the `await` rule is receiver-blind, so an unscoped union would
   await unrelated same-named calls). Remaining limits: (a) files with no port
   yet fall back to sync, and (b) `await` placement is file-local — a call to an
   async method defined in a _different_ file is not awaited.
4. **Ruby stdlib idioms pass through untranslated.** `attributes.collect { }`,
   `arr.first`, `Array(x)`, `raise` — emitted verbatim; no runtime shim.
5. **Metaprogramming is opaque.** `define_method`, `method_missing`, `send`,
   `class_eval` string-eval have no deterministic JS image and are left as-is.

The correct framing: this is a **first-draft scaffolder** that eliminates the
mechanical 60–70% of a port (shape, signatures, control flow) and leaves the
semantic 30–40% (receiver resolution, cross-file async, macro wiring, stdlib) to
a human — not an automated porter.

## What the diff-vs-port highlights

A **manual** comparison of each generated file against its trails counterpart
(method-name overlap, then classifying every non-overlapping symbol). This is
hand-run analysis, not a checked-in report — the reproducible version is the
guard story (item 7). For the 10 targets, every generated Rails-named symbol
absent from the port fell into one of these buckets, none of them a new
untracked deviation:

| bucket                   | examples                                                                                                | status                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Tracked API deviation    | `async_count`/`async_pluck`/`async_sum` family (trails uses an `{ async: true }` path)                  | in `call-mismatches-wide-exclude.json` |
| Tracked scoped-skip      | `build_count_subquery`, `perform_calculation` (realized inline)                                         | `SCOPED_SKIP` in `conventions.ts`      |
| Confirmed-equivalent     | `_create_record` (ported in `callbacks.ts`/`dirty.ts`, not `persistence.ts`)                            | `call-mismatches-exclude.json`         |
| Ruby object-protocol     | `encode_with`, `init_with`, `to_ary`, `initialize_dup`                                                  | `SKIP` in `conventions.ts`             |
| Generator false positive | `isExists`/`isAbstractClass` (port uses `exists`/`abstractClass`); cross-file symbols read as "missing" | not a deviation — generator artifact   |

The takeaway is not the (unverified) "zero residual" number but the _shape_:
the diff independently re-derives entries the deviation catalog already records,
which is why item 7 proposes formalizing it as a guard rather than trusting the
manual pass.

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
7. **Zero-deviation convergence guard** — the real north star for this repo is
   _no deviations_ from Rails, so the highest-value use of the generator is not
   its coverage % but a structural diff of the generated (Rails-faithful) JS
   against the trails port, **filtered by the deviation catalog**
   (`SKIP` / `SCOPED_SKIP` / the api-compare exclude lists) and by the
   generator's own known false-positive sources. Anything left is a candidate
   untracked deviation to converge, so the guard would act as a regression
   tripwire: a _newly_ ported file that silently renamed, inlined, or dropped a
   Rails method — without a catalog entry — would light up. A **manual** spot
   check of the 10 targets (not yet a reproducible command — that is the story's
   deliverable) found every diff resolving to either a catalogued exception or a
   generator artifact; see the worked table under
   [What the diff-vs-port highlights](#what-the-diff-vs-port-highlights). That
   result is unverified until the guard exists, so treat it as a hypothesis the
   guard must confirm, not an established fact. Prerequisites are the two
   false-positive suppressors: (a) predicate-candidate ambiguity
   (`exists?` → `["isExists","exists"]`; the generator picks the first, the port
   may pick either), and (b) file-scoped symbol lookup (a method ported into a
   _different_ file than its Rails home reads as "missing").

These are registered as stories under RFC 0065 in the `tasks` repo.

## What "accurate" and "working" would take

The spike stops at _shape_. Three escalating bars, each a real jump in
machinery:

- **More accurate (same architecture).** The generator artifacts above are the
  cheap wins: resolve the predicate-candidate choice against the port's actual
  symbol, index symbols across files (not per-file), and add the receiver
  resolution + stdlib-idiom passes already on the roadmap. This closes the _diff
  noise_ without changing what the tool fundamentally is.
- **Compiles.** Requires a type layer the deterministic walk cannot invent from
  Ruby: parameter/return types, generics, and the `this`-typed host interfaces
  the mixin pattern needs. The realistic route is to emit against the port's
  _existing_ type signatures (read the trails `.d.ts` / declaration for each
  method and graft its signature onto the generated body) rather than infer
  types from untyped Ruby.
- **Working (passes the ported tests).** This is where deterministic codegen
  hits its ceiling. Faithful _behavior_ needs the semantics Ruby computes at
  runtime and trails re-architected by hand: macro-DSL expansion into real mixin
  wiring, the async surface (already partly sourced from the port), Arel/query
  construction, and the dozens of small idiom shims. A deterministic walk can
  get a method body structurally right and still be behaviorally wrong wherever
  the port deviated for a reason (see `performFind`'s composite-PK handling vs
  Rails' thin `find`). The honest assessment: deterministic codegen can plausibly
  reach _compiles_ for the tractable, body-heavy files, but _working_ for the
  central AR surface is not reachable by AST-walking alone — it would need either
  an LLM in the loop (explicitly out of scope here) or so many hand-authored
  per-construct rules that the rules become the port. The durable value is
  therefore the **guard** (item 7), not autonomous porting.

## Deliverables map

- Tool: `scripts/prism-codegen/` — extensible registry, `pnpm codegen:generate`.
- Generated JS: `scripts/prism-codegen/out/` (**gitignored**; regenerate).
- TS→JS entrypoint: `pnpm codegen:from-ts <trails.ts>` prints generated JS for
  the corresponding Rails file, resolving via the existing `rubyFileToTs`.
- Coverage metric: per-file + rollup + passthrough leaders (above).
- This RFC.
- Follow-up stories: RFC 0065 epic (`tasks` repo).
