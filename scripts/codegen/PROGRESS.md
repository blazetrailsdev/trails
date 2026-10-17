# Codegen spike: activerecord Ruby → IR → TypeScript — progress log

Spike requested by the repo owner on 2026-10-15. Running log; newest entries last.
Measurements come from the repo's own parity tooling, not from eyeballing:

- `pnpm tsx scripts/codegen/src/cli.ts` — generate `packages/activerecord/codegen-out/src` + `report.json`
- `scripts/codegen/measure-tsc.sh` — `tsc --noEmit` over the generated tree (TS 7.1)
- `scripts/codegen/measure-parity.sh gen|hand` — swap the generated tree in as
  `packages/activerecord/src`, run `parity:api --package activerecord --calls`, restore
- `pnpm tsx scripts/codegen/src/summary.ts` — gen vs hand numbers + agreement

Reference (hand-written trails tree, same run of the tooling):
methods 6986/6986, files 296/296, inheritance 221/221, arity 3765/3765, params 2498/2498,
call-sets 4228/4250 equal, call args 5265/5330 equal.

## Step 0 — prior art read

RFC 0185 (IR generator, piloted on activejob, all stories draft, nothing built), the
retired 0065/0086 (Prism → JS in one pass, no IR, no types, 963 errors under checkJs,
name-keyed await/property tables), the 2026-10-06 audits (checker-based resolution
reaches 70–82% of call sites on activestorage; the unresolved remainder is untyped
receivers). Decision for this spike: build the IR front-end in Ruby (Prism is native
there) and lower in TypeScript, reusing `scripts/parity/conventions.ts`,
`operator-order-spelling.ts` and the call-gate idiom tables so names come from the
same rules the gates check. Typing starts as `any` everywhere and is measured.

## Step 1 — first end-to-end run

- IR front-end (`ruby/build-ir.rb`): all 306 AR files (`active_record.rb` +
  `active_record/**`), 0 unhandled Prism node kinds, 0.9 s.
- Generator: 306 Ruby files → 306 TS files, 4932 defs, 537 `declined()` markers, 1.9 s.
- tsc: 3169 errors (939 syntax), 288/308 files with errors.

| measure                  | generated         | hand      |
| ------------------------ | ----------------- | --------- |
| methods matched          | 5849/6986 (83.7%) | 6986/6986 |
| files                    | 296/296           | 296/296   |
| inheritance              | 201/222           | 221/221   |
| arity                    | 3186/3192         | 3765/3765 |
| param names              | 2478/2500         | 2498/2498 |
| call-sets equal to Rails | 4424/4487 (98.6%) | 4228/4250 |
| call arg lists equal     | 7834/8139 (96.3%) | 5265/5330 |

Agreement with the hand tree on the 4066 methods both define: identical call set
29.4%, mean call Jaccard 0.537, identical param names 74.2%, identical
control/call skeleton 28.5%.

Reading: on the parity gates the generator is already at or above the hand tree
for the methods it emits (it copies Rails' call structure literally); the gap is
coverage (1137 methods not credited) and typecheck.

## Step 2 — macro expansion

Biggest blocker after step 1: 1137 uncredited methods, nearly all macro-generated
surface (class_attribute 348, delegate 132, class_eval string templates 95, Struct 58,
`singleton_class.attr_accessor` ~138, plus ~330 credited transitively via include).

- Front-end: class-body loops (`CONST.each do |x| … end`) are **executed in Ruby**
  against a call recorder. Their receiver is evaluated in a sandbox whose constants
  come from the gem's own literal constant assignments (lazily, gem-wide, with an
  unsafe-source filter). Recorded `class_eval <<-CODE` strings are re-parsed with
  Prism and spliced in as IR; `define_method(name) { … }` becomes a def with the loop
  variable substituted; other macros become calls with literal args. 8/8 class-body
  loops in AR expand (incl. `Relation::VALUE_METHODS` + its template in query_methods.rb).
- Front-end: `X = Struct.new(:a, …) do … end`, `class X < Struct.new(…)` and
  `X = Class.new(Base) do … end` fold into class IR.
- Lowering: `class_attribute` / `mattr_*` / `cattr_*` / `thread_mattr_accessor` →
  `classAttribute.call(Host, "name", { instanceWriter: false, … })` — the shape the
  extractor credits; `singleton_class.attr_*` → static accessors / module functions;
  Struct members → constructor + accessor pairs.

| measure         | step 1       | step 2            |
| --------------- | ------------ | ----------------- |
| methods matched | 5849 (83.7%) | 6537/6986 (93.6%) |
| inheritance     | 201/222      | 203/222           |
| call-sets equal | 4424/4487    | 4597/4660         |
| call args equal | 7834/8139    | 7874/8179         |
| defs emitted    | 4932         | 5161              |

## Step 3 — remaining macro shapes, then typecheck

- Splatted constants in class-body macro args fold to literals in the front-end
  (`delegate(*QUERYING_METHODS, to: :all)`); `class << self; delegate …` → static
  delegators; defs inside `included do` hoist onto the module (`def self.x` → module
  function); attr names that are JS reserved words stay bare as property keys
  (`column.default`).
- Methods matched: 6537 → **6861/6986 (98.2%)**.
- Typecheck, worked from the largest diagnostic code down:
  - `declare` on index signatures; rest param followed by kwargs/block/post-required
    params (Ruby allows, TS does not) → prologue pops them off the rest array.
  - zsuper forwarded a `block` that did not exist; module functions read `this`
    instead of the module object.
  - Ruby method-scoped locals: hoist when first assigned inside a nested JS block;
    every generated local typed `any`.
  - `super()` hoisted above ivar writes when its arguments don't read `this` (the
    CLAUDE.md-sanctioned reorder); duplicate members (Ruby redefinition) keep the
    last definition; `new (expr)(…)` precedence; dependency module functions
    (`ActiveSupport.on_load` → `onLoad`, `Array.wrap` → `wrap`).

| measure                                 | step 2             | step 3          |
| --------------------------------------- | ------------------ | --------------- |
| methods matched                         | 6537 (93.6%)       | 6861 (98.2%)    |
| arity                                   | 3403/3409          | 3439/3473       |
| call-sets equal                         | 4597/4660          | 4786/4848       |
| call args equal                         | 7874/8179          | 7943/8206       |
| tsc errors                              | 3353 (1020 syntax) | 760 (4 syntax)  |
| files with tsc errors                   | 288/308            | 191/308         |
| agreement: identical call set with hand | 29.4%              | 34.0% (of 4712) |

## Step 4 — type layer: the hand-port oracle

Ruby states no types, and the audits showed untyped receivers are the dominant
cause of unresolved calls. Instead of hand-writing or tracing a hint sidecar, the
spike derives it from the existing port: `src/hand-oracle.ts` walks
`packages/activerecord/src` (deps via `.d.ts`) with the `typescript-5` checker and
records, per class/module (own members, `extends` walked at lookup), each member's
kind (getter / method / property), async-ness, return class and parameter types —
2329 classes, 2410 async own members, 23 s.

