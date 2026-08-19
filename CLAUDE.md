# trails — Claude guide

The rules and conventions for working in this repo. For the Rails-port
methodology — working principles, the `@internal` JSDoc convention, and how to
measure progress — see [CONTRIBUTING.md](CONTRIBUTING.md). For project overview,
package list, and the `declare` / associations / enums / schema reference, see
[README.md](README.md).

## Fidelity is the job

trails is a re-implementation of Rails, not a library inspired by it. When a
file has a Rails counterpart, write it as close to the Ruby as TypeScript
allows. The bar is **"would a Rails dev recognize this as the same method"** —
not "does it pass the tests."

Mirror, method by method and line by line:

- **Names.** Method, class, module, constant, and field names come from Rails,
  translated by the rules in
  [docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md) — that file is
  generated from `scripts/parity/conventions.ts` and is what `parity:api`
  actually matches on, so read it _before_ you pick a name, not after CI
  disagrees. It also covers file paths (`PATH_SEGMENT_ALIASES`,
  `RUBY_FILE_TS_OVERRIDES`). If your name isn't the one that table produces
  from the Ruby name, you have a bug, not a preference.
- **Locals and parameters.** A local or parameter keeps the Rails identifier,
  camelCased — Ruby `stmt` is `stmt`, not `statement`; `klass` is `klass`, not
  `modelClass`. Same for parameter _order_ and defaults. This is free fidelity
  and it is most of what makes a body readable next to the Ruby.
- **Control flow.** Same branches, in the same order, with the same guards and
  early returns. Do not collapse two Rails branches into one, invert a guard,
  reorder side-effect-free calls, or drop a check you believe is unreachable.
- **Decomposition.** If Rails extracts a private helper, extract it, with the
  Rails name. If Rails inlines something, inline it. One Rails method is one TS
  method.
- **No extra abstraction.** Do not add a helper, wrapper, indirection layer, or
  "cleaner" rewrite that Rails does not have. Extra surface is measured —
  `pnpm parity:api:extra` reports every public TS name with no Ruby counterpart. If
  you genuinely need one, declare it with a `@noRailsEquivalent <reason>` JSDoc
  tag; that tag is the only sanctioned exception and the reason is reviewed.
- **Errors.** Same error class, same message string, same raise site.

**Only a genuine TypeScript language shortcoming can justify a deviation** —
and even then, converge the shape as far as the language allows and keep the
Rails name. There is almost always a way around:

