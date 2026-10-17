# Spike report: activerecord Ruby → IR → TypeScript

Requested by the repo owner on 2026-10-15: build a Ruby → IR → TypeScript
pipeline that converts `vendor/rails/v8.0.2/activerecord/lib/**`, measure it with
the parity tooling, and keep going until a wall. The running log with a
measurement after each step is `scripts/codegen/PROGRESS.md`; machine-readable
rows are in `scripts/codegen/measurements.jsonl`.

## Verdict

The pipeline works end to end on all 306 activerecord files (~2 s) and, measured
by the repo's own gates, the generated tree matches Rails as well as or better
than the hand port: **99.2% of methods, 100% arity, 98.5% call sets, 97% call
arguments.** The wall is not Ruby → IR: it is **types and trails' API shapes**.
With a type oracle read from the existing hand port, 52 of 298 generated files
drop into the hand-written package with zero type errors, and 8 pass their own
test files. Without that oracle the output would not be async-correct at all.
Recommendation at the end.

## Final measurements (step 7)

| measure                           | generated                                                                                               | hand port |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| methods matched (parity:api)      | 6933/6986 (99.2%)                                                                                       | 6986/6986 |
| files                             | 296/296                                                                                                 | 296/296   |
| inheritance                       | 213/222                                                                                                 | 221/221   |
| arity                             | 3516/3516                                                                                               | 3765/3765 |
| param names                       | 2449/2471                                                                                               | 2498/2498 |
| call sets equal to Rails          | 4844/4919 (98.5%)                                                                                       | 4228/4250 |
| call arg lists equal              | 6753/6959 (97.0%; 52 shape)                                                                             | 5265/5330 |
| generator `declined()` statements | 130 of 18,184 leaf statements (0.7%)                                                                    | —         |
| tsc errors (generated tree alone) | 827 in 192/308 files, 0 syntax                                                                          | 0         |
| decline loop                      | 15 rounds → 1 diagnostic; 81.7% of statements survive verbatim                                          | —         |
| consumer import coverage          | 93.7% (255/291 files export everything consumers import)                                                | —         |
| swap into hand package, 0 errors  | **52/298**; median 4 errors; 156 ≤5; 121 break no consumer                                              | —         |
| swapped + own tests all pass      | **8** of 22 testable (jsonb, vector, database-limits, deterministic-key-provider, 4 encryptors/message) | —         |
| identical call set vs hand        | 34–37% of ~5.6k shared methods                                                                          | —         |

Remaining tsc errors by cause: dependency member missing 201, dependency call
shape 129, Ruby operators/indexing on typed values 125, unknown leaking from
typed APIs 87, splat into fixed params 70, callable mismatch 40, name/order 33,
class structure 24, other 118.

## Architecture

```
vendor/rails/…/activerecord/lib/**.rb
   │  ruby/build-ir.rb  (Ruby 3.3.11, Prism 1.9.0)        ── 0.9 s, 306 files
   │    • Prism AST → normalized IR (JSON): ~45 node kinds; every op-assign /
   │      index-write / safe-nav / masgn variant folded; 0 unhandled Prism kinds
   │    • ConstEnv: gem-wide literal constants, evaluated lazily in a sandbox
   │    • MacroExpander: class-body `CONST.each { … }` loops and calls to
   │      gem-defined macros are EXECUTED against a recorder; recorded
   │      `class_eval` strings are re-parsed, recorded `define_method` blocks are
   │      mapped back to their AST (Proc#source_location) with closure locals
   │      substituted (Proc#binding); Struct.new / Class.new fold into classes
   ▼
IR (scripts/codegen/.ir/**.json)
   │  src/gem-index.ts      every class/module/def/attr/const/alias in the gem
   │  src/hand-oracle.ts    type oracle read from the hand port with the
   │                        typescript-5 checker (member kind, async, return /
   │                        param classes) — 2329 classes, 23 s
   │  src/resolve.ts        constants → imports (gem, then arel / activesupport /
   │                        activemodel / did-you-mean / ruby-compat, then JS
   │                        globals); member resolution for self / constants;
   │                        a mixin module's `self` = its includer
   │  src/types.ts          receiver typing over the oracle
   │  src/lower.ts          one lowering per IR node kind (Ruby idioms decided once)
   │  src/emit.ts           classes / modules / members, Ruby → trails shapes
   ▼
packages/activerecord/codegen-out/src/**.ts   (306 files, ~2 s)
   │  src/decline-loop.ts   pass 8: tsc diagnostics → `declined()` markers
   ▼
measurement: measure-tsc.sh · measure-parity.sh (parity:api --calls on the
generated tree swapped in as src/) · summary.ts (gen vs hand) ·
export-coverage.ts · swap-check.ts (each file swapped into the hand package,
whole-package typecheck) · swap-test.ts (its own vitest files)
```

The generator encodes the repo's rules rather than restating them: method and
file names come from `scripts/parity/conventions.ts` (`rubyMethodToTsIgnoringSkip`,
`rubyFileToTs`), operator spellings from `operator-order-spelling.ts`, core
calls from `RUBY_COMPAT_EXPORTS` and ruby-compat's `STRING_METHOD_TABLE`, and
the ratified CLAUDE.md rules are lowerings: truthiness (`rtest` / typed
`!= null` / bare boolean), `fetch`, `present?`/`blank?`/`presence`, kwargs as a
trailing options object, symbols as bare strings, RFC 0149 camelCase option
keys, `x=` that must await → `setX()`, module mixins as `this`-typed functions
in a ruby-compat `Module`, module `super` → `Mod.superMethod(this, name)`,
`class_attribute` / `mattr_*` → `classAttribute.call(Host, …)`,
`ActiveRecord::Promise` → the native promise, `Rails` → `TopLevel.Trails`,
`ENV[k]` → `getEnv(k)`, `registerConstant(fqn, Klass)` for `constantize`,
`super()` hoisted only where the parent cannot read the work.