The lowering types receivers flow-insensitively from it — `self` (a mixin module's
`self` is its unique gem includer, `ClassMethods` the includer's static side),
`@ivar` slots, constants, `X.new`, locals' first typed assignment, method params
(from the twin's declared param types), `for…of` elements — and on a typed receiver:

- the member is looked up through the conventions candidates, so the emitted name
  is the hand port's own spelling, a getter is read as a property;
- a Promise-returning member is `await`ed and the enclosing function made `async`
  (a writer that awaits becomes `setX()`, per CLAUDE.md; an await in a constructor
  is a counted hard stop, `async-in-constructor`);
- truthiness uses `x` for booleans and `x != null` for objects, `rtest` otherwise;
  value `a || b` / `a && b` use `||`/`&&`/`??` when typed, else a once-evaluated temp
  (no thunks, so the right side can await).
- Declarations take the twin's shape: async, getter vs method, spelling.

Also encoded: CLAUDE.md's `ActiveRecord::Promise` rule (`Promise.new` /
`Promise::Complete.new` / `Promise.wrap` collapse to the value); Ruby-only regex
features (possessive quantifiers, conditionals) are declined after a
`new RegExp` probe at generation time.

## Step 5 — executing gem-defined macros

The remaining uncredited methods were generated by macros _defined in Rails_
(`define_column_methods :bigint, …` in schema_definitions.rb, ActiveModel's
`define_model_callbacks`). The front-end now collects every class-body `def` as
source, and a class-body call to one is executed: the macro body runs against a
recorder with its own module mixed in (so private helpers like
`_define_before_model_callback` run too) and ActiveSupport's core extensions
loaded; recorded `module_eval` strings are re-parsed, and recorded
`define_method` / `define_singleton_method` blocks are mapped back to their Prism
AST through `Proc#source_location`, with closure locals substituted from
`Proc#binding`. `define_model_callbacks :save, …` yields
`before_save(*args, **options, &block) = set_callback(:save, :before, *args, options, &block)`.

The diagnostic decline loop (`src/decline-loop.ts`, the plan's pass 8) replaces the
innermost statement (or a compound statement's header) at each diagnostic with a
`declined(…, "tsc-diagnostic", code)` marker and repeats; it converges in ~10 rounds.

### Step 4 measurement (swap check on the step-4 tree)

Replaceability is measured two ways (`src/swap-check.ts`, `src/swap-test.ts`):
each generated file is copied over its hand twin in a private copy of the
package and the whole package (tests included) is typechecked; files with zero
errors then get their own test files run with vitest in the real tree.

- 298 generated files with a hand twin: **50 swap in with zero type errors**;
  141 with ≤5; median 6 errors (p25 1, p75 19). 92 are clean themselves (errors
  only in consumers), 96 break no consumer.
- Of the 47 clean ones (re-run), 20 have their own test files; **6 pass all
  their tests** with the generated file in place (postgresql/oid/jsonb,
  postgresql/oid/vector, encryption/encrypting-only-encryptor, encryption/message,
  encryption/null-encryptor, encryption/read-only-null-encryptor). Failures are
  constructor ordering (`super(f(self))` — JS forbids `this` before `super()`),
  `Float::INFINITY` handling, Ruby `String` mutation, and missing static surface.

## Step 6 — consumer surface, typing refinements

- Module methods are emitted as exported `this`-typed functions with the module
  object referencing them (CLAUDE.md "Module mixins"), so consumers can import
  them: **consumer import coverage 51.5% → 93.7%** (`src/export-coverage.ts`:
  of the 1077 names hand files import from a sibling, 1009 are exported by the
  generated sibling; 255/291 files export everything consumers import).
- `Mod.x` for a module `def self.x` → direct call of the exported function;
  `klass.name` → `.name`; constant aliases (`OID = PostgreSQL::OID`); multi-segment
  ruby-compat roots (`Process::CLOCK_MONOTONIC`, `Concurrent::Map`); `Float::INFINITY`
  → `Infinity`, `ENV` → `process.env`; `DidYouMean::*` from `@blazetrails/did-you-mean`;
  `RUBY_COMPAT_EXPORTS` rows for core class methods (`Regexp.escape` → `regexpEscape`).
- String methods through ruby-compat's `rbStrSend` (its STRING_METHOD_TABLE);
  a bang method on a variable rebinds it (`([_r, value] = rbStrSend(value, "deleteSuffixBang", " BC")), _r`).
- `x op= v` goes through the operator lowering (array `|`, `+`); typed numeric /
  string operators stay native; typed `array + array` → spread.
- Locals take the type of their most recent assignment; `if x.is_a?(K)` narrows.
  `WhereClause#or` now lowers to `left = left.ast; if (left instanceof Arel.Nodes.Grouping) left = left.expr;`
  — the hand port's lines.
- Delegators are lowered as IR calls, so they dispatch through types too.
- A block that awaits, passed to an Enumerable method, runs sequentially via a
  runtime `rbAsyncEnum` (65 sites) instead of becoming an un-awaited async arrow.

| measure                                 | step 3        | step 6                                  |
| --------------------------------------- | ------------- | --------------------------------------- |
| methods matched                         | 6861 (98.2%)  | **6933/6986 (99.2%)**                   |
| arity                                   | 3439/3473     | **3516/3516**                           |
| param names                             | 2449/2471     | 2449/2471                               |
| call-sets equal to Rails                | 4786/4848     | 4849/4919 (98.6%)                       |
| call arg lists equal                    | 7943/8206     | 6810/7015 (97.1%; 52 shape, 153 naming) |
| `declined()` markers                    | 480           | 296                                     |
| tsc errors / files                      | 760 / 191     | 799 / 191 (0 syntax)                    |
| agreement: identical call set with hand | 34.0% of 4712 | 36.8% of 5934                           |
| consumer import coverage                | —             | 93.7%                                   |

## Step 8 — the generator reads `TS_CONSTANT_RENAMES` (2026-10-16)

`emit.ts` names a gem class by the table (`PostgreSQL::OID::Range` → `RangeType`),
and `resolve.ts` maps a dependency constant through `tsConstantRenameKey`,
lexically and for qualified relative refs (`Type::Binary::Data` inside
`ActiveRecord` → `BinaryType.Data`). tsc 827 → 800; every `ActiveModel::Type`
table name now resolves. The 10 remaining `typeof import(".../activemodel/dist/type")`
errors are `Helpers::Mutable` and `SerializeCastValue`, flat exports under their
own names, outside the table. Parity figures unchanged.

## Step 9 — dependency constants resolve to trails' flat exports (2026-10-16)

`Resolver.flatExportRef`: for an `ActiveModel::` / `ActiveSupport::` path (and a
relative path whose root is a dependency export), the deepest segment the
package exports is the import and anything below reads off it
(`ActiveModel::Type::Helpers::Mutable` → `Mutable`,
`ActiveModel::Type::SerializeCastValue` → `SerializeCastValue`). tsc 800 → 772:
29 errors gone, every `activemodel/dist/type` namespace error included, and one
new one that the resolution unmasked rather than caused —
`validations/numericality.rb:9` calls `super(record, attribute, value,
precision:, scale:)`, and trails' `ActiveModel` `NumericalityValidator#validateEach`
does not take those keyword arguments. Parity figures unchanged.

## Step 10 — String result types, `String#%`, Range index, skipped `super` (2026-10-16)

- `rbStrSend` answers `[unknown, string]`; the lowering now casts its result from
  the Ruby method's return (`STRING_RESULT_TYPES`: `gsub` → string, `gsub!` →
  `string | null`, `scan` → array, `bytesize` → number, …), and `typeOf` answers
  `string` for those calls, so chains (`s.sub(..).insert(..)`) stay on the string
  path. The cast applies only to a receiver known to be a String; the untyped
  `STRING_ONLY` guess can be another class's method (`StringScanner#scan`).
- `str % arg` on a String is ruby-compat `format(str, ...[arg].flat(1))`
  (`rb_str_format_m`: an Array is splatted, anything else, `nil` included, is the
  one argument).
- `x[a..b]` with a Range index goes through `rbAref` (still a runtime stub)
  rather than JS `[]`.
- A constructor whose Ruby `initialize` never calls `super` passes `undefined`
  for each required parameter of the nearest gem `initialize` above it, as the
  hand port's `PartialQuery` passes `""`.

tsc 772 → 691, no error that step 9 did not have.

## Step 11 — shadowed helpers, `first(n)`, `ActiveSupport::Inflector` (2026-10-16)

- `imp()` reaches a package helper the file shadows with its own declaration
  through a namespace import (`RubyCompat.take`, `ActiveSupportExports.pluck`),
  the hand port's `RubyCompat.except` shape (`relation/spawn-methods.ts`). A
  renamed import (`RbSum`) was tried first and cost a call-set row, since the
  gate matches the callee by name. `FinderMethods#take` / `#last` and `Calculations#pluck`
  had been calling themselves where Rails calls the Array helper. The two
  `calculations.ts` errors this adds are the real `pluck`'s spread typing, the
  same error `collection-association.ts` already has.
- `x.first(n)` is ActiveSupport's `first(str, n)` on a known String and
  ruby-compat `take(ary, n)` on a known Array; an untyped receiver keeps the old
  form (the oracle has no type for `Digest::SHA256.hexdigest`).
- `ActiveSupport::Inflector.underscore(x)` is activesupport `underscore(x)`: the
  namespace-function rule now runs before any receiver-helper rule could pass
  the namespace object as the first argument.

tsc 691 → 679.

## Step 12 — `each_slice`, `super do`, `map.with_index`, splatted pairs (2026-10-16)

- `ary.each_slice(n) { |s| … }` in statement position is
  `for (const s of eachSlice(ary, n))`, the hand port's form
  (`relation/batches.ts`, `has-many-association.ts`); in tail position a
  plain-identifier receiver is returned after the loop, as Ruby's block form does.
- `super do … end` with no arguments no longer forwards the method's own block as
  well: Ruby passes the literal block in its place (`association_relation.rb:44`).
- `ary.map.with_index { |x, i| }` (and `each` / `select`) is one JS call,
  `ary.map((x, i) => …)`. This adds six `with_index` call-set rows, the same six
  the hand port carries for the same sites; the old output only scored them by
  emitting a `withIndex(...)` call that did not type-check.
- A block-less `each_pair` is `rbEntries(h)`, and a block-less `each_with_index`
  is `Array.from(x, (e, i) => [e, i])`.
- `each` with a multi-parameter block splats each pair (`|label, value|`), as
  Ruby does: `rbEntries(r).forEach(([label, value]) => …)` (30 sites). It had
  been `forEach((label, value) => …)`, which binds the index to `value`.

tsc 679 → 670; calls 4860 → 4854 (the six `with_index` rows).

## Step 13 — `ENV`, negated blocks, alias signatures (2026-10-16)

- `ENV[k]` read through the index operator is activesupport `getEnv(k)`, and
  `ENV[k] = v` is ruby-compat `setEnv(k, v)`, the hand port's idiom
  (`database-configurations.ts:282`); the package has no Node types, so the raw
  `process.env` (34 errors) never type-checked. One remains, an `ENV[...]`
  multiple-assignment target in `test_databases.rb`. Two errors are new and were
  latent: `getEnv` answers `string | undefined` where `process.env` was untyped.
- `reject { }` / `reject(&:x?)`'s negating wrapper casts the block to a variadic
  type before forwarding `...xs`.
- An `alias` / `alias_method` forwarder declares the aliased method's own
  parameters (from the gem index) instead of `...args`, since a Ruby alias is that
  method under a second name; a method defined outside the gem keeps `...args`.
  Two dead ends first: spreading a value cast to `any` and `.apply(this, args)` are
  both still checked against the target's arity.

tsc 670 → 591; params 2449/2471 → 2478/2478.

## Step 14 — constructors inline their module hooks, with `@inlinedFrom` (2026-10-16)

Per CLAUDE.md § "A module's `initialize` is inlined into the constructor" (RFC
0188), the generator no longer reaches a module's `initialize` through a
runtime `rbCallSuper(this, "initialize", …)`:

- `Emitter.initializeChain` lists the module `initialize` bodies between a class
  and its superclass in Ruby's order (most recent `include` first, each followed
  by its own includes). A statement `super` in a constructor writes the next
  body in place (`Lowerer.inlineSuper`), its parameters bound to the call's
  arguments (evaluated outside the segment, so a parameter named like its
  argument does not read itself), a `*rest` / `(...)` forwarding what it took;
  the body's own `super` continues down the chain, and the chain ends at the JS
  `super(...)`, or at nothing for a class with no superclass (`Object#initialize`).
- A class with no `initialize` whose included module has one gets that body as
  its constructor (`Type::Date` / `DateTime` / `Time` ← `Internal::Timezone`).
- Dependency modules come from the Rails manifest (`rails-api.json`): one it
  records with no `initialize` (`ActiveSupport::Callbacks`) is transparent;
  one with an `initialize` (`ActiveModel::API`, `ActiveModel::Type::SerializeCastValue`)
  has its file's IR built by the same Ruby front-end and is inlined like a gem
  module.
- `Mod::ClassMethods#new` is inlined too: a body that post-processes `super`
  (`Deduplicable`: `super.deduplicate`) is a guarded tail return,
  `if (new.target === Klass) return this.deduplicate();`, the hand port's shape;
  one that answers `super` or another object (`Inheritance::ClassMethods#new`)
  runs at the head with `self` as `new.target`.
- Each inlined body from another Ruby file is tagged on the constructor,
  `@inlinedFrom Mod#hook rails/v8.0.2/<gem>/lib/<file>:<first>-<last>`, from the
  `def`'s span (gem) or the manifest's citation (dependency). A module whose
  `initialize` some class inlines no longer emits it as a function.
- An inlined segment whose first statement is the JS `super(...)` moves as a
  whole ahead of the first `this`, the sanctioned reorder
  (`NormalizedValueType`, matching the hand port).
- `class X < DelegateClass(...)` counts as having a superclass, so its explicit
  `super(...)` is a JS `super(...)`.

The generated tree carries every tag the hand port carries, with identical
citations (`Timezone` ×3, `QueryCache`, `DatabaseStatements`,
`ConnectionPoolConfiguration`, `SerializeCastValue`, `Deduplicable::ClassMethods#new`
×4) plus `Base`'s `Inheritance#new` → `Core` → `ActiveModel::API`, CLAUDE.md's
worked example. `measure-parity.sh` now also runs `pnpm parity:api:inlined` on
the swapped tree: OK. The two `rbCallSuper` calls left are Ruby's stdlib
`MonitorMixin` (not in the manifest; the hand port does not inline it either).
One new tsc error is real: the inlined `ConnectionPoolConfiguration#initialize`
names `Concurrent::AtomicFixnum`, the 0177 port the
`query-cache-version-is-an-atomic-fixnum` story waits on.

tsc 543 → 543 (net); calls 4854/4919 → 4861/4926; params 2480/2480.

## Step 15 — rebased onto main after the filed stories landed (2026-10-16)

trails#8976, #8977 and #8978 landed six of the seven stories this spike filed
(`query-cache-version-is-an-atomic-fixnum` still waits on the 0177
`AtomicFixnum` port). Rebased onto main, rebuilt, and regenerated the type
oracle and `pkg-exports.json` from the updated hand port.

- Errors the merged fixes removed: `Concurrent::AtomicBoolean` /
  `Concurrent::ReadWriteLock` (seated on ruby-compat's `Concurrent`, the path the
  generator already emits), `new Thread(frequency, block)`, the block
  `uniq(records, &:__id__)`, and numericality's `precision:` / `scale:`.
- #8978's `with_index` crediting rule cleared the six call-set rows of step 12.
- #8977's `DelegateClass(obj)` constructor exposed a generator bug: Ruby's
  `Kernel#DelegateClass` was lowered as `this.DelegateClass(...)`. It is now
  ruby-compat's `DelegateClass`, and every subclass type-checks (13 errors).
- The workspace build type-checks `scripts/`, which caught that the inliner read
  a parameter default as `p.value`; the IR field is `default`, so inlined bodies
  had been dropping Ruby parameter defaults.

tsc 543 → 525; calls 4868/4927 (59 mismatched); `parity:api:inlined` OK.

## Step 16 — activejob trial (2026-10-16)

See `scripts/codegen/TRIAL-ACTIVEJOB.md`. activejob: 369/369 methods, 186/186
call sets, `parity:api:inlined` OK; swapped in with the hand tests, 6/7 test
files fail at load on `ActiveJob::Callbacks`' `class << self; include
ActiveSupport::Callbacks`. activerecord after the trial's generator changes:
methods 6951/6987, inheritance 219/222, tsc 535 (10 of them inside the copied
`namespaces.ts`, which imports hand-only files a standalone check lacks).

## Step 17 — `class << self` in a module (audit module-singleton-callbacks, rule B) (2026-10-16)

Per the audit `module-singleton-callbacks-20261016T164539Z` (shape A):

- In a module, every `class << self` statement other than `def` / `attr_*` /
  `alias` / visibility runs with `self` the module's singleton class:
  `const XSingleton = rbObjSingletonClass(X)`, bound once and only when used.
  `include M` there is `include(XSingleton, M)`, never `extend(X, M)` (the two
  differ for every Concern). `ActiveJob::Callbacks` now reads
  `include(CallbacksSingleton, ActiveSupportCallbacks); CallbacksSingleton.defineCallbacks("execute")`,
  and the railtie's `singleton_class.set_callback` is
  `rbObjSingletonClass(Callbacks).setCallback(...)`.
- `delegate :m, to: :t` in `class << self` expands to `def m(*args, &block) = t.m(*args, &block)`
  module functions (activerecord `Type.add_modifier`: methods 6951 → 6952).
- In a class, `class << self; include/prepend M` declines
  (`sclass-include-on-class`): a JS class has no metaclass and `extend` would
  fire the wrong hook. No Rails site reaches it.

activejob's load now passes `Callbacks` and stops at `Serializers.addSerializers`.
Running the `:execute` chain still needs the filed story
`class-attribute-module-singleton-arm` (0189). activerecord unchanged otherwise
(tsc 535, no new or lost error; `parity:api:inlined` OK).

## Step 18 — activejob load-time crashes after `Callbacks` (2026-10-16)

Each fix moved activejob's load one module further (`swap-tree.sh`):

- `Serializers.addSerializers is not a function`: a module's singleton-side
  functions (`class << self` defs, `def self.x`, singleton attrs, singleton
  `delegate`) are exported and now also seated on the module object,
  `Object.assign(X, { … })`, the hand port's shape (activejob `serializers.ts:64`).
  `this`-typed instance mixin functions stay off it.
- `rbBinop` (an operator on untyped operands, here `Set#+`) has a real body in
  the generator's runtime shim: Array / Set `+ | - &`, numbers and strings,
  else the receiver's own operator method.
- `GLOBALID_KEY.toSym is not a function`: `to_sym` is the value itself on any
  receiver unless the gem defines `to_sym` (a Ruby Symbol is a JS string).
- `Core.ruby2Keywords is not a function`: a module body's
  `ruby2_keywords :m` is dropped; keywords are a trailing options object in trails.
- `base.delegate is not a function`: a statement `delegate :m, to: :t` with
  `self` a class (`included do`) is activesupport
  `delegate.call(base.prototype, "m", { to: "t" })`, the hand port's shape
  (activerecord `core.ts:89`).

Now stopped at `base.defaultPriority is not a function`, which is a trails gap,
not a generator one: `QueuePriority::ClassMethods` declares
`mattr_accessor :default_priority`, whose instance reader `Base` gets by
`extend`. activesupport's `mattrReader` / `mattrWriter` seat the instance side
on `target.prototype` (`packages/activesupport/src/module-ext.ts:90-91,117`), and
a ruby-compat `Module` has no `prototype` (its instance methods live on its
carrier), so a module target gets the module-level accessor only. activerecord
unchanged (tsc 535, no new or lost error; `parity:api:inlined` OK).

## Step 19 — generated activejob loads (2026-10-16)

Filed `mattr-accessor-on-a-module-skips-the-instance-side` (0189, p1) for the
trails gap step 18 stopped at. Generator fixes past it:

- `mattr_*` / `cattr_*` / `class_attribute` names are recorded as attributes
  (module- or class-level, and instance-side unless `instance_reader:` /
  `instance_accessor: false`), so `base.defaultPriority` is a property read, as
  activesupport ports them.
- A Concern's nested `ClassMethods` is seated on it, `X.ClassMethods = ClassMethods`,
  at the end of the file: the hand port's shape (actionpack
  `abstract-controller/callbacks.ts:352`), and what `Concern#append_features`
  reads to extend the includer (`around_enqueue` was missing on `Base`).
