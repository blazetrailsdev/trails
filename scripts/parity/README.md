# Parity tooling — layout and baselines

The parity comparison tools live in four sibling directories, all driven
through the `parity:*` scripts in the root `package.json` (the older `api:*` /
`test:compare` aliases still delegate, but they are deprecated and deliberately
undocumented — write `parity:*` everywhere).

| Directory                   | Subject compared                      | Entry point  |
| --------------------------- | ------------------------------------- | ------------ |
| `scripts/api-compare/`      | Ruby → TS public API surface          | `compare.ts` |
| `scripts/test-compare/`     | Rails tests → trails tests            | `compare.ts` |
| `scripts/fixtures-compare/` | Rails fixtures/models → trails ones   | `compare.ts` |
| `scripts/schema-compare/`   | `schema.rb` → the canonical TS schema | `compare.ts` |

`scripts/parity/` itself holds what all four share — `conventions.ts` (the
Ruby→TS name and path translation table, and the source `docs/ruby-ts-conventions.md`
is generated from), `unported-files/`, and the manifest writer.

`unported-files/` is the exclusion register. One module per `package` value
plus `unscoped.ts` for the entries that carry no `package` (those match across
every package — that is what "unscoped" means, and it is why they cannot be
filed under a package name). `index.ts` concatenates them into `UNPORTED_FILES`
and owns the three `is*Unported` predicates every consumer imports through the
`@blazetrails/parity/unported-files` subpath; `types.ts` is the single home for
the entry schema and the `UnportedFile` type. Never move an entry between
modules by adding or removing its `package` field — that changes what
parity:api and parity:test exclude.

`baseline.json` is the pre-split snapshot of the register, held to an
only-shrink rule: adding an exclusion never touches it, and retiring a
pre-split entry means deleting that one row by hand in the same commit.

## Naming rules

- **The main entry point of a compare dir is `compare.ts`**, with its test as
  `compare.test.ts`. (`test-compare/test-compare.ts` was renamed to
  `compare.ts` under RFC 0092; historic CI log parsing in
  `scripts/sync-stats/sync.ts` still recognizes the old name.)
- **A lint entry point is `lint-<subject>.ts`** — a file you can run directly,
  which exits non-zero when its baseline has moved the wrong way. Everything a
  lint entry point imports is a plain library module named for its contents,
  not `lint-`-prefixed. `assertion-ratchet.ts` is such a library: it holds the
  mark contract that `lint-assertion-mismatches.ts` enforces, and is not itself
  an entry point.

## The legacy-spelling gate

`lint-legacy-script-names.ts` (`pnpm parity:legacy-names`, and a step in the
`Rails API/Test Comparison` job) fails on any retired compare-script spelling
anywhere outside `vendor/rails/` and build output. The deprecated aliases in
the root `package.json` keep out-of-repo callers working; they are not a
licence to write the old names in a comment, a doc or a script. The fix for a
hit is always the `parity:*` spelling — the three-entry allowlist in
`legacy-script-names.ts` is closed.

## Everything in the namespace is read-only unless asked to write

A bare `parity:*` invocation reports and exits; writing is always an explicit
flag (`--write` on the ratchets, `--reseed` on the baselines). That includes
`parity:test:stubs`, which lists the stub files it _would_ generate and creates
none until you pass `--write` — it used to write by default, and a single
verification run once produced 200 files that a `git add -A` swept into a
commit.

## The AR closure rollup

`parity:api` prints an `AR closure` line beside `Data layer`: the data-layer
packages plus only those support-gem files ActiveRecord/ActiveModel actually
`require`. `api-compare/ar-closure.ts` derives that file set by walking
`require` lines from `vendor/rails/{activerecord,activemodel}/lib`
transitively and writes `api-compare/output/ar-closure.json` on every run, so a
moved `require` changes the scope with no code change.

## Baselines, marks and excludes

Every file below records **known, unfixed divergence**. They are all
**only-shrink**: a row is a debt entry saying "we know this is wrong and have
not fixed it yet", never a licence to leave it, to copy the shape into new
code, or to add a sibling row for code you are writing right now. Converging a
divergence makes its row stale and turns the gate red — delete that one row by
hand.

| Path                                        | Kind              | Enforced by                    |
| ------------------------------------------- | ----------------- | ------------------------------ |
| `api-compare/call-mismatches-exclude/`      | exclude (sharded) | `lint-call-mismatches.ts`      |
| `api-compare/call-mismatches-wide-exclude/` | exclude (sharded) | `lint-call-mismatches.ts`      |
| `api-compare/call-mismatches-unreviewed/`   | mark (sharded)    | `lint-call-mismatches.ts`      |
| `api-compare/arity-exclude.json`            | exclude           | `lint-arity-excludes.ts`       |
| `api-compare/inheritance-exclude.json`      | exclude           | `lint-inheritance-excludes.ts` |
| `api-compare/body-pins.json`                | pin               | `lint-body-pins.ts`            |
| `test-compare/assertion-mismatch-mark.json` | mark              | `lint-assertion-mismatches.ts` |
| `schema-compare/invented-baseline.json`     | baseline          | `schema-compare/compare.ts`    |

**Do not move these files.** They are referenced by path from CI workflow steps
and from the lint tooling, and the sharded ones (`call-mismatches-*`) are split
per source file so that sibling branches touching different files do not
conflict.

**Do not hand-edit the JSON, and do not `--write`/reseed to add a row.** Write
through `serializeBaseline` (`api-compare/baseline-json.ts`): a naive
`JSON.stringify`/`json.dumps` escapes non-ASCII punctuation such as em-dashes
and reds the unit tests. A reseed rewrites the whole tree and buries the one
row you meant to add in an unreviewable diff.

For the api-compare call gate specifically, the debt metric is the **row
count**, not the unreviewed-reason count — see
[CONTRIBUTING.md](../../CONTRIBUTING.md#row-count-is-the-debt-metric-the-unreviewed-count-is-not).