- Ruby `x=` that must be async → keep the Rails name in a `setX()` method
  rather than renaming the concept (a TS `set` accessor can't be awaited).
- Ruby `include SomeModule` → `include()` / `Included<>` from
  `@blazetrails/activesupport`, or `this`-typed functions assigned to the class
  (see "Module mixins" below), so the code still lives in the Rails file at the
  Rails name.
- Ruby kwargs, blocks, and `method_missing` each have a settled trails idiom.
  Find it and use it; don't invent a new shape.

"TypeScript can't do this" is a claim you have to actually try to disprove
first. Deviation from Rails is almost always wrong; matching Rails is almost
always right. Every deviation you do ship is justified **at the call site**,
not in the PR body.

### A documented deviation is debt, not permission

Convergence is the goal. Every deviation register in this repo — the
`call-mismatches-exclude` baselines, `arity-exclude.json`, `@noRailsEquivalent`,
`@missingRailsCall`, `SKIP_GROUPS`, and every story under
`0023-surfaced-deviations` — is a **burndown ledger**, not a settled decision. A
row in one of them says "we know this is wrong and haven't fixed it yet." It is
never a licence to leave it, to copy the pattern into new code, or to add a
sibling row next to it.

So:

- **Finding an existing deviation next to your work is a reason to converge it,
  not to match it.** If it's out of scope for your PR, file it
  (`pnpm tasks new <rfc> <slug> --body-file <path>`) with the Rails `file:line`
  you already have in front of you. Do not silently propagate the shape.
- **A deviation-convergence story always converges.** Do not close one by
  writing a better justification for the deviation, by broadening a baseline
  reason, or by moving it to a different register. If it genuinely cannot
  converge, `pnpm tasks block` it with the specific blocker — but that is rare,
  and "it would be a bigger diff" is not one.
- **Never widen an allowlist to cover new work.** Baselines are only-shrink by
  construction; adding a row for code you are writing right now inverts the
  entire mechanism.
- **Only a genuine TypeScript language shortcoming is ratifiable**, and only
  after you have tried the settled workaround above. "Cleaner in TS", "more
  idiomatic", "the tests pass either way", and "this is how the rest of the file
  does it" are not language shortcomings.

### Ruby idioms that do not translate literally

These are the recurring silent-divergence traps. Check each one whenever you
port a body:

- **Truthiness.** Ruby's `if x` is false only for `nil`/`false`. `Boolean(x)`
  and `if (x)` are also false for `0`, `""`, and `NaN`. Port `if x` as
  `x != null && x !== false` — or just `x != null` once you have checked the
  value can't be a boolean — never as a bare truthiness test unless you have
  checked it can't be `0`/`""` either.
- **`fetch` vs `??`.** `h.fetch(:k, default)` returns the _stored_ value
  whenever the key exists — including a stored `nil` or `false`. `h.k ?? default`
  substitutes the default for `null`/`undefined`. They differ, and Rails
  relation readers depend on the difference.
- **`present?` / `blank?` / `presence`.** Use the ActiveSupport analogues, not
  `!!x` or `x?.length`. `" "` is blank in Ruby and truthy in JS.
- **kwargs.** A TS default parameter swallows an explicitly-passed `undefined`,
  so a caller forwarding an absent kwarg silently gets the default where Ruby
  would have seen `nil`. Match Ruby's kwarg semantics explicitly when it matters.
- **Predicates.** A Ruby predicate returns a value, not necessarily a boolean;
  a value-returning predicate ported as a `boolean` breaks every call site that
  used the value.
- **Bang methods** raise; the non-bang form returns falsy. Port both arms.
- **Symbols vs strings.** Where Rails accepts a Symbol _or_ a String, port both
  arms — dropping the string arm is a common silent gap.
- **A Ruby Symbol is a JS string, never a JS `Symbol`.** `:short` is `"short"`.
  JS `Symbol` / `Symbol.for` is reserved for private keys and brands — using it
  to model a Ruby Symbol value puts a type in the port that Rails devs don't
  read as a Symbol and that no other package uses. Where a method's control
  flow turns on `Symbol === x` (a Symbol meaning "look this up" against a
  String meaning "use this literally" — `I18n::Backend::Base#localize`'s
  `format`, a `:default` that names another key), keep the Symbol's leading
  colon in the string: `":short"`, and `.slice(1)` for its name. The colon is
  the discriminator Ruby gets from the type, and it is how the value already
  renders through `inspect`.

If you find a new instance, file it against the best-fit active RFC, else
`0023-surfaced-deviations`. RFC `0082-ruby-ts-idiom-conversion-classes` in the
tasks repo enumerates these as convergence classes.

## Working in this repo

- Do use worktrees for any changes; leave the default worktree for the user.
  Always use `scripts/start-worktree.sh` to start a worktree.
- **The Rails source of truth is vendored at `vendor/rails/`** (populated in
  every worktree by `start-worktree.sh`; refresh with `pnpm vendor:fetch` from
  the main worktree). Before porting or fixing anything, read the
  corresponding Rails code and test there — e.g.
  `vendor/rails/activerecord/lib/active_record/...` and
  `vendor/rails/activerecord/test/cases/...`. The canonical test schema is
  `vendor/rails/activerecord/test/schema/schema.rb`, which
  `packages/activerecord/src/test-helpers/test-schema.ts` mirrors — when a
  test needs a table or column, check schema.rb first; if it's not there,
  don't invent it. Likewise, Rails' test models live in
  `vendor/rails/activerecord/test/models/` (ours:
  `packages/activerecord/src/test-helpers/models/`) and its fixture data in
  `vendor/rails/activerecord/test/fixtures/` (ours:
  `packages/activerecord/src/test-helpers/fixtures/`) — mirror those too
  rather than making up models or fixture rows.
- To map a trails test name or method/constant to its vendored Rails
  `file:line` instead of hand-grepping, run `pnpm rails:find <query>` — it
  reuses the test-compare / api-compare manifests and falls back to a scoped
  grep of `vendor/rails/activerecord/`, tagging each result with the mode.
- Two reference tables answer "what do I call this?" without guessing, and both
  are CI-verified current:
  **[docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md)** for the
  Ruby→TS name and file-path translations `parity:api` matches on (generated
  from `scripts/parity/conventions.ts` — change the rule there, never
  hand-edit the doc), and `SKIP_GROUPS` / `SCOPED_SKIP_GROUPS` in that same
  source file for the members deliberately not mirrored, each with its reason.
  If you think a Ruby name has no reasonable TS spelling, check `SKIP_GROUPS`
  before inventing one.
- Do NOT use subagents unless explicitly requested.
- **AR work tracking lives in the `tasks` repo, not in docs.** Pick work via
  `pnpm tasks` (`ready` / `next-bundle` / `claim`) — never by hand-editing an
  `activerecord` plan doc. `docs/activerecord/` is frozen (RFC 0011 Phase 4);
  CI's `Docs ActiveRecord Freeze` job fails any PR that adds or modifies a
  file there (allowlist: `docs/activerecord/parity-verification.md`). Other
  `docs/` trees are not policed and stay live until their own cutover.
- **The `tasks` CLI itself lives in the tasks repo** (`scripts/cli.ts`, entered
  through its `bin/tasks`). trails' `pnpm tasks` is a shim,
  `scripts/tasks/tasks.sh`, that finds a tasks checkout and hands off; it does
  not set `$TASKS_DIR`, so the CLI still resolves the working tree it acts on
  from your cwd — your worktree's own `tasks/` symlink. `tasks` is also on the
  `PATH` (installed by `start-worktree.sh`) and works from any cwd. Fix CLI
  bugs in the tasks repo, not here.
- Do NOT add "Co-Authored-By" lines to commits or "Generated with Claude
  Code" lines to PR descriptions.
- After opening a PR, run the `/link` skill with the PR number so webhook
  notifications (reviews, CI failures) are delivered to this pane. Reviews
  land at `~/.btwhooks/data/github/blazetrailsdev/trails/$PR`.
- **Do NOT poll for CI results.** Once `/link` is run, CI outcomes arrive
  automatically via the webhook when the run finishes — no `gh pr checks`
  watch loops, no repeated `gh run` polling, no sleeping-and-rechecking
  (it just wastes turns). The webhook reports failures only: if the run fails
  a notification lands here, so no notification means CI passed. Move on after
  linking — don't wait around watching for a result.
- **Do NOT run the whole test suite locally** (`pnpm test`, `pnpm -r test`,
  `pnpm --filter activerecord test`, etc.). CI runs the full suite on every
  push. Locally, run only the individual test files or small groups you
  touched: `pnpm vitest run path/to/file.test.ts` or
  `pnpm vitest run -t "specific test name"`. The full AR suite forks 6
  workers per invocation; multiple parallel agents running it concurrently
  saturate the host (load avg 100+).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules.
- **PR size ceiling: the LOC number stated in your task prompt's "Hard rules"
  block** — that block is the single source of truth (btwhooks fills it from
  `PR_MAX_LOC`, so the number can be retuned without editing this file). Working
  without such a prompt? Keep the PR small and ask before opening a big one.
  Counted as additions + deletions, excluding lockfiles, snapshots, and
  generated parity fixtures; docs-only changes — `.md` files, READMEs, RFC/story
  prose — are exempt. Check before opening with
  `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**' ':!**/*.md'`
  (`.md` files are excluded because docs-only changes are exempt; subtract them
  manually if your PR mixes code and docs).
  Tests and fixtures count. The historical 20-method rule is a soft guide; the
  prompt's LOC ceiling is the hard one — review-cycle data shows PRs ≥400 LOC
  need 4–6 rounds minimum and ≥700 LOC need 13+, which is the band the ceiling
  is tuned within. **Do NOT fan out into
  sibling PRs yourself.** Keep each PR scoped to the single story you claimed;
  ship the portion that fits and register the rest as new stories. If the work
  is larger than one PR, or you discover additional work that belongs in a
  separate PR, do NOT open it yourself — add a new story to the epic with
  `pnpm tasks new <rfc-slug> <story-slug> --body-file <path>` so it gets
  scheduled and owned separately. **Capture the context you have right now:**
  `tasks new` refuses an empty/skeleton-only body, so pass `--body-file` with
  the `## Context` (the trails/Rails `file:line` you just read) and
  `## Acceptance criteria` — a title-only stub forces an expensive re-derivation
  later. (`--allow-empty` exists as an escape hatch but avoid it: the bare
  placeholder it creates is exactly the debt this rule and the guard prevent.)
  This keeps the one-agent-per-PR ownership model intact (a single
  agent fanning out N PRs and then dying orphans all of them — this happened).
  The only exception is a single mechanical rename — note it in the PR body.
- **Do NOT stack PRs.** Each PR branches from `main` and stands alone.
  We don't have spare CI runners or review bandwidth — stacked branches
  (`<base>b` off `<base>`, `<base>c` off `<base>b`, etc.) re-run CI on
  every parent rebase and force the reviewer to re-review the same
  diff multiple times. They also produce file-overlap conflicts with
  sibling agents working in parallel. If a feature needs splitting,
  open each split PR from `main` with **non-overlapping files**; if
  true ordering is required, ship the first PR, wait for merge, then
  open the next from updated `main`.
- Open new PRs in **draft** status.
- Do NOT reply to PR comments — replies are invisible to reviewers. Address
  feedback via code changes or PR description edits instead, or discuss with
  the user in conversation.
- Do NOT add code comments that just describe what a line does. Only add
  comments for non-obvious context (hidden bug, broader invariant, etc.).
- Do NOT add empty stubs or placeholder interfaces. If a feature isn't
  implemented yet, don't create an empty file for it.
- **NEVER rename or reword test names.** Test names are how `parity:test`
  matches our tests to Rails tests. If a test fails or the behavior doesn't
  match the name, fix the implementation — not the name. Read the
  corresponding Rails test first. The one thing that does change is the token
  renames in [docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md), which
  apply to test names too — trails spells `tse`, never `erb`, everywhere,
  including inside a `describe`/`it` string. Rails'
  `test "ERB::Util.html_escape should escape unsafe characters"` is
  `it("TSE::Util.html_escape should escape unsafe characters")`; `parity:test`
  normalizes both sides, so the renamed name still credits. `ERB` survives only
  where the text quotes the Ruby side (a `Mirrors:` JSDoc line, a Rails path).
- **Canonical tables only — no bespoke tables.** In AR tests, get the canonical
  schema + fixtures through `fixtures({ ... })` (the endgame surface: one call
  wires the handler, transactional fixtures, and the canonical schema); never
  re-declare a table inline or invent a free table name. For lower-level setup,
  the canonical loader (`loadCanonicalSchema` in `support/canonical-schema.ts`,
  `rebuildCanonicalTables` in `support/canonical-table-rebuild.ts`) lays the
  schema directly. Use the official
  models in `packages/activerecord/src/test-helpers/models/`. Table, column, and
  model names must match Rails exactly. If a test needs something the canonical
  schema lacks, add it to the canonical schema — do not reach for a bespoke
  schema. (`defineSchema` is the retired trails invention being removed by RFC
  0059; don't reach for it in new tests.)

## Before you open the PR

Run these in order. All of them are fast next to a review round, and each one
catches a class of drift a reviewer would otherwise spend a cycle on.

The compare tools live under the `parity:*` script namespace — `parity:api`,
`parity:test`, `parity:fixtures`, `parity:schema`, plus their sub-commands
(`parity:api:calls`, `parity:api:extra`, `parity:test:assertions`, …). The
older `api:*` / `test:compare` / `test:assertions:*` aliases are deprecated and
undocumented: they still delegate so a stale prompt or a muscle-memory
invocation keeps working, but they are scheduled for deletion. Never spell one
in a doc, a comment, a script, or a CI step — `parity:*` is the only name to
write.

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
   happened, which is how a sibling PR's deleted method surfaces as a STALE row
   on a branch that never touched it. `compare.ts` writes
   `call-mismatches.json` only under `--calls`, so if you need to
   force past a warm cache (it under-reports vs CI):

   ```bash
   API_COMPARE_FORCE=1 pnpm parity:api --calls
   ```

   (RFC 0084 folded the narrow RFC 0044 ratchet — a second gate over its own
   artifact — into this one, whose population subsumed it. There is one
   artifact and one baseline now, and since the rename one `parity:api:calls` script.)

   **New mismatch?** The right fix is almost always to make the TS body call
   what Rails calls. Baselining is the fallback, and it costs a reviewed
   one-line `reason` for the row **you** add — never leave the seeded
   placeholder there. But the debt metric for this baseline is the **row
   count**, not the unreviewed-reason count: rows converge by deletion, and
   inherited seed strings in rows your PR did not add are not yours to
   wordsmith and are not grounds to block a PR (RFC 0084; see
   [CONTRIBUTING.md](CONTRIBUTING.md#row-count-is-the-debt-metric-the-unreviewed-count-is-not)). A single justified omission can also carry a `@missingRailsCall`
   JSDoc tag at the call site instead.

   **Converged something?** The baseline is **only-shrink**: fixing a real
   divergence makes its baseline row stale and turns the gate red. Delete that
   one row by hand. Do **not** `--write`/reseed — a reseed rewrites the whole
   exclude tree and buries the one row you meant to retire in an unreviewable
   diff.

   Deleting the row lowers that source's unreviewed count below its committed
   high-water mark, so the gate then reports a **STALE high-water mark**. The
   remedy for that is narrow, not a reseed:

   ```bash
   pnpm parity:api:calls:tighten <package>/<tsFile .ts→.json>   # e.g. activerecord/insert-all.json
   pnpm parity:api:calls:tighten                                # every stale shard
   ```

   It rewrites only the named mark shards — never the exclude tree, never a
   shard you did not converge. `parity:api:calls:reseed` remains for a genuine
   reseed and is not the answer here.

   **Also run the call-ARGUMENT gate**, which the call-set one cannot see past
   — a body that calls what Rails calls, with a different argument list, is
   green on `parity:api:calls`:

   ```bash
   pnpm parity:api:calls:args   # the call-argument ratchet (RFC 0095)
   ```

   Same only-shrink contract, same no-reseed rule, over the SAME
   `call-mismatches-exclude/` shards — its rows carry `kind: "args"` and the
   argument list in the key, and each gate reads only its own kind. It gates
   `shape` rows — count, order, literal values, kwarg keys; `naming` rows (a
   `ref:` identifier spelled differently) are report-only via
   `pnpm parity:api:calls:args:report`. New row? Pass what Rails passes;
   baselining is the fallback and costs a reviewed one-line `reason`.

3. **Did you add any public TS name?** `pnpm parity:api:extra --package <pkg>` — it
   lists every public TS method, getter, class, and top-level function in a
   Rails-matched file with no Ruby counterpart. Anything you added and can't
   trace to a Ruby method is invented surface: delete it, fold it into the
   ported method, or tag it `@noRailsEquivalent <reason>`. Do **not** reach for
   a baseline allowlist to defer it. The tag is a receipt, not absolution — it
   says "known extra surface, not yet removed", and someone will come back for
   it.
4. **Working in `arel` or `activemodel`?** `pnpm lint --fix` after step 2 —
   `blazetrails/rails-file-structure-method-order` enforces Rails source order
   for class members and top-level functions and is autofixable, but it needs
   the manifest `pnpm parity:api` builds. Without a compare run it silently
   passes everything, then fails in the `Rails API/Test Comparison` CI job.
5. **`pnpm parity:api` / `pnpm parity:test`** deltas must be non-negative.

## Module mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. TS has no
language-level equivalent, so `@blazetrails/activesupport` supplies one for
each Ruby construct. **Pick by what the Ruby does** — the whole point is that
the TS reads back as the same mixin.

| Ruby                                | TypeScript                           |
| ----------------------------------- | ------------------------------------ |
| `include SomeModule`                | `include()` / `Included<>`           |
| `extend SomeModule`, `ClassMethods` | `extend()` / `Extended<>`            |
| `included do ... end`               | the `included` / `extended` hooks    |
| `class_attribute :foo`              | `classAttribute()`                   |
| one method, no module               | a `this`-typed function on the class |

**One method, no module.** Where Rails defines a single method rather than
mixing a module, assign a `this`-typed function directly:

```ts
// attribute-methods.ts
export function aliasAttribute(this: AttributeMethodHost, newName: string, oldName: string): void {
  this._attributeAliases[newName] = oldName;
}

// model.ts
import { aliasAttribute } from "./attribute-methods.js";
export class Model {
  static aliasAttribute = aliasAttribute;
}
```

Why: code lives in the file that matches Rails' layout (so `parity:api`
finds it), no delegation wrappers, type-checked via the host interface,
and `this` resolves to the actual subclass at runtime.

This form is for an _individual_ method. A run of `static X = X` lines
standing in for one Ruby `extend SomeModule` is a hand-rolled `extend` — use
`extend()` instead, so the mixin survives as one construct.

**Instance methods mixed in bulk** (Rails' `include QueryMethods`) —
`include()` / `Included<>`. See `activesupport/src/include.ts` and
`relation.ts` + `relation/query-methods.ts`.

**Class methods mixed in bulk** (Rails' `extend SomeModule`, and the
`ClassMethods` half of an `ActiveSupport::Concern`) — `extend()` /
`Extended<>`, which copies the module's methods onto the class object.

**An `included do ... end` block** — key a property on the module by the
`included` symbol `@blazetrails/activesupport` exports, and `include()` calls
it with the including class after the module's methods are installed, which is
where Ruby runs the block. `extend()` does the same with `extended`.

```ts
import { classAttribute, include, included } from "@blazetrails/activesupport";

// activemodel/src/validations.ts — mirrors `validations.rb:40-50`
const Validations = {
  // Ruby: `included do class_attribute :_validators, instance_writer: false, ... end`
  [included](base: AnyClass) {
    classAttribute.call(base, "_validators", { instanceWriter: false });
  },
};
include(Model, Validations);
```

The hooks are covered in `activesupport/src/include.test.ts` — "fires the
included callback after methods are copied" (`:111`) and "does not copy the
included symbol onto the prototype" (`:128`), plus the `extended` pair.

**`class_attribute :foo`** — `classAttribute()`, which already implements the
Rails semantics (reads walk the constructor chain, writes are local to the
class). Don't hand-roll copy-on-first-write per call site; a Ruby
`class_attribute` is one construct and must stay one.

When NOT to use these:

- A **string-named** `extended` / `included` / `inherited` method. Those names
  are Ruby lifecycle hooks; a TS method spelled that way is drift, not a
  mirror, which is why `SKIP_GROUPS` in `scripts/parity/conventions.ts` marks
  them `tsMirrorIsDrift: true` and `parity:api:extra` keeps flagging them. The
  hooks above are symbol-keyed, so they are not string-named members and never
  collide with that entry.
- `inherited` — unlike the other two it has **no** equivalent at all. JS has no
  hook that fires when a subclass is defined, so its Rails semantics have to be
  arranged some other way; say which, at the call site.
- If the method needs Model-specific state beyond the host interface,
  keep it in `model.ts` directly.

## Generated attribute readers are properties (`define_method_attribute`)

Ruby's `attr_reader`-shaped API is a zero-arg method, so `person.name` and
`person.name()` are the same call. TypeScript has no such equivalence: a
zero-arg Ruby reader **ports as an accessor property**, never as a method the
caller has to invoke. `person.name` is the whole surface a trails user sees,
and every consumer in the repo — serialization, dirty tracking, `toJSON`,
association writers — reads it that way.

That one decision has a fixed set of consequences, and they are ratified here,
repo-wide, so no port re-derives them at its own call site:

- **Every package that generates readers needs a `define_method_attribute`
  hook**, including ActiveModel — where Rails has none. Rails' bare
  `define_attribute_method_pattern`
  (`activemodel/lib/active_model/attribute_methods.rb:333-346`) falls through to
  `define_proxy_call`, which emits `def name; attribute("name"); end`; that
  shape cannot produce a property, so `respond_to?("define_method_attribute",
true)` must be true in trails wherever it is false in Ruby. Only ActiveRecord
  defines the hook upstream
  (`activerecord/lib/active_record/attribute_methods/read.rb:11`).
- **One descriptor carries both halves.** A `MethodSet` applies one descriptor
  per generated name (`code_generator.rb:32-36`) and a JS property cannot take
  its `get` from one and its `set` from another, so a generated reader property
  also carries the write half, and `define_method_attribute=`'s generated
  `name=` (`attributes.rb:92`) sits beside it rather than being its setter.
- **A generated reader must not shadow an inherited method.** Rails may freely
  let a reader shadow `to_json`, because a Ruby reader is still an ordinary
  method; a generated `toJSON` _property_ hands `JSON.stringify` a string where
  the runtime demands a function. So reader generation skips a name a class
  body already answers — the JS spelling of Rails'
  `!superclass.instance_method(name).owner.is_a?(GeneratedAttributeMethods)`
  (`activerecord/attribute_methods.rb:170-176`), which ActiveRecord gets from
  its `instance_method_already_implemented?` override.

This is a genuine language shortcoming, not a preference. Code implementing any
of the three cites **this section** — `@noRailsEquivalent` there is a pointer to
a ratified repo-wide rule, not a local justification, and a new instance is not
a new decision to argue.

## Call-time constant resolution (Ruby autoload → the zero-import slot)

Ruby resolves a constant named inside a method body when the method **runs**,
and Zeitwerk autoloads the file at that moment. So `contexts.rb:36` can name
`EncryptingOnlyEncryptor` and `config.rb` can name `DerivedSecretKeyProvider`
without either file taking a load-order dependency on them.

ESM has no equivalent. Every `import` is eager and evaluated before the
importing module's body, so naming a constant in a method body still costs a
module-eval edge. When that edge closes a cycle whose participants include a
`class Sub extends Super`, entering the graph at `super.ts` evaluates `Sub`
with `Super` still in TDZ and the module throws
`Cannot access 'Super' before initialization`.

**The settled answer is a zero-import slot module**: a file with no runtime
imports at all (so it cannot join any cycle) exporting a mutable binding plus a
`_setX()` setter, which the defining module calls at the bottom of its own
body. Readers import the binding from the slot and use it at call time, exactly
where Ruby resolves the constant. Two instances exist and are the only ones:

- `activerecord/src/encryption/configurable-slot.ts` — `Configurable`, read by
  `encryptor.ts`, `context.ts`, `scheme.ts`, `key-provider.ts`,
  `key-generator.ts`.
- `activerecord/src/associations/collection-proxy-slot.ts` — the
  `CollectionProxy` ctor, read by `associations.ts`.

This is a genuine language shortcoming, not a preference, and it is the one
sanctioned shape for it — do not re-derive a per-cluster justification, and do
not reach for a slot when a plain import does not actually close a cycle.
Verify both directions with a plain-node import of the **built** `dist/**.js`
modules as entry modules; a vitest run enters the funnel module first and masks
the TDZ, so a green suite proves nothing here.

Deferring the subclass edges instead (a slot per `extends` site) is the
alternative that looks smaller and does not work: nothing then loads the
subclass modules at all, so their self-registration never runs.