- `dump-exports.mjs` records dependency exports ported as an object with its
  own `new` (`TaggedLogging`, `Struct`); `X.new(...)` on those stays a call
  instead of becoming `new X(...)`.

With the hand tests swapped in, the package now loads: 3/7 test files and
12/29 tests pass (was 1/2 tests in one file). The rest are behaviour failures:
runtime stubs (`rbErrinfo`, `rbDelete`), an `instanceof` on a non-class, and
assertion differences. activerecord unchanged (tsc 535, no new or lost error).

## Step 20 — activejob behaviour failures, first pass (2026-10-16)

- A `when Const` / type test on a module (`GlobalID::Identification`), or on a
  dependency constant the oracle does not know as a class, is ruby-compat
  `rbObjIsKindOf` (Ruby's `Module#===` is `is_a?`, which answers for a mixed-in
  module); a known class keeps `instanceof`.
- `x.delete(k)` is `hashDelete` / `aryDelete` by receiver type (Hash when
  unknown): Ruby's `delete` answers the removed value. activerecord calls
  4870 → 4886 equal to Rails; tsc 535 → 534 (5 gone, 4 new from the typed
  `hashDelete` overloads).
- A constant directly under the gem namespace is seated on the hand port's
  namespace object, `rbModConstSet(ActiveJob, "Base", Base)` (activejob `base.ts:6`).

