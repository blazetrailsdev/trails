# TS Extras — surface that exceeds Rails

This directory captures findings from `pnpm api:extra` — the inverse of
`pnpm api:compare`. Where `api:compare` answers _"which Rails methods are
missing in TS?"_, `api:extra` answers _"which TS methods have no Rails
counterpart in the matched file?"_

The audit exists to identify drift to prune toward Rails-faithful shape.
It is read-only; nothing here modifies source.

- See [patterns.md](patterns.md) for the recurring shapes (Ruby-private →
  TS-public promotion, `method_missing` → explicit dispatch, barrel
  re-exports, etc.).
- See [top-files.md](top-files.md) for a drill-down on the highest-value
  targets — what's there, why, and whether the noise is signal.

## Running

```bash
pnpm api:compare       # generates manifests if stale
pnpm api:extra         # default report — top 50 by novel count
pnpm api:extra --novel-only --max-detail 80 --top 20 --package activerecord
pnpm api:extra --json > out.json
```

Useful flags (full list in `--help`):

| Flag                         | Effect                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `--package <name>`           | Restrict to one Rails-mirroring package.                  |
| `--top <N>`                  | Number of files in the ranked top-N section (default 50). |
| `--novel-only`               | Drop "moved" extras entirely. Filters barrel-file noise.  |
| `--exclude-glob <substring>` | Repeatable. Skip TS files whose path contains substring.  |
| `--max-detail <N>`           | Cap per-file name listing (default 40, 0 = unlimited).    |
| `--json`                     | Machine-readable output.                                  |
| `FORCE_COLOR=0/1` env        | Override TTY detection for ANSI output.                   |

## What counts as an "extra"

For each Rails-mirroring package, for each `.rb` file with a matched `.ts`
counterpart (resolved by `conventions.rubyFileToTs`):

1. Collect public Ruby methods declared in or `include`d into the entities
   in that file.
2. Convert each Ruby name to its TS-candidate set via
   `conventions.rubyMethodToTs` (snake → camel, `?` → `is*`, `!` →
   `*Bang`, etc.). Skip `OPERATORS` and `SKIP` entries.
3. Walk mixins with namespace-scoped resolution (same as compare.ts's
   `flattenIncludedMethodInfos`): only `mod.instanceMethods` cross via
   `include`/`extend`, not the module's own `classMethods`. The
   `ActiveSupport::Concern` `ClassMethods` submodule is pre-folded into
   its parent's `classMethods` so ASC class methods still land as the
   parent's own entity-level surface.
4. Union all of the above into `allowed`.
5. Collect TS public method/getter/setter/function names in the matched
   `.ts` file (each class/module's _own_ methods, plus top-level
   `fileFunctions`). Filter out:
   - `internal: true` — Ruby/TS `private`/`protected`, TS `#`-fields,
     `@internal` JSDoc;
   - `_`-prefixed names — repo-wide Rails-private convention;
   - the `TS_ALWAYS_ALLOWED` set — TS overrides of Ruby methods on the
     `SKIP` list (`dup`, `clone`, `freeze`, `inspect`, `equals`, `eql`,
     `toH`, `toHash`, `toArray`, `valueOf`, `initializeDup`,
     `initializeCopy`, `klasses`, `[Symbol.for("nodejs.util.inspect.custom")]`).
     These ARE Rails-faithful (e.g. AR `Base#freeze` exists in
     `core.rb`); they only vanish from `allowed` because `rubyMethodToTs`
     returns null for them.
6. `extras = tsNames \ allowed`.
7. Each extra is classified:
   - **novel** — the candidate name appears _nowhere_ in any Rails file.
     High-signal: TS-only helpers, accidental public surface, Ruby-private
     methods promoted to TS-public.
   - **moved** — Rails defines the same name in some _other_ `.rb`. Often
     barrel-file re-exports, occasionally real misplacement.

## Ranking

Files are ranked by **novel count first**, then total. Barrel aggregators
(`connection-adapters.ts`: 150 novel / 438 moved) drop below smaller
novel-heavy files (`relation/finder-methods.ts`: 44 novel / 0 moved)
even though their raw totals are an order of magnitude smaller.

## Limits & known noise

- The novel-vs-moved distinction is per-name (camelized candidate), not
  per-method-signature. A TS method that takes different arguments than
  the Ruby one but shares a name will appear as "matched", not novel.
- The script ignores inheritance: a TS class extending a base picks up
  the base's surface, but we measure each file's _own_ declarations. If
  a parent is itself Rails-faithful and the child legitimately overrides
  one of its names, the override IS counted as the child's surface and
  diffed against the child's Rails counterpart.
- `barrel`-style `.ts` files re-export public surface from sibling files;
  their moved counts will always be high. Filter with
  `--exclude-glob connection-adapters.ts` for cleaner signal.
- TS-only language features (`[Symbol.iterator]`, `valueOf`,
  `[Symbol.toPrimitive]`) appear as novel when no SKIP-list entry maps
  to them. They're rarely accidental; eyeball each one.
