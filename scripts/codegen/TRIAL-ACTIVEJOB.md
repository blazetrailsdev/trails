# Trial: the generator on activejob (2026-10-16)

`CODEGEN_GEM=activejob` runs the same pipeline over
`vendor/rails/v8.0.2/activejob/lib` (49 Ruby files, ~3.8k lines) into
`packages/activejob/codegen-out/`. The hand port has 10 of those files.
Row: `scripts/codegen/measurements-activejob.jsonl` (`trial-1`).

## Measured

| measure                                                 | generated                                              | hand port today |
| ------------------------------------------------------- | ------------------------------------------------------ | --------------- |
| methods matched (`parity:api`)                          | **369/369 (100%)**                                     | 31/369 (8.4%)   |
| files                                                   | 38/38                                                  | 8/38            |
| inheritance                                             | 21/22                                                  | 3/3             |
| arity / param names                                     | 186/186 / 130/130                                      | 23/23 / 19/19   |
| call sets equal to Rails                                | 186/186                                                | —               |
| call argument lists equal                               | 288/298 (2 shape, 8 naming)                            | —               |
| `parity:api:inlined`                                    | OK                                                     | OK              |
| generator declines                                      | 35 statements, all unresolved constants                | —               |
| tsc, generated tree alone                               | 44 errors in 17/50 files                               | —               |
| type oracle                                             | 6 async members (activerecord's: 2,415)                | —               |
| whole tree swapped in, hand tests kept (`swap-tree.sh`) | tsc 43, none in tests; **6/7 test files fail at load** | 7/7 pass        |

## Why the tests fail

Every failure is a load-time crash before any assertion, in the same place:
`ActiveJob::Callbacks` (`callbacks.rb:28-34`) does
`class << self; include ActiveSupport::Callbacks; define_callbacks :execute; end`,
giving the module object its own callback chain through its singleton class. A
ruby-compat `Module` has no singleton class for a Concern's `ClassMethods` to
land on, so `Callbacks.defineCallbacks` is undefined. `Base` includes
`Callbacks`, and every test imports `Base`. That is a mechanism decision (how a
module's singleton class is ported), not a lowering bug.

Behind it, the expected gap: with 6 async members in the oracle, the generated
bodies place almost no `await`s, and activejob's enqueue / perform / adapter
paths are async in trails. The 44 tsc errors understate this: almost every
value is `any`, so the checker sees little. The 100% name parity says the
surface is right; it says nothing about async behaviour.

The other unresolved constants are Ruby's `::Time` (17) and the third-party
queue-adapter gems (Resque, Sidekiq, Delayed Job, Que, Sneakers, Backburner,
SuckerPunch), which would be ported by hand or left out, as Trilogy is.

## Generator changes this trial made (they apply to activerecord too)

- `src/gem.ts`: one `CODEGEN_GEM` setting for the Ruby source, output package,
  type oracle, citation prefix and measurement scripts.
- A mixin module's `attr_*` are `mod.attrReader` / `mod.attrWriter` on its
  ruby-compat `Module` (`ActiveJob::Core`'s 23 attributes; activerecord's
  methods 6934 → 6951, inheritance 213 → 219).
- A module that extends `ActiveSupport::Concern` is emitted in the hand port's
  concern shape: `extend(X, Concern)`, and `included do` as
  `X.included(null, function () { … })`, so a concern it includes is deferred
  as in Ruby; `class << self; include M` is `extend(X, M)`.
- `include Singleton` is the hand port's static `instance()`.
- The gem's namespace module reuses the hand port's `namespaces.ts` seat.
- `swap-tree.sh` swaps the whole generated tree in and runs the hand tests.

## Recommendation

Not landable as a package. Two things stand between this output and a PR:

1. **A ported shape for a module's singleton class** (`class << self` inside a
   module that includes a Concern). Decide it once; the generator then emits it.
2. **Types for the unported 39 files.** The async decisions the oracle supplies
   for activerecord have no source here. RFC 0185's trace / model sidecar is
   the plan for exactly this; until it exists, a generated activejob type-checks
   and matches every Rails name while its async paths are wrong.

What is landable now: the generator changes above, and per-file use as a
starting point for the hand port (each generated file reviewed like hand work),
which is RFC 0185's `codegen-pilot-activejob-generation-run`.