activejob swapped in with the hand tests: 5/7 test files, 15/29 tests pass.
What is left is `arguments.rb` (13 tests) and `gem_version` (1):
Ruby Symbol-vs-String hash keys (`each_key.grep(Symbol)`, `_aj_symbol_keys`),
which the hand port handles with deliberate idiom work (CLAUDE.md: a Symbol is a
JS string); `$!` read inside `DeserializationError#initialize`, which CLAUDE.md
ports as an explicit trailing `errinfo` threaded from each rescue site; and
Ruby `Enumerable` calls on a `Set` (`serializers.detect`) emitted as Array-only
JS methods.

## Step 21 — Symbol vs String keys, Enumerable on a Set (2026-10-16)

- **Symbols.** CLAUDE.md keeps a Symbol's leading colon only where control flow
  turns on `Symbol === x`, and the Ruby source cannot say where that is
  (activerecord tests `Symbol` alone in ~20 files whose hand ports read it as a
  plain string). The decision comes from the hand port: a file whose twin
  imports ruby-compat `isSymbol` uses the colon convention. There,
  `Symbol === x` is `isSymbol(x)`, `String === x` is a string that is not a
  Symbol, `to_sym` is `stringToSym`, and `to_s` is `symbolToS` on a Symbol.
  activejob `arguments.ts` now spells keys as the hand port does
  (`stringToSym(GLOBALID_KEY)`, `isSymbol(key) ? symbolToS(key) : …`); 8
  activerecord files switch, each one whose hand twin already uses `isSymbol`.
- `x.grep(C)` keeps the elements `C === e` holds for, through the type test;
  `&:to_s` / `&:to_sym` go through the same call lowering.
- **Set receivers.** Enumerable forms lowered to Array methods (`map`, `select`,
  `reject`, `detect`, `any?`, `all?`, `include?`, …) on a receiver not known to
  be an Array go through the shim's `rbEnum`, which turns a Set / Map into an
  array and passes anything else through (`serializers.detect` over the Set).
- The shim's `mapBang` (`map!`) and `eachWithObject` have real bodies.

activerecord: tsc 534 → 519. activejob: still 15/29 tests; each remaining
`arguments.rb` failure is its own gap: `Hash.ruby2_keywords_hash?`,
`with_indifferent_access`, an unresolved `DateTime` in `date_time_serializer.rb`,
and `$!` in `DeserializationError#initialize`.

## Step 22 — rebased after trails#8985 (2026-10-16)

trails#8985 landed `class-attribute-module-singleton-arm` (ClassAttribute's
attached-Module arm). Rebased, rebuilt, regenerated both oracles and
`pkg-exports.json`; both gems measure as in step 21 (activerecord tsc 519, no
new or lost error; activejob 369/369, 15/29 tests), since no hand test runs the
`:execute` chain. A throwaway probe against the generated tree (swapped in,
then restored) now passes: a `before` callback set on
`rbObjSingletonClass(ActiveJob::Callbacks)` runs ahead of the block and
`Callbacks.runCallbacks("execute", …)` answers the block's value, the
behaviour the audit `module-singleton-callbacks` predicted for shape A once
this story landed. `mattr-accessor-on-a-module-skips-the-instance-side` is
claimed, not merged.

## Step 23 — test mode: `callbacks_test.rb` (2026-10-16)

`cli.ts --tests cases/callbacks_test.rb` ports a Rails test file and,
transitively, the fixtures it `require`s (`jobs/callback_job.rb`,
`jobs/abort_before_enqueue_job.rb`). Shared front-end and lowering; what is new:

- Paths: `test/cases/x_test.rb` → `src/x.test.ts` (test-compare's mapping,
  `compare.ts:201`); `test/jobs/…` → `src/test-helpers/jobs/…` (the
  `port-activejob-test-fixture-jobs` location). Fixtures go through the ordinary
  class emitter.
- `class XTest < ActiveSupport::TestCase` → `describe("XTest")`; `test "…" do`
  → `it("…", async)` with the name verbatim (`def test_a_b` → "a b",
  extract-ruby-tests.rb); `setup` / `teardown` → `beforeEach` / `afterEach`.
- Test mode: minitest assertions become the `expect` forms
  `scripts/test-compare/assertion-kinds.ts` scores back to them
  (`assert_equal e, a` → `expect(a).toEqual(e)`, `assert_nil` →
  `expect(x ?? null).toBeNull()`, `assert_raises` → `rejects.toThrow`, …), and
  every other call is awaited (construction excepted).

Generator fixes the trial needed, all general:

- `Class.new(Super) do … def m … end` emits the `def`s as members of the class
  expression (it declined before).
- A callback macro's Symbol filter is `":" + camelName` (activesupport's
  callbacks read a filter as a Symbol only with the colon; the hand ports'
  `beforeValidation(":setBeforeValidationMarker")`), and its block is
  `instance_exec`ed: a `function` with `this` as `self`.
- `included do` bodies are indexed (their `class_attribute`s answer through the
  module), and `self.class.x` resolves on the owner's class side.
- `new(...)` in a `ClassMethods` module is `new this(...)`.
- Ruby `Time` / `Date` / `DateTime` are `@blazetrails/date`'s (`RubyTime`, the
  hand port's spelling); `Time.zone` / `use_zone` / `find_zone` are
  activesupport's functions.
- `isAttrLike` is arity-aware (a `def x(arg)` elsewhere does not make a
  zero-argument `x` a method), and a name only declared as a getter / property
  on the oracle's dependency classes is a property (`logger.formatter`).
- `run_callbacks` is awaited (activesupport's `runCallbacks` answers a promise
  when a callback is async), and async propagates through the gem: an emission
  pass records which methods await, and passes repeat until none turns async.
  A resolved async gem method is now actually awaited (the `ctx.async` gate was
  never set).
- A block passed to a gem method with skipped optional positionals pads them
  with `undefined` (`instrument(:enqueue, &block)` against
  `instrument(operation, payload = {}, &block)`, CLAUDE.md's slot rule).
- The shim's `rbAppend` (`<<`) has a real body.

Result, generated tree swapped in: the generated `callbacks.test.ts` loads and
3/8 of its tests pass (the three `perform` tests); the five `enqueue` tests fail
inside activesupport's around-callback sequencing (`invokeSequence`) while
running `Instrumentation`'s / `Logging`'s `around_enqueue` blocks: runtime
behaviour of the generated library, not of the test port. activerecord: tsc
519 → 515, calls 4886 → 4887 equal; two new TS2524 (an awaited
`run_callbacks` in a parameter default).

## Step 24 — the `enqueue` failure, followed to the end (2026-10-16)

The generated `callbacks.test.ts` now passes 8/8 with the generated tree
swapped in, with no unhandled rejections from the jobs the async adapter runs
in the background. Each fix was the next thing in the path, and each is general:

1. **The callback chain held its options as a filter.** activesupport's
   `setCallback` tells a block from one more positional filter by ruby-compat's
   `block()` brand (`rbBlockGivenP`), so `around_enqueue(prepend: true) { … }` put
   `{ prepend: true }` in the chain. A block passed behind a splat is now branded
   (`...(blk != null ? [rbBlock(blk)] : [])`; a nil `&blk` passes nothing),
   imported as `rbBlock` so a local named `block` cannot shadow it (`tag_logger`
   had called its block with itself).
2. **`throw :abort` was uncaught.** A Symbol `throw` / `catch` tag keeps its colon
   (`kernelThrow(":abort")`, the hand port's spelling and what activesupport
   catches).
3. **`self.queue_adapter = :async` overwrote a method.** A writer `def x=` in a
   module is the `setX` function; an assignment that resolves to one calls it.
4. **`QueueAdapters.lookup` found nothing.** `const_get` is ruby-compat
   `rbModConstGet`; every constant is seated on its parent when that parent is a
   hand-port `namespaces.ts` object (seating on a parent read from its own file
   closed an import cycle); `autoload :X` is `Parent.autoload("X"[, path])` plus a
   bare side-effect import of X's file (a named import is dropped by the TS
   transform), except for constants the hand `namespaces.ts` already autoloads
   (it decides their loading) and files with an unresolved-constant decline
   (`sidekiq_adapter.rb`: Ruby loads it only on lookup); a namespace read through
   the seat is typed `any`; `eager_autoload do … end` is lowered in place.
5. **`DEFAULT_EXECUTOR_OPTIONS.merge` was not a function.** A gem constant whose
   value is a Hash / Array literal is data, so core calls apply
   (`{ ...Scheduler.DEFAULT_EXECUTOR_OPTIONS, ...options }`).
6. **`queue_adapter.try(:check_adapter)`** is activesupport `tryCall(x, "checkAdapter")`
   (`try!` → `tryBang`, block form → `tryWith`), the hand port's spelling.
7. **`instance_exec`** (`jsInstanceExec`) has a runtime body.
8. **Background jobs rejected through `rbErrinfo`.** A bare `raise` in a `rescue`
   arm re-throws the caught exception.
9. **`I18n.locale` was read as a property** because the gem has an
   `attr_accessor :locale`; the gem's attr names no longer decide members of a
   dependency constant.
10. Test mode now applies only to files under the gem's `test/` (it had turned
    `lib/active_job/test_case.rb`'s `ActiveJob::TestCase` into a `describe`).

activejob: tsc 41 → 38; with the hand tests, 24/37 pass (callbacks 8/8; the
hand `arguments` file still 2/14, `gem_version` 0/1). activerecord: tsc 515 → 511,
calls 4887 → 4897 equal to Rails, `parity:api:inlined` OK.

## Step 25 — second test file: `queue_priority_test.rb` (2026-10-16)

`cli.ts --tests cases/callbacks_test.rb,cases/queue_priority_test.rb`. New
fixtures generated: `jobs/configuration_job.rb`, `jobs/hello_job.rb`,
`support/job_buffer.rb` (no hand port of any of them yet).

