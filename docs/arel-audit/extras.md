# Extras — files in our tree that don't have a 1:1 Rails counterpart

## Top-level

- **`predications-range.ts`** — extracted helper for the range-handling decision tree inside `between` / `notBetween`. Necessary because TS lacks a Ruby `Range` type, so `parseRange` normalizes `[begin, end]` / `{begin,end,excludeEnd?}` / `(begin, end, excludeEnd?)` into a single shape before the decision tree runs. Mirrors Rails' inline logic in `predications.rb`.
- **`quote-array.ts`** — adapter helper for quoting array values; used by `Predications#quotedArray`. Rails inlines the equivalent `Array#map { build_quoted }`.
- **`index.ts`** — package barrel; not in Rails (Rails uses `nodes.rb` / `visitors.rb` aggregator files).

## nodes/

Rails `nary.rb` bundles `Nary` + `And` + `Or` in one file via `Class.new(Nary)`. TS splits the two subclasses out so the dependency graph stays acyclic without a registry indirection:

- **`and.ts`** → Rails `Nary And` in `nary.rb`
- **`or.ts`** → Rails `Nary Or` in `nary.rb`

All other Rails-bundled subclasses live in their Rails file in TS too: `Bin`/`Not`/`Lateral`/`GroupingElement`/`Cube`/`RollUp`/`GroupingSet`/etc. live in `unary.ts`; `As`/`Assignment`/`Join`/`Union`/etc. live in `binary.ts`; `Sum`/`Max`/`Min`/`Avg`/`Exists` live in `function.ts`; `Distinct` lives in `terminal.ts`.

`equality.ts`, `in.ts`, `matches.ts`, `regexp.ts`, `count.ts`, `cte.ts`, `extract.ts`, `case.ts` — these all match Rails 1:1 (each has its own `.rb` file).

### api:compare implications

`api:compare` walks Rails files and looks for matching TS files. The split-out `and.ts` / `or.ts` are matched back against `nary.rb` via the existing rename/skip table — overall arel reports 884/884 (100%).

## visitors/

- **`default-quoter.ts`** — Trails-only quoter abstraction (62 LOC). See `visitors.md` for rationale.
- **`dispatch-contamination.test.ts`** — regression test for per-class dispatch cache isolation. TS-only mechanism.
- **`index.ts`** — barrel.

## Test fixtures (TS-only, not in Rails)

These pin behavior that Rails covers via implicit Ruby semantics:

- `attribute-alignment.test.ts` (115 LOC)
- `expression-mixins.test.ts` (124 LOC)
- `predications-privates.test.ts` (174 LOC)
- `predications-range.test.ts` (173 LOC)
- `quote-array.test.ts` (51 LOC)
- `factory-methods.test.ts` (111 LOC)
- `attributes.test.ts` (26 LOC)
- `nodes.test.ts` (22 LOC)

These are healthy and align with the "implementation-first" working principle.
