# Parity gates before a PR

The full contract of each step in root `CLAUDE.md` § "Before you open the PR",
which keeps the checklist and the rules every gate shares. `§ "…"` references
name sections of the root file.

Run these in order. All of them are fast next to a review round, and each one
catches a class of drift a reviewer would otherwise spend a cycle on.

1. **Size.**
   `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**' ':!**/*.md'`
   — compare against the LOC ceiling in your prompt's "Hard rules" block (see
   Conventions).
2. **Did you touch a ported method body?** If yes, run the call-parity gate.
   It detects the highest-frequency fidelity miss in this repo: a TS body that
   omits a call the Rails body makes — a dropped delegation, an inlined helper,
   an invented shortcut.

   ```bash
   pnpm parity:api:calls   # the call-set ratchet (RFC 0047)
   ```

   The lint reads an artifact on disk and regenerates it first, so a plain
   gating run is enough — gating a stale artifact reports movement that never
   happened. `compare.ts` writes `call-mismatches.json` only under `--calls`,
   so if you need to force past a warm cache (it under-reports vs CI):

   ```bash
   API_COMPARE_FORCE=1 pnpm parity:api --calls
   ```

   **New mismatch?** The right fix is almost always to make the TS body call
   what Rails calls. Baselining is the fallback, and it costs a reviewed
   one-line `reason` for the row **you** add — never leave the seeded
   placeholder there. The debt metric for this baseline is the **row count**,
   not the unreviewed-reason count: rows converge by deletion, and inherited
   seed strings in rows your PR did not add are not yours to wordsmith and are
   not grounds to block a PR (RFC 0084; see
   [CONTRIBUTING.md](../CONTRIBUTING.md#row-count-is-the-debt-metric-the-unreviewed-count-is-not)).
   A single justified omission can also carry a `@missingRailsCall` JSDoc tag
   at the call site instead.

   **Converged something?** The baseline is **only-shrink**: fixing a real
   divergence makes its baseline row stale and turns the gate red. Delete that
   one row by hand. Do **not** `--write`/reseed — a reseed rewrites the whole
   exclude tree and buries the one row you meant to retire in an unreviewable
   diff. Deleting the row lowers that source's unreviewed count below its
   committed high-water mark, so the gate then reports a **STALE high-water
   mark**; the remedy is narrow:

   ```bash
   pnpm parity:api:calls:tighten <package>/<tsFile .ts→.json>   # e.g. activerecord/insert-all.json
   pnpm parity:api:calls:tighten                                # every stale shard
   ```

   It rewrites only the named mark shards — never the exclude tree.

   **Also run the call-ARGUMENT gate**, which the call-set one cannot see past
   — a body that calls what Rails calls, with a different argument list, is
   green on `parity:api:calls`:

   ```bash
   pnpm parity:api:calls:args   # the call-argument ratchet (RFC 0095)
   ```

   Same only-shrink contract, same no-reseed rule, over the SAME
   `call-mismatches-exclude/` shards — its rows carry `kind: "args"` and the
   argument list in the key, and each gate reads only its own kind. It gates
   `shape` rows — count, order, literal values, kwarg keys. `naming` rows (a
   `ref:` identifier spelled differently) are never baselined: in every
   package of the AR require-closure (resolved from `ar-closure.ts`) and in any
   other package listed in `NAMING_ENROLLED_PACKAGES` (only-grow, per RFC 0153,
   in `lint-call-args.ts`) every differing identifier is renamed to the Rails
   one or, when `classifyPair` files that pair permanent, receipted with
   `@missingRailsName <ruby_identifier> — PERMANENT|CONVERGEABLE <story-id>` on
   the enclosing declaration. A receipt on a convergeable pair, or one matching
   no row, reds the same gate. Everywhere else they remain report-only via
   `pnpm parity:api:calls:args:report`. New `shape` row? Pass what Rails
   passes; baselining is the fallback and costs a one-line `reason` on the
   baseline row. A single argument-shape deviation can instead carry a
   `@missingRailsArgs <ruby_call> — PERMANENT|CONVERGEABLE <story-id>` JSDoc tag
   at the call site — the call-ARGUMENT twin of `@missingRailsCall`. Its tag
   must open with `PERMANENT` or `CONVERGEABLE`; a tag claiming neither is an
   error, and a bare `CONVERGEABLE` with no story id is only half a receipt.

   **An arm or call your body ADDS to Rails'** — a branch Rails' method does
   not take, or a call it does not make — is invisible to both call gates, which
   flag only what Rails does and the port omits. Converge it away; where a
   ratified language shortcoming forces it, receipt it on the declaration with
   `@inventedArm <token> — PERMANENT|CONVERGEABLE <story-id>`, one tag per
   token: a control token the arms report files as invented for the pair (`if`,
   `loop`, `try`, `rescue`, `throw`), or the name of the call only the TS body
   makes. A receipt is per TOKEN, not per occurrence: one `if` receipt speaks
   for every invented `if` on the pair, and goes stale only when the pair
   invents no `if` at all. A call-name receipt discharges nothing, since no
   gate flags an extra call; it records the deviation at the declaration and
   goes stale when the body stops making the call. `pnpm parity:api:arms:throws`
   reds on a stale receipt and on one sitting on a declaration no skeleton row
   was written for.

   **Did you touch a constructor that inlines a Rails body?** Its
   `@inlinedFrom` tags are gated both ways (RFC 0188; see § "A module's
   `initialize` is inlined into the constructor"):

   ```bash
   pnpm parity:api:inlined       # the inlined-from staleness gate
   pnpm parity:api:inlined:fix   # rewrite a stale citation from the manifest
   ```

   It reds on a tag naming a module with no `initialize` (or a `ClassMethods`
   with no `new`), a module the Rails class does not include, prepend or
   extend, a `def` in the constructor's own mirrored Ruby file, a tag written
   twice or out of Ruby's chain order, or a citation that differs from the
   `def` span in `rails-api.json`. Only the last has an autofix. A nested
   `ClassMethods` counts as extended only through an explicit `extend` or a
   module that extends `ActiveSupport::Concern`. The reverse arm, a constructor missing the tag for a cross-file
   body its Rails class reaches, gates the packages in `MISSING_TAG_PACKAGES`
   of `scripts/api-compare/lint-inlined-from.ts`. That set is **only-grow**: a
   package joins in the PR that converts its constructors.

3. **Did you touch a signature?** Parameter NAMES are gated too (RFC 0126) —
   `parity:api` prints a `params N/M` figure beside `arity`, `--params` lists
   every differing position, and

   ```bash
   pnpm parity:api:params   # the parameter-name ratchet
   ```

   fails on any increase over the committed per-package/per-file mark for the
   packages in `GATED_PACKAGES` of `scripts/api-compare/param-name-mark.ts`;
   other packages are measured and reported and join by their own story. A
   parameter keeps the Rails identifier, camelCased — so the fix is the rename,
   never the mark. Converged one? `pnpm parity:api:params:tighten` writes the
   mark DOWN; there is no reseed.

   **Did you port a Ruby predicate?** `foo?` is answered by `isFoo` (or a
   member whose type holds a boolean), never by a value-typed `foo` getter.

   ```bash
   pnpm parity:api:predicates   # the predicate-kind ratchet (RFC 0156)
   ```

   counts, per package, each `foo?` credited only through a `foo` whose type
   cannot hold a boolean, against `scripts/api-compare/predicate-kind-mark.json`.
   Only-shrink: the fix is the predicate, never the mark. Converged one?
   `pnpm parity:api:predicates:tighten`; there is no reseed.

4. **Did you add any public TS name?** `pnpm parity:api:extra --package <pkg>` — it
   lists every public TS method, getter, class, and top-level function in a
   Rails-matched file with no Ruby counterpart. Anything you added and can't
   trace to a Ruby method is invented surface: delete it, fold it into the
   ported method, or tag it `@noRailsEquivalent <reason>`. Do **not** reach for
   a baseline allowlist to defer it. The tag is a receipt, not absolution — it
   says "known extra surface, not yet removed", and someone will come back for
   it.

   The extra-surface ratchet (RFC 0117) gates the packages recorded in
   `scripts/api-compare/extra-surface-mark.json`, with the pinned/rowless
   regimes implemented in `scripts/api-compare/extra-surface-mark.ts`:

   ```bash
   pnpm parity:api:extra:gate
   ```

   It is **only-shrink** for every gated package, like the two call gates: a
   new public name with no Ruby counterpart raises `novel` or `total` and turns
   it red, and the fix is to remove the name — never to raise the mark.
   **Converged something?** Narrow the mark with
   `pnpm parity:api:extra:tighten`, which writes each dimension DOWN and never
   up. There is **no reseed**. Three regimes exist, and the mark file is the
   record of which package is in which:
   - **Gated with a row**: `novel` and `total` ratchet down from the row.
     A member carrying its `@noRailsEquivalent PERMANENT` receipt is subtracted
     from both, so a receipted addition is mark-neutral (ruby-compat's
     inventory grows this way). The receipt does not prove a call site; that
     package's rule 1 is not enforced by this gate (see
     [its README](../packages/ruby-compat/README.md#1-only-what-trails-actually-calls)).
   - **Pinned**: a package that has burnt its untagged novel surface to zero has
     `novel` pinned at the constant 0 regardless of its row, so widening the row
     cannot clear a red run. The only remedies are a
     `@noRailsEquivalent PERMANENT|CONVERGEABLE <story-id>` receipt at the
     declaration, or deleting the name. Being pinned does **not** exempt
     `total`: a moved-not-novel extra is a name Rails defines in another `.rb`,
     and nothing else in the repo catches that cross-file relocation.
   - **Rowless**: a package that burns `total` to zero as well carries no row,
     both dimensions are the constant 0, and the gate fails if a row is
     re-added. Every extra there — novel or moved — needs a receipt at its
     declaration, a deletion, or a relocation to the file mirroring the `.rb`
     that defines it.

   A package is pinned or made rowless as a reviewed step of its own burndown
   RFC. That direction is **only-grow**: no package is ever un-pinned to turn a
   red run green, and widening `GATED_PACKAGES` is a separate decision with its
   own burndown, not a mechanical step.

5. **Did you write an `@internal` tag?** `@internal` keeps its TypeDoc meaning —
   it holds a member out of the generated API reference — but it also drops the
   member from the measured surface entirely, so an `@internal` with nothing
   behind it hides extra surface for free. Two rules police the pair, both over
   `eslint/rails-private-methods.json` (built by `pnpm rails-privates:manifest`
   from `rails-api.json`, so both run in the `rails-comparison` CI job):
   - `blazetrails/rails-private-jsdoc` **requires** `@internal` where the Rails
     counterpart is private on every host in that Ruby file. Autofixable.
   - `blazetrails/unbacked-internal-needs-receipt` (RFC 0121) is the reverse: a
     public declaration carrying `@internal` whose (file, name) is absent from
     the manifest must ALSO carry a `@noRailsEquivalent PERMANENT|CONVERGEABLE`
     receipt, which wins in the extractor so the member re-enters the measured
     surface and is scored `Allowed` rather than vanishing. Not autofixable — the
     remedies are a receipt in one of the two shapes above, or deleting a tag
     that was never earned.
     (A real TS `private`/`protected`/`#` member still confers internal
     unconditionally; only the JSDoc tag yields.)

   The reverse rule ships behind a **per-package enrollment set** — its `files`
   list in `eslint.config.mjs` and `eslint/rails-private-jsdoc.config.mjs`, which
   must stay in sync. That set is **only-grow**: a package joins once its tags
   are burnt down (one story per package under RFC 0121), and no package is ever
   removed to turn a red run green.

6. **Working in `arel` or `activemodel`?** `pnpm lint --fix` after step 2 —
   `blazetrails/rails-file-structure-method-order` enforces Rails source order
   for class members and top-level functions and is autofixable, but it needs
   the manifest `pnpm parity:api` builds. Without a compare run it silently
   passes everything, then fails in the `Rails API/Test Comparison` CI job.
7. **`pnpm parity:api` / `pnpm parity:test`** deltas must be non-negative.
8. **Left a promise unawaited, or started one in a constructor?**
   `pnpm parity:promises` (RFC 0234) counts, per package, the
   `@typescript-eslint/no-floating-promises` findings (repo-wide, sources and
   tests, `ignoreVoid: false`, so `void <promise>` is one) and the
   `blazetrails/constructor-creates-no-promise` findings, against
   `scripts/parity/promise-count-mark.json`. Both rules are `warn` in
   `eslint.config.mjs`; this gate is what reds. It is **only-shrink** with no
   reseed: a package absent from the mark is held at 0, a finding converges by
   awaiting, returning or handing the promise to a `Thread` (async
   `initialize` work moves to `static async new` behind a `protected`
   constructor), and `pnpm parity:promises:tighten` writes each mark DOWN
   after a convergence. CI runs `pnpm parity:promises:ci` over the packages
   the PR changes.

## Bump ledger (`parity:api:pins:ledger`)

RFC 0191 § 3. `scripts/parity/bump-ledger/<source>.json` lists the pairs a
`ref` bump drifted or removed. `parity:api:pins` passes a ledgered pair;
`parity:api:pins:ledger` keeps the ledger only-shrink. See CONTRIBUTING.md
§ "Body pins".