- `require_relative "../support/job_buffer"` is followed relative to the
  requiring file.
- `support/job_buffer.rb` reopens `ActiveSupport::TestCase` to add a `teardown`;
  that is a top-level vitest `afterEach` in `test-helpers/support/job-buffer.ts`,
  which applies to every test file importing it (the reopen's scope).
- A block a test hands to a gem method is a `this`-bound function: Rails keeps
  `queue_with_priority { arguments.first == "1" ? 99 : 11 }` and
  `QueuePriority#priority` `instance_exec`s it on the job.
- Ruby `Array#clear` / `Hash#clear` is the shim's `clear`, reached as
  `CodegenRuntime.clear(x)` so the call keeps Ruby's name (an `rbClear` spelling
  cost activerecord six call-set rows; the receiver-as-argument adds 11
  argument-naming rows).

Result, generated tree swapped in: `queue-priority.test.ts` 4/6, `callbacks.test.ts`
still 8/8 (28/43 tests overall). The two failures ("is assigned when
perform_now / perform_later") are a shape question, not a lowering bug: Rails'
job has `def priority` (QueuePriority, a reader that `instance_exec`s a stored
Proc) and `attr_writer :priority` (Core). Ruby keeps them as two methods; JS has
one property per name, so `self.priority = 123` leaves a number that shadows the
reader and `job.priority()` fails. CLAUDE.md's answer for a zero-argument reader
is one accessor carrying both halves; across two modules that needs a decided
mechanism. activerecord: tsc 511, calls 4897, unchanged.

## Step 26 — rebased after trails#8987 (2026-10-16)

trails#8987 landed `mattr-accessor-on-a-module-skips-the-instance-side`.
Rebased, rebuilt, regenerated both oracles and `pkg-exports.json` (no data
change). A probe against the swapped-in generated tree: `Base.defaultQueueName`
now answers `"default"` through `QueueName::ClassMethods`' `mattr_accessor`
(it read `undefined` before); `defaultPriority` / `priority` answer `undefined`,
Rails' `nil` defaults. Test counts unchanged (28/43; callbacks 8/8,
queue_priority 4/6): the two remaining `queue_priority` failures are the
reader/writer shape of step 25. activerecord unchanged (tsc 511, calls 4897).

## Step 27 — third test file: `rescue_test.rb` (2026-10-16)

`cli.ts --tests cases/callbacks_test.rb,cases/queue_priority_test.rb,cases/rescue_test.rb`.
New fixtures: `jobs/rescue_job.rb`, `models/person.rb`, and `helper.rb` itself,
which every test file `require`s.

- **`helper.rb`.** Its top-level constant statements are emitted
  (`GlobalID.app = "aj"`, `ActiveJob::Base.include(EnqueueAfterTransactionCommit)`),
  and its `require "adapters/#{@adapter}"` is the default `inline` adapter
  (`adapters/inline.rb`, `ActiveJob::Base.queue_adapter = :inline`). Requires in
  its `ENV` branches are not followed. Before this the ported tests ran on the
  `async` adapter, which Rails' suite never uses; `callbacks_test` stayed 8/8
  once the async fixes below landed.
- **`rescue_from` blocks** are `instance_exec`ed (`rescuable.rb:117-121`):
  `this`-bound functions. A dependency method taking `*rest` and a block (Rails
  manifest) gets its block branded with `rbBlock`, so `rescueFrom`'s
  `rbBlockGivenP` sees it.
- **Async.**
  - A bare call in a module whose own ancestors do not define the name
    (`Execution#perform_now` → `Core#deserialize_arguments_if_needed`) resolves
    to the unique gem module that does; the same for an attr read
    (`Instrumentation` reading `Core#scheduled_at`).
  - A call on an untyped receiver (`queue_adapter.enqueue(self)`, `job.enqueue`)
    is awaited when any gem method of that name is async, unless the hand port
    defines a member of that name (its oracle types the call then). Without
    that guard activerecord took ~1,000 new awaits (`arel`, `column`,
    `synchronize`) and went tsc 511 → 623, calls 4897 → 4883.
  - A gem method that yields hands back its block's value, so a block that
    became async makes the call awaited (`instrument(…) { enqueue }`).
  - The type oracle reads `@blazetrails/globalid` and `i18n` too, so
    `Locator.locate` (async in trails) is awaited.
- **`$!`** (CLAUDE.md "`$!` is passed explicitly"): a constructor whose
  `initialize` reads `$!` takes a trailing `errinfo` parameter, and a `raise` of
  that class inside a `rescue` passes the rescued error. Every `raise Const` in a
  `rescue` is `throw excSetupMessage(new X(…), err)`, Ruby's implicit `cause`.
  `backtrace` / `set_backtrace` are `excBacktrace` / `excSetBacktrace`.
- Smaller: a writer test for `def ==` (an operator ending in `=` returns its
  body), `==` on a string skips the `rbStrSend` table, `Exception#cause` is the
  JS property, `obj.class.name` on another object in a ported test is `rbModName`
  (the Ruby path, `Person::RecordNotFound`; in lib the call gate credits `name`), `URI::GID::X` is globalid's flat export, a writer on
  an included concern's `ClassMethods` is `setX`, a dependency class-level writer
  with a flat `setX` export calls it (`GlobalID.app=` → `setApp`), a local named
  `hash` / `h` / `*_hash` takes `size` / `hasKey` for `size` / `include?`.
- `swap-tree.sh` takes `SWAP_TESTS=<glob>` to run one test file, under a
  timeout (a synchronous retry loop had run a worker out of memory).

Result, generated tree swapped in: `rescue.test.ts` 5/5, `callbacks.test.ts` 8/8,
`queue-priority.test.ts` 4/6 (the reader/writer story, unchanged); 34/48 overall
(was 28/43), the hand `arguments` test "wraps a deserialization failure, keeping
the cause" now passing too. activejob tsc 37. activerecord unchanged: tsc 511,
calls 4897/4939, args 6631/6835 (two fewer lists compared, no new mismatch).

Trails deviation seen, not filed: globalid spells `GlobalID.app=` as a flat
`setApp` (globalid: `class << self; def app=(app)`, `vendor/globalid/v1.3.0/lib/global_id/global_id.rb:31`).

## Step 28 — four more test files: translation, timezones, async_adapter, adapter (2026-10-16)

`cli.ts --tests` with `translation_test.rb`, `timezones_test.rb`,
`async_adapter_test.rb` and `adapter_test.rb` added. All four pass with the
generated tree swapped in.

- **Test class bodies** take an `if` around tests (`if adapter_is?(:sucker_punch)`)
  and an interpolated name (`"should load #{ENV['AJ_ADAPTER']} adapter"`), both
  computed when vitest collects the file, as Ruby computes them at `test`.
- **helper.rb.** Its `ENV["AJ_ADAPTER"] ||= "inline"` is emitted, and its
  top-level `def adapter_is?` is an exported function that a bare call in a test
  resolves to. Rakefile:39-42 runs a file whose path names `async` only under
  `AJ_ADAPTER=async`, so that file also loads `adapters/async.rb`
  (`queue_adapter = :async`, `immediate = true`), which imports helper.js itself
  so it lands after the inline default whatever order imports sort in.
- **ActiveSupport core_ext on Ruby core types.**
  - A method activesupport seats on ruby-compat's `STRING_METHOD_TABLE` /
    `TEMPORAL_METHOD_TABLE` (scanned from its source: `inTimeZone`, `toFs`,
    `change`, …), called on an untyped receiver the gem does not define it for,
    is `rbFSend(x, "inTimeZone")`.
  - `Date.tomorrow` and a method chained on it (`.noon`) are
    `core-ext/date/calculations`' flat exports (the root `tomorrow` is
    time-ext's JS-`Date` helper). Generally, a `Date` / `Time` class-level
    method `@blazetrails/date` has no static for is activesupport's export.
  - `Time.zone` is typed as `ActiveSupport::TimeZone` (its `name` is a
    property); `Time.zone = x` is `setZone(x)`; `I18n.available_locales = x` is
    `I18n.setAvailableLocales(x)`.
  - `Numeric#div` is `Math.floor(a / b)`; the shim's `rbBinop` tries an
    operator's trails spelling (`minus`, `plus`, `compareTo`) before `a["-"]`,
    which a `method_missing` Proxy (`TimeWithZone`) answers by raising.
- `assert_match` / `assert_no_match` → `toMatch`. A module function defined in a
  reopening file (`ActiveJob.deprecator`, `deprecator.rb`) is imported from that
  file's twin, not the module's home file.
- `swap-tree.sh` refuses an empty test list: a glob that matched nothing handed
  vitest no paths and it started every project (stopped by the timeout).

Result, generated tree swapped in: 40/54 activejob tests (was 34/48); all seven
ported Rails files pass except `queue_priority`'s two reader/writer tests. The
remaining failures are the hand `arguments.trails.test.ts` (11) and
`gem-version` (1). activejob tsc 34 (was 37), none in tests. activerecord: tsc
507 (was 511), calls 4897/4939, args 6626/6830 with the same 204 mismatches.

## Step 29 — instrumentation, test_case and job_serialization tests; test classes as classes (2026-10-16)

`cli.ts --tests` with `instrumentation_test.rb` and `test_case_test.rb` added.
Both pass with the generated tree swapped in (instrumentation 3/3; its two
retry tests sit under `unless adapter_is?(:inline, :sneakers)`, so Rails skips
them under the default inline adapter too; test_case 3/3).