## What converts cleanly

- **Structure, names and surface.** Every Ruby file maps to its trails file
  (296/296); 99.2% of the Rails method surface is credited, including the
  macro-generated part (`class_attribute`, `mattr_*`, `delegate`, `Struct.new`,
  `define_method` / `class_eval` loops, `define_model_callbacks`,
  `define_column_methods`) because the front-end executes Rails' own
  metaprogramming instead of pattern-matching it. Arity is 100%, parameter names
  99.2%, superclass edges 213/222.
- **Bodies.** Method bodies follow Rails statement by statement: control flow,
  guards, early returns, `case`/`when`, `begin/rescue/ensure/retry`, op-assigns,
  multiple assignment, blocks, string interpolation. 98.5% of name-matched
  method pairs make exactly the calls Rails makes, and 97% of call sites pass
  the argument list Rails passes — better than the hand port on both raw
  measures, because the generator has no latitude to restructure.
  `WhereClause#or`, `FinderMethods#exists?`, `Persistence#save`,
  `PostgreSQL::OID::Date#cast_value` come out reading like the hand port.
- **Ruby semantics** with one reviewed lowering each (truthiness, `||=`, value
  `||`/`&&`, `fetch`, `present?`, kwargs, symbols, string mutation via
  `rbStrSend`, `=~`/`$~`, `retry`, `yield`/`block_given?`, `super`/zsuper,
  `is_a?` narrowing, `self.class`, `Struct`, constants and constant aliases).
- **Async.** With the oracle, `await` follows the receiver: 1.8k awaits, ~1.1k
  async defs, a writer that awaits becomes `setX()`, awaiting Enumerable blocks
  run sequentially.

## Blockers (in the order they cost)

1. **Types come from the hand port.** Ruby states none; the spike reads them
   from the existing trails source (`hand-oracle.ts`). Without the oracle (step 3)
   there are no awaits, no getter/method decisions, and `rtest` on every
   condition; with it, ~81% of member lookups on typed receivers resolve. This
   makes the pipeline a _convergence_ tool for an already-ported package, not a
   porter for an unported one — for activejob/activestorage the RFC 0185
   trace/model sidecar is still required.
2. **trails' dependency APIs are not Rails' APIs** (~330 of 827 tsc errors). The
   generated code calls Arel / ActiveModel / ActiveSupport as Rails does, and the
   trails ports differ in member names, property-vs-method, option objects and
   presence: `ActiveModel::Type::Helpers::Mutable`
   (`connection_adapters/postgresql/oid/legacy_point.rb:8`) and
   `ActiveSupport::MessagePack::Extensions` (`message_pack.rb:75`) have no
   counterpart on the trails namespace objects; Rails passes trailing hashes
   where trails takes typed option objects.
3. **Ruby operators on typed values** (~125): `+`/`-`/`|`/`<=>`/`[]` on
   values whose trails type defines no named spelling; and splatted arguments
   into fixed-arity typed signatures (~70, TS2556).
4. **JS language limits** (ratified in CLAUDE.md, and real):
   `super(f(self))` — `encryption/derived_secret_key_provider.rb:8` calls
   `derive_key_from` inside `super`'s arguments, illegal before `super()` in JS;
   `await` in a constructor — `connection_pool.rb:275` `@reaper.run`;
   Ruby-only regex (`oid/money.rb:29` possessive `*+`, `oid/uuid.rb:8`
   conditional `(?(1)…)`); `method_missing` (`attribute_methods.rb:475`,
   `migration.rb:1044`) — records are not Proxies.
5. **External gems.** `PG::*` / `Mysql2::*` / `Trilogy::*` constants
   (`postgresql/database_statements.rb:142` `rescue PG::FeatureNotSupported`):
   the trails adapters use npm drivers and SQLSTATE codes; these must be hand
   ported (Trilogy is out of scope by ruling).
6. **The hand port's ratified deviations are not derivable from Ruby**:
   schema-cache peeks, prewarmed adapter facts, `registerModel`, the Relation
   thenable, `toSql`'s sync builders, `superFn`-style mixins. A generated file
   for those areas will always differ from the hand file at exactly the places
   CLAUDE.md ratifies, which is why identical call sets with the hand tree
   stay near 35% while call sets equal to Rails are 98.5%.

## Recommendation

1. **Use it as a convergence tool for activerecord, not a replacement.** Run it
   per file, diff against the hand file, and treat every difference outside a
   CLAUDE.md-ratified deviation as a fidelity finding. It already finds the
   cases where the hand port restructured Rails (the gap between 98.5% equal to
   Rails and ~35% equal to the hand port).
2. **Adopt the 8 behaviour-passing files and the 52 type-clean ones as a pilot**
   (one story each), reviewed like hand work. Measure review cost per file
   before scaling.
3. **Fix blocker 2 at the source, not in the generator**: file stories for the
   dependency surface Rails calls and trails lacks (the `swap-check.json`
   samples give file:message pairs). Each converged dependency member removes
   errors across many generated files.
4. **For unported gems (RFC 0185 / activejob)** keep the trace + model sidecar
   plan: this spike shows the IR, macro execution and lowering are not the risk;
   the type source is. Fold this generator's front-end (Prism IR + executed
   macros) and lowering into 0185 rather than starting a third design.
5. Retire the per-site rules into tables (they are currently code in
   `lower.ts`) before anyone else extends it.

Tooling: ~6.2k lines (`scripts/codegen/`), Ruby front-end 823, lowering 2.4k.