- **A test class is a class.** Each `describe` declares the Rails test class,
  extending a runtime `TestHost` that stands in for `ActiveSupport::TestCase`:
  Minitest's `Test` (whose empty `before_setup` / `after_teardown` end the chain
  an included module's `super` reaches), with Minitest's and ActiveSupport's
  assertions, flat functions in trails, as methods. Each test gets a fresh
  instance; `beforeSetup()` runs first and `afterTeardown()` last (registered
  first, as vitest runs `afterEach` hooks in reverse). `include M` in the body is
  `include(Klass, M)`, a gem superclass's includes (`< ActiveJob::TestCase`,
  which includes `TestHelper`) are replayed onto it, a helper `def` is a
  prototype method, and a nested class is left to its own unit.
  `include ActiveSupport::Testing::Assertions` in lib (no module value in
  trails) is a no-op the host covers.
- **Module statements after a nested module** (`ActiveSupport.on_load(:active_job)
{ Base.include(TestQueueAdapter) }` after `module TestQueueAdapter`) are
  emitted after every unit and the `ClassMethods` seats, as Ruby runs them then.
- **Blocks after `*rest`.** A gem method with `*rest` that takes a block,
  declared or by `yield` / `block_given?` (`retry_on`, `discard_on`), gets the
  block branded with `rbBlock`, and its prologue pops it only when
  `rbBlockGivenP` says so: an exception class is a function too. The prologue
  is no longer copied into nested blocks. Keywords count as one options slot
  when a block follows skipped arguments (`perform_enqueued_jobs { }` →
  `performEnqueuedJobs(undefined, block)`).
- **`raise x`** with x untyped is `rbMakeException(x)` (eval.c
  `rb_make_exception`: a class is instantiated). `return` inside an async `try`
  awaits, so `ensure` runs after the value settles.
- **Smaller:** `3.seconds` (and the other `Numeric` duration units) is
  `Duration.seconds(3)`; `Integer#ordinalize` is activesupport's `ordinalize`;
  `klass.singleton_class.public_instance_methods(false)` is the class's own
  public statics in Ruby spelling; `Klass.ancestors` is `rbModAncestors`; a
  writer taking `*` is `setX(...)`, overriding the gem's `setX`; an attr read on
  another receiver is a property even where a test helper `def` shares its name;
  `rbExtractKeywords` takes a trailing plain object as the keywords.
- **Autoloads in tests.** A constant a module `autoload`s whose file requires a
  library neither trails nor Ruby's stdlib has (`require "sidekiq"`) is read off
  its module when reached (`QueueAdapters.SidekiqAdapter` in a `case` arm), as
  Ruby's autoload would, instead of being imported. A test support file's
  reopen of `ActiveSupport::TestCase` no longer shadows the dependency class for
  lib code.

Then `job_serialization_test.rb`: 8/9. The test host also carries
ActiveSupport's `TimeHelpers` (`freeze_time`, and `travel_back` in
`afterTeardown`), and `assert_kind_of String, x` is `rbObjIsKindOf(x,
rbCString)`: Ruby's core classes are ruby-compat's `rbC*`, and a string
primitive is no `instanceof String`. The ninth test ("serialize and deserialize
are symmetric") reads `priority` and `queue_name` as the reader functions, the
same reader/writer gap as `queue_priority` (story
`accessor-half-shadows-ancestor-on-module-carrier`).

Result, generated tree swapped in: 54/69 activejob tests (was 40/54); the 15
failures are the earlier 14 (hand `arguments` 11, `queue_priority` reader/writer
2, `gem-version` 1) and that ninth test. activejob tsc 30 (was 34), none in
tests. activerecord: tsc 499 (was 507), calls 4897/4939, args 6626/6830, the
same 204 mismatches (measured before the `TimeHelpers` / `assert_kind_of`
changes, which touch only test lowering).

## Step 30 — rebased after the globalid accessor story (2026-10-16)

`globalid-app-is-a-class-accessor-not-flat-setapp` (filed from step 27's
finding) landed: `GlobalID.app` is a static reader and `GlobalID.setApp` its
writer, as `class << self; attr_reader :app; def app=` (global_id.rb:8-9,31-33),
and the flat `getApp` / `setApp` / `_resetApp` are gone. Rebased, rebuilt,
regenerated `pkg-exports.json` and both oracles.

The generator's special case for the flat `setApp` is removed. In its place:
the bare constant `GlobalID` is the package's class export, and a dependency
class whose package ports a writer as `static setX` (read from its `.d.ts`)
takes `Klass.setX(v)` for `Klass.x = v`. helper.rb's `GlobalID.app = "aj"` is
now `GlobalID.setApp("aj")`. activejob unchanged at 54/69.
activerecord: tsc 499, calls 4961/5003 (42 mismatched, as before; main's hand
port added 64 compared methods), args 6629/6834 (40 shape, 165 naming: one more
naming row than step 29, among the lists main's changes added to the comparison).

## Step 31 — third-party queue adapters out of scope (2026-10-16)

Per Dean: trails does not port the adapters that wrap queue gems it has no
port of (Sidekiq, Resque, Delayed Job, Backburner, Queue Classic, Sneakers,
Sucker Punch); the plan is the ActiveJob base, then a Solid port. The generator
no longer emits activejob lib files that `require` a library neither trails nor
Ruby's stdlib has (report.json lists them as `skipped`), and `autoload` does not
import them. `queue_adapters.rb`'s `autoload` lines for them stay, as Rails has
them; a test reads such a constant off `QueueAdapters` only when reached.

activejob: 67 TS files (was 74), declines 3 (was 18: `ActiveRecord::QueryLogs`
in railtie.rb ×2, `ActiveRecord` in enqueue_after_transaction_commit.rb), tsc 25
(was 30), tests unchanged at 54/69.

## Step 32 — argument_serialization_test, in progress (2026-10-16)

`cli.ts --tests` with `argument_serialization_test.rb` added: 22/53 (the
file's two `[...].each do |arg| test ... end` loops generate 37 of the 53).

- **Per-element tests**: a class-level `[...].each do |arg|` around `test`s is a
  `for (const arg of [...])` around `it`s, collected as Ruby defines them; the
  block parameter is a local in the names and bodies. `"#{arg.class}"` in a
  test name is `rbObjClassname(arg)`, `arg.class` in a test is `rbObjClass`;
  `private` in a test class is dropped; a test's namespace module with only a
  nested class is emitted.
- **Ruby literals**: `2.123456789r` (Prism RationalNode, now in the IR) and
  `"59.123456789".to_r` on a decimal literal are ruby-compat `rational(n, d)`;
  `BigDecimal(5)` is `new BigDecimal(5)`; an integral Float literal in a test is
  a boxed `Number` (ruby-compat's Float); `ActiveSupport::TimeZone[name]` is
  `TimeZone.find`; `1.year` and `months` join the Duration units.
- **core_ext calculations**: a `Date` / `Time` / `DateTime` class method is its
  class's `core-ext/<class>/calculations` export (`Time.current`, `DateTime.current`,
  imported as `timeCurrent` / `dateTimeCurrent`); `date ± duration` in the shim is
  the Duration's `since` / `until`. vitest.config.ts maps the time and
  date-time calculations subpaths to source, as it already did the date one.
- **Type tests**: `when Integer` / `Float` are `rbObjIsKindOf(x, rbCInteger)` /
  `rbCFloat` (a bigint, a boxed Number), `x.class == String` is
  `rbObjClass(x) === rbCString`, `Hash.ruby2_keywords_hash?` is ruby-compat's
  `rbHashSRuby2KeywordsHashP`, `respond_to?(:permitted?)` asks for `isPermitted`.
- **Serializers**: `serialize(arg)` in a serializer is typed by its `klass`
  (`ActiveSupport::Duration`, ruby-compat `Range` / `Module`), so readers are
  properties (`range.begin`, `duration.value`); `Module#name` on a module value
  is `rbModName`; activejob's `self.class.name` is `rbModName(...)` as its hand
  port writes it, so a payload names its serializer by Ruby path.
- **Symbols**: a ported test exercising `ActiveJob::Arguments` writes Symbol
  literals and keys with the colon (`":a"`), as the hand `arguments` tests do.
- `assert_raises` is activesupport's `assertRaises`, which answers the error;
  `assert_not_instance_of`; `with_indifferent_access` is the flat export.

Then, per Dean's call on the Symbol question (option 1): where Symbols are colon
strings, `x.is_a?(klass)` with a run-time class is the shim's `rbIsA`
(`isSymbol` for `rbCSymbol`, a non-colon string for `rbCString`), and the class
`Symbol` / `String` as a value there is ruby-compat's `rbCSymbol` / `rbCString`;
activejob's serializer files join the colon convention, so `SymbolSerializer`
matches `:a` and round-trips it (`symbolToS` / `stringToSym`).

More generator fixes: `transform_values` with an awaiting block goes through
`rbAsyncEnum`; `values_at` is ruby-compat `valuesAt`; `when nil` is `== null`
(an `undefined` slot is nil); `KEYS.zip(values).to_h` over a literal string-array
constant is `Object.fromEntries` (a plain-object Hash, so `merge!`'s
`Object.assign` copies it); an Integer-keyed hash literal (`{ 1 => 2 }`) is a
ruby-compat `Hash` (`new Hash().set(1, 2)`); `Object.new` is the shim's
`RubyObject` (a plain object is a Hash in trails); `"#{x.class}"` interpolates
`rbObjClassname` in lib code too; a test's modules are `registerConstant`ed;
`TimeWithZone#time_zone` types as `ActiveSupport::TimeZone` (the hand getter is
`TimeZone | Timezone`); the shim implements `map!`, `flatten!`, `sort_by`,
`each_with_object`, `any?`.

Result: argument_serialization 45/53. activejob 104/122 overall; the hand
`arguments.trails.test.ts` failures fell from 11 to 6 against the improved
generated `arguments.ts`.

The 8 still failing are trails-side, not generator issues (story candidates,
not filed):

- `DurationSerializer#serialize` passes the bare `duration.parts` Hash to
  `Arguments.serialize` (duration*serializer.rb:8, "for backwards
  compatibility"), whose Rails `arguments.map` maps a Hash's pairs; the hand
  port's `Arguments.serialize(arguments*: unknown[])` is array-only (2 tests).
- `@blazetrails/date`: `new Date(...)` / `new DateTime(...)` are objects, while
  `Date.today`, `Date.iso8601`, `DateTime.iso8601` and core_ext's
  `DateTime.current` answer Temporal values, so a round trip changes
  representation, and `Date#iso8601` is unreachable from a Temporal value
  (`rbFSend` finds only `marshalDump` on `TEMPORAL_METHOD_TABLE`) (4 tests).
- `HashWithIndifferentAccess#to_h` / `toHash` answers a ruby-compat `Hash` (a
  Map) where the test's expected Hash is a plain object, so `transform_symbol_keys`
  returns a Map (1 test).
- A `String` subclass instance (CLAUDE.md "Ruby Strings are JS string
  primitives") (1 test, permanent).

activerecord: tsc 497, calls 4961/5003, args 6629/6834, unchanged from step 31.
The colon-Symbol `is_a?` (`rbIsA`) and `Symbol` / `String`-as-value rules are
activejob-only: in activerecord's colon-convention files they reached
`String.new`.

Filed from step 32 (Dean's OK): `activejob-arguments-serialize-accepts-a-hash`
and `hwia-to-hash-answers-a-plain-object-without-defaults`.

## Step 33 — exceptions_test, and the suite per adapter (2026-10-16)

`cli.ts --tests` with `exceptions_test.rb` added: 30/30 under the `test` adapter.

- **Adapters.** activejob's Rakefile runs the whole suite once per adapter
  (`AJ_ADAPTER`, Rakefile:5,34-44), leaving out a file that names another
  adapter (`async`, `delayed_job`); `exceptions_test` is entirely inside
  `unless adapter_skips_scheduling?(...)`, so under inline Rails runs none of it.
  helper.rb's `require "adapters/#{@adapter}"` is now an awaited `import()` of
  the adapter `AJ_ADAPTER` names (a table of the ported ones: inline, async,
  test); `adapters/test.rb` is ported. `swap-tree.sh` takes `SWAP_ADAPTER`
  (default inline), sets `AJ_ADAPTER` and applies the Rakefile's file filter,
  replacing the async test file's own import of the async adapter.
- **Test classes.** `class << self; def x` is a static method on the test class,
  and class-level code (`unless adapter_skips_scheduling?(...)`) runs with `self`
  the class. Minitest's `pass`, and `obj.stub(:m, val) { }` as activesupport's
  `stub(obj, "m", val, [], block)`.
- **Nested classes first.** A class-body statement naming a class nested earlier
  in that body (`retry_on DefaultsError` after `class DefaultsError`) is emitted
  after it, extending step 29's rule for modules; a test case's body is exempt.
- **Accessors.** A zero-argument `def x` beside `attr_writer :x` (TestAdapter's
  memoized `enqueued_jobs`) is a `get x()` paired with the writer's `set x()`
  (CLAUDE.md "Generated attribute readers are properties"); a `delegate :x, :x=`
  pair forwards a property read and a `setX` write.
- **Lowering fixes.** `h[k] = v` as a method's last statement returns the JS
  assignment's value (it evaluated `v` twice: `executions_for` counted every
  retry double); `x.seconds` on an untyped value (`options[:wait].seconds`) is the
  shim's `rbNumDuration`, plural units only, as `Array#second` shares the
  singular; `Array#second` and friends dispatch through `rbFSend` (the core_ext
  scan reads ruby-compat's `ARRAY_METHOD_TABLE`); `to_f` on an untyped value is
  the shim's `rbToF` (a Ruby Time's own `toF`; `Number(time)` was NaN);
  `Kernel.rand` reads `rand` off ruby-compat's `Kernel`, which the shim seats with
  `kernelRand` so a test's `Kernel.stub(:rand, x)` replaces it; a class raised
  with no message carries its Ruby name as the message.

Result, per adapter (generated tree swapped in): inline 102/120, async 106/124,
test 134/152; the same 18 failures under each (hand `arguments` 6,
`argument_serialization` 8, `queue_priority` 2, `job_serialization` 1,
`gem-version` 1).

Story candidates, not filed:

- ruby-compat's `Exception` has no `exc_to_s` default: `new FooError().message`
  is `""` where Ruby's `message` is the class name (error.c `exc_to_s`).
- ruby-compat's `Kernel` module has no `rand` (random.c `rb_f_rand` is a Kernel
  module_function); only the flat `kernelRand` exists, so `Kernel.rand` and a
  stub of it have no seat.

activerecord: tsc 492 (was 497), calls 4962/5004 (42 mismatched, unchanged; one
more method compared), args 6628/6833 (the same 205 mismatches).

Filed (Dean's OK): `exception-message-defaults-to-class-name` and
`kernel-module-answers-rand` under `0154-ruby-compat-surfaced-deviations`.

## Step 34 — rebased after the accessor story; queue_naming, queuing, serializers, queue_adapter (2026-10-16)

trails#8993 landed `accessor-half-shadows-ancestor-on-module-carrier`
(`defineAccessorHalf`: one half of an accessor on a carrier defers the other up
the chain). Rebased and rebuilt.

- **Module reader halves.** A zero-argument reader in a module whose writer
  another gem scope declares (`def priority` in QueuePriority / `def queue_name`
  in QueueName, `attr_writer` for both in Core) is seated as a getter with
  `mod.moduleEval((table) => Object.defineProperty(table, "priority", { get }))`,
  the shape #8993 pairs with the includer's writer; callers read it as a property
  (any name with a gem-declared instance writer is attr-like). queue_priority 6/6
  and job_serialization 9/9 (both were waiting on this).
- **Ported:** `queue_naming_test.rb` 14/14, `queuing_test.rb` 12/12,
  `serializers_test.rb` 7/7, `queue_adapter_test.rb` 6/6.
- **Generator fixes on the way:**
  - `-str` (String#-@) on a string is the string, not numeric negation.
  - A block a test hands to a gem method that keeps it (`queue_as { … }`,
    instance_exec'd later) is lowered as library code (no test-mode awaits); one
    that `yield`s (`perform_later { |job| assert … }`) keeps the test as `self`.
  - A block skipping an optional parameter of a class method reached through a
    concern's `ClassMethods` (`HelloJob.queue_as { }`) is padded into its slot.
  - Repeated `_` block parameters are renamed (`_`, `_2`, …).
  - `Enumerable#count` with a block is a `count(xs, fn)` call.
  - `"#{ {…} }"` / `"#{ […] }"` interpolate `rbInspect` (Hash#to_s).
  - `assert_difference` / `assert_no_difference` pad their optional
    `difference` / `message` before the block; `assert_not_equal` is
    `rbEqual(a, b) === false` (vitest's `toEqual` ignores classes).
  - In a test, `size` / `length` on a value not typed as an array or string is
    the shim's `rbSize` (a Set's `size`).
  - `respond_to?(name)` with a run-time Ruby name wraps the name in the shim's
    `rbTsName` (snake → camel, `x?` → `isX`).
  - `Class.new(ActiveJob::Base)` types its local as that gem class, so a writer
    on it (`child_job.queue_adapter = :stub_one`) is the gem's `setQueueAdapter`.
  - A writer in value position (`a.x = b.y = nil`) is the assignment expression.
  - `adapter_name = ActiveJob.adapter_name(x)`: a same-file module function
    shadowed by the local being assigned keeps Ruby's qualified call.
  - In activejob, `name` on an untyped value is `rbModName` (the gem has no
    `name` of its own); `is_a?(Module)` also answers for a ruby-compat `Module`.
  - A method's tail read of an instance variable is `this._x ?? null` (an unset
    ivar is nil; `job_to_hash`'s `fetch("priority")` read `undefined` as no key).
  - A method taking `...` that yields takes a branded block (activejob only, see
    below).

Result, per adapter (generated tree swapped in): inline 144/159, async 148/163,
test 176/191; the same 15 failures under each (hand `arguments` 6,
`argument_serialization` 8, `gem-version` 1).

activerecord: tsc 484 (was 492), calls 4961/5003 (42 mismatched, unchanged),
args 6469/6673 (204 mismatched, was 205). 160 fewer arg lists are compared: the
attr-like rule above makes zero-argument readers with a gem-declared writer
properties (`reflection.name`, `arel_table.name`), which leaves those calls out
of the arg comparison; tsc's drop suggests the hand port reads them so too.
The `...` block brand is limited to activejob, as the arg comparer skips a
branded block.

## Step 35 — enqueue_after_transaction_commit, time_with_zone_serializer (2026-10-17)

`cli.ts --tests` with `cases/enqueue_after_transaction_commit_test.rb` (3/4) and
`serializers/time_with_zone_serializer_test.rb` (1/1) added.

- **Another gem's root constant.** `ActiveRecord.after_all_transactions_commit`
  in `enqueue_after_transaction_commit.rb` was declined as unresolved; a root
  constant naming another framework gem is read off activesupport's `TopLevel`
  at call time (CLAUDE.md "Call-time constant resolution"), cast to `any` since
  `TopLevel`'s type lists only today's readers. In activerecord it reaches
  `trailtie.ts`'s `ActionDispatch::Callbacks`; tsc unchanged.
- **`stub_const(Object, :X, v, exists: false) { }`** is activesupport's
  `TestCase.stubConst(TopLevel, "X", v, block, { exists })`.
- **`assert_predicate x, :p?`** / `assert_not_predicate` lower as the call
  `x.p?` (so `isSuccessfullyEnqueued`) under `rtest`.
- **Tests outside `cases/`** (`test/serializers/…_test.rb`) are `.test.ts`
  beside the lib file, and import `test-helpers/helper.js` first, as Ruby's
  `require "helper"` is the first line: entering at `serializers/…` otherwise
  met `serializers.ts` ↔ `object-serializer.ts` half-evaluated.

The one failure is trails-side: `stubConst` restores the constant in a sync
`finally`, so an async block (`assert_difference` awaiting its expression)
reads `TopLevel.ActiveRecord` after the stub is gone (story candidate).

Result, per adapter: inline 148/164, async 152/168, test 180/196 (the 15
earlier failures plus that one). activerecord: tsc 484, calls 4961/5003, args
6469/6673 — unchanged.

## Step 36 — test_helper_test (2026-10-17)

`cli.ts --tests` with `cases/test_helper_test.rb` added: 179/207 under the `test`
adapter. (Story `stub-const-awaits-an-async-block` filed under 0156 for step 35's
remaining failure.)

- **Test host is `ActiveSupport::TestCase`.** `TestHost` extends activesupport's
  `TestCase` (was `Minitest::Test`), so a concern's `setup do … end` /
  `teardown do … end` (`DoNotPerformEnqueuedJobs`) reach SetupAndTeardown's
  callbacks; those blocks are `instance_exec`ed on the test, as `rescue_from`'s.
- **Assertion count.** TestCase's TestsWithoutAssertions reads Minitest's
  per-test `assertions`: the host's assertion methods and `pass` increment it,
  vitest's `expect` count is added at teardown, and a test's `assert_raises` /
  `assert_difference` call the test's own method, not the free import.
- **Async assertions.** activesupport's block-taking assertions are async;
  their names seed the async set as `ActiveSupport::Testing::Assertions#…`, so
  TestHelper's `_assert_nothing_raised_or_warn` is awaited.
- **Lowering.** `is_a?(Proc)` is `rbObjIsProc` (a job class is a function too);
  Hash `compact` is activesupport's (`hashCompact`); `acts_like?` is
  activesupport's `actsLike.call`; `h.all?/any?/none? { |k, v| }` destructure
  pairs over `rbEntries`; `Array#drop`; `Integer#times` (shim, awaits an async
  block); `send(:sym)` names the TS member and awaits an async def;
  `Range#cover?` is ruby-compat's `cover`; `local << x` reassigns (a JS string
  is immutable); template literals escape `\n` (the emitter indented them);
  an untyped local in an interpolation is `rbObjAsString` (activejob).

Left in test_helper_test (28): time `iso8601` through `rbFSend` (the date
candidate), `Potential matches` inspect of jobs, `assert_performed_with`
counts, `CustomQueueAdapter`, Zeitwerk (unresolved, test-only).

Result, per adapter: inline 158/177, async 162/181, test 359/403 (earlier 16
plus test_helper's). activerecord: tsc 480 (was 484), calls 4961/5003, args
6468/6669 (201 mismatched).

## Step 37 — test_helper_test 191/207 (2026-10-17)

- **Keyword lambdas.** A lambda a test passes as a keyword value
  (`only: ->(job) { … }`) is lowered as library code: the gem calls it
  synchronously (`filter_as_proc(only).call(job)`), and test mode's awaits made
  it answer a promise, which is always truthy.
- **Async blocks through `yield`.** A gem method handed an async block, or one
  passed on by `&block` from such a method, awaits its `yield` even inside an
  iteration block (`jobs_with`'s `select { … yield job … }` becomes
  `rbAsyncEnum`), so `flush_enqueued_jobs` performs each job before counting.
- **Delegated attributes in a module.** `delegate :enqueued_jobs,
:enqueued_jobs=, to: :queue_adapter` (TestHelper) is indexed as an attribute
  and seated as a `moduleEval` getter, as step 34's reader halves; library
  callers read the property.
- **`Array#delete` on an untyped receiver** (activejob): the shim's `rbDelete`
  dispatches to `aryDelete` / `hashDelete`.
- **`Date.today.noon`**: a core_ext method on a date-package static's value that
  the date class lacks is the class's calculations function (`noon(today())`).
- `swap-tree.sh` takes `SWAP_FILTER` (vitest `-t`).

Left in test_helper_test (16): unknown keyword `class:` raising ArgumentError
(kwargs, 2); `"NotImplementedError".constantize` (ruby-compat registers no core
exception constants, 1); time `iso8601` (date candidate, 2); job `inspect` in
"Potential matches" (5); `CustomQueueAdapter` override; Zeitwerk; a few
`at:` / wait-in-future counts.

Result, per adapter: inline 158/177, async 162/181, test 371/403. activerecord:
tsc 480, calls 4961/5003, args 6468/6669 — unchanged.

## Step 38 — logging_test (2026-10-17)

`cli.ts --tests` with `cases/logging_test.rb` added: 4/37 under inline, 4/45
under async and test. (Story `core-exception-classes-are-registered-constants`
filed under 0154.)

- **`def setup` / `def teardown`** in a test class are class members of the
  test host, and the harness runs Minitest's order: `before_setup`, `setup`,
  the test, `teardown`, `after_teardown`; a `def setup; super` reaches the
  host's. All of a test class's helper `def`s are class members now (they were
  functions assigned to the prototype, where `super` cannot appear).
- **`super` arguments set as ivars.** `@file = StringIO.new; super(@file)` is
  `const file = …; super(file); this._file = file;` (CLAUDE.md's sanctioned
  reorder: statements that only compute `super`'s arguments stay ahead).
- **`ActiveSupport::LogSubscriber::TestHelper`** is imported from activesupport's
  `log-subscriber/test-helper` subpath.
- **`include ActiveSupport::Logger::Severity`** (Ruby stdlib, constants only)
  emits no include; a bare `WARN` in a class including it is `Logger.WARN`.

The rest wait on `log-subscriber-level-helpers-keep-rails-names` (p1): the
generated `ActiveJob::LogSubscriber` calls Rails' `info` / `error` helpers,
which activesupport's `LogSubscriber` spells `_info` / `_error`, so nothing is
logged and no tag is applied.

Result, per adapter: inline 162/214, async 166/226, test 375/448 (the earlier
failures plus logging's). activerecord: tsc 478 (was 480), calls 4961/5003,
args 6468/6669.

## Step 39 — test_helper_test tail, 195/207 (2026-10-17)

- **`Array#join`** in activejob is ruby-compat's `aryJoin` (each element's Ruby
  `to_s`; a Hash's is `inspect`), and any interpolated value not known to be a
  primitive is `rbObjAsString` (a class interpolates its name, not its JS source).
- **`Klass.descendants` / `.subclasses`** are activesupport's DescendantsTracker
  functions.
- **`rbSingletonPublicMethods`** lists a class*attribute written on the class
  (its own `\_\_class_attr*<name>` storage) as the singleton reader Ruby's setter
redefines, and no longer doubles a leading underscore (`\_queue_adapter`), so
`queue_adapter_changed_jobs`finds`Base`and`queue_adapter_for_test`
overrides apply (`OverrideQueueAdapterTest`, `QueueAdapterTest`).
- **Untyped comparisons** (`job.scheduled_at > at`) go through `rbBinop`, which
  answers `<` / `>` / `<=` / `>=` from the receiver's `<=>` (`compareTo`, or
  `@blazetrails/date` Time's `compare`).

Left (12), none generator-side:

- `rbInspect` of a plain instance is JS's `[object Object]`, where Ruby's
  `Kernel#inspect` (`rb_obj_inspect`) lists ivars (`#<Person … @id="9">`): 5
  "Potential matches" / "No … found with" messages (story candidate).
- `@blazetrails/date` representations: `iso8601` through `rbFSend` (2) and a
  `DateTime` argument deserialized as a Temporal value (1) — the date candidate.
- Unknown keyword `class:` raising ArgumentError (2, kwargs).
- `"NotImplementedError".constantize` (1, filed).
- Zeitwerk (1, permanent: trails has no autoloader).

Result, per adapter: inline 164/214, async 168/226, test 379/448. activerecord:
tsc 478, calls 4961/5003, args 6468/6669 — unchanged.

## Step 40 — module constants, singleton defs on objects (2026-10-17)

(Story `rb-inspect-of-plain-object-is-rb-obj-inspect` filed under 0154.)

- **Module constants** (`module VERSION; STRING = …`) are seated in the
  module's constant table with `rbModConstSet` as well as exported flat, so
  `VERSION.STRING` reads (the hand `gem-version.trails.test.ts` now passes).
- **`def obj.m`** on a local (logging_test's stubbed adapter) is an own method
  of that object, library code, whose `super` is the class's method; a
  `respond_to?` override is asked the TS name (`:enqueue_all` is `enqueueAll`)
  and its `super` is ruby-compat's `basicObjRespondTo`. Its test waits on the
  log-subscriber story.

Every remaining failure is trails-side or permanent: logging (log-subscriber
story), argument_serialization 8 and the hand `arguments` 6 (Duration, HWIA
Map, date candidate, String subclass), test_helper 11 (inspect, date, kwargs,
core exception constants), enqueue_after_transaction_commit 1 (stubConst),
Zeitwerk 1.

Result, per adapter: inline 165/214, async 169/226, test 380/448. activerecord:
tsc 478, calls 4961/5003, args 6468/6669 — unchanged.

- **`is_a?(Hash)` / `when Hash`** is `rbObjIsKindOf(x, Hash)` with ruby-compat's
  `Hash` (a plain object, a Map or a `Hash`), the hand port's own test in
  `arguments.ts`; the hand `arguments` tests go 6 → 4 failing (the four left test
  the hand port's Map-specific restoration, which Rails' body does not have).
  activerecord tsc 478 → 475, calls and args unchanged.
