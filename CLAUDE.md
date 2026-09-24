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
  you genuinely need one, declare it with a `@noRailsEquivalent` JSDoc tag; that
  tag is the only sanctioned exception. A receipt has exactly two shapes and
  carries no prose: `PERMANENT`, where the token is the whole receipt, and
  `CONVERGEABLE <story-id>`, where the story IS the receipt and the tag only
  points at it. `no-freeform-comments` strips anything else.
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
`@missingRailsCall`, `SKIP_GROUPS`, and every story in a
`<package>-surfaced-deviations` bucket — is a **burndown ledger**, not a settled
decision. A row in one of them says "we know this is wrong and haven't fixed it yet." It is
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
- **`symbolize_keys` on an option hash.** A JS object has one key type, so an
  option hash Rails normalizes with `symbolize_keys` stays bare-keyed, keyed by
  the camelCase spelling of the Symbol's name (`:only_path` is `onlyPath`), and
  the call is omitted (RFC 0149). Call `symbolizeKeys` only where Symbol-ness
  is observable: the hash is rendered by `inspect` / `rbInspect`, control flow
  turns on `Symbol === key`, or it meets a hash already carrying `":name"`
  keys. `symbolize_keys` is in `NO_JS_CALL_FORM`, so the call gate will not
  catch a wrong omission. Check these three cases yourself.
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

If you find a new instance, file it against the best-fit active RFC, else the
`<package>-surfaced-deviations` bucket for the package it is about — one exists
per package (`pnpm tasks list | grep surfaced-deviations`), and
`0023-surfaced-deviations` is retired as the catch-all, so do not file there.
RFC `0082-ruby-ts-idiom-conversion-classes` in the tasks repo enumerates these
as convergence classes.

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
  `activerecord` plan doc, and never by hand-editing a story's `status:` or
  `pr:` (see "Task state vs. task prose" below — that edit does nothing and
  fails CI). `docs/activerecord/` is frozen (RFC 0011 Phase 4);
  CI's `Docs ActiveRecord Freeze` job fails any PR that adds or modifies a
  file there (allowlist: `docs/activerecord/parity-verification.md`). Other
  `docs/` trees are not policed and stay live until their own cutover.
- **The `tasks` CLI itself lives in the tasks repo** (`src/cli.ts`, entered
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
- **The compiler is TypeScript 7.1** (an exact `7.1.0-dev` nightly, root
  `package.json`). `pnpm build` / `pnpm typecheck` compile the workspace cold
  in ~10s, and the bare `typescript` import is only a version string: package
  code reaches the compiler through `typescript/unstable/*`. The classic 5.x
  API survives only as the `typescript-5` alias (5.9.3), for `scripts/`
  (import it by that name, never as bare `typescript`), `trails-tsc`, and the
  lint/typedoc toolchain, whose peers `.pnpmfile.cjs` moves (RFC 0125).
- **Do NOT run the whole test suite locally** (`pnpm test`, `pnpm -r test`,
  `pnpm --filter activerecord test`, etc.). CI runs the full suite on every
  push. Locally, run only the individual test files or small groups you
  touched: `pnpm vitest run path/to/file.test.ts` or
  `pnpm vitest run -t "specific test name"`. The full AR suite forks 6
  workers per invocation; multiple parallel agents running it concurrently
  saturate the host (load avg 100+).

### Task state vs. task prose

The tasks repo is a **SQLite database plus markdown**, not git-as-database. A
story's _prose and structure_ live in the `.md` file and change by PR; a story's
_state_ lives in the DB and changes only through a `tasks` verb. Every
frontmatter field has exactly one authority, and the two sets are disjoint —
which is why `tasks ingest` (git → DB) and `tasks export` (DB → git) can both
run without ever fighting over a field.

| Owner        | Fields                                                                                       | Changed by                     |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------ |
| **Markdown** | `title`, `rfc`, `cluster`, `deps`, `deps-rfc`, `est-loc`, `priority`, `packages`, body prose | edit the file, open a PR       |
| **Database** | `status`, `pr`, `claim`, `assignee`, `blocked-by`, `closed-reason`, `updated`                | a `tasks` verb — never by hand |

Two rules of thumb cover every field, including ones this table forgets:

- **Rewriting what the work IS** — retitling, resizing `est-loc`, adding a
  dependency, rewriting acceptance criteria — is a markdown edit. Edit the file,
  commit, open a PR; ingest picks it up when the PR merges.
- **Recording what HAPPENED to the work** — claimed, in progress, done, blocked,
  closed — is a verb: `tasks claim <id>` (`--assignee <name>` for `assignee`),
  `tasks in-progress <id> --pr trails#N`, `tasks done <id> --pr trails#N`
  (the PR is `repo#N` — `tasks#94`, `trailmap#22` for other repos; a bare
  number is refused),
  `tasks block <id> <reason>`, `tasks close <id> <reason>`,
  `tasks status-set <id> <status>` for anything else. `updated` is stamped by
  whichever verb you ran.

**Hand-editing a DB-owned field is the one failure worth spelling out**, because
it is silent rather than loud: ingest skips DB-owned columns by design, so
`status: done` typed into a story file reads correctly to a human, merges
cleanly, and marks nothing done. The tasks repo's CI runs an owned-fields guard
that turns that into a red naming the verb to use instead — but the rule is the
point, not the guard, and the guard only judges stories your PR _modified_.

Two traps follow from the DB being a real, _shared_ database:

- **`tasks ingest` is a sync verb, not an inspection verb.** It publishes what
  is on your branch into the shared DB. Do not reach for it to check that a
  branch's stories parse — that is `pnpm tasks show` / `pnpm tasks list` /
  `pnpm validate`. Running ingest from a worktree published 10 unmerged stories
  into the shared DB once already.
- **A worktree's `.git` is a pointer file into the main checkout**, so the
  `.git/tasks.db` your worktree resolves IS the shared database — every other
  agent reads and writes the same rows. Gitignored does not mean local.

**Creating a story is authoring, so it is markdown**: `pnpm tasks new <rfc>
<slug> --body-file <path>` writes the file, commits it, and ingests it to create
the row. Do not insert a row any other way. The `status:` in a _brand-new_ file
is honored as a birth seed on insert only and ignored by every later ingest — a
seed value, not a sync value, which is why the CI guard judges modified stories
and not added ones.

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
  the canonical loader (`loadCanonicalSchema` in `support/canonical-schema.ts`)
  lays the schema directly. Use the official
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
   `shape` rows — count, order, literal values, kwarg keys. `naming` rows (a
   `ref:` identifier spelled differently) are never baselined: in a package
   listed in `NAMING_ENROLLED_PACKAGES` (only-grow, per RFC 0153, in
   `lint-call-args.ts`) every differing identifier is renamed to the Rails
   one or, when `classifyPair` files that pair permanent, receipted with
   `@missingRailsName <ruby_identifier> — PERMANENT|CONVERGEABLE <story-id>` on
   the enclosing declaration. A receipt on a convergeable pair, or one matching
   no row, reds the same gate. Elsewhere they are report-only via
   `pnpm parity:api:calls:args:report`. New `shape` row? Pass what Rails passes;
   baselining is the fallback and costs a one-line `reason` on the baseline row.
   A single argument-shape deviation can instead carry a
   `@missingRailsArgs <ruby_call> — PERMANENT|CONVERGEABLE <story-id>` JSDoc tag
   at the call site — the call-ARGUMENT twin of
   `@missingRailsCall` — which suppresses the flag with no baseline row. Its
   tag must open with `PERMANENT` or `CONVERGEABLE`, the same permanence
   discipline `parity:api:extra` enforces on `@noRailsEquivalent`; a tag
   claiming neither is an error, not an assumed PERMANENT, and a bare
   `CONVERGEABLE` with no story id is only half a receipt.

3. **Did you touch a signature?** Parameter NAMES are gated too (RFC 0126) —
   `parity:api` prints a `params N/M` figure beside `arity`, `--params` lists
   every differing position, and

   ```bash
   pnpm parity:api:params   # the parameter-name ratchet
   ```

   fails on any increase over the committed per-package/per-file mark. arel is
   enrolled (at 0); other packages are measured and reported and join by their
   own story. A parameter keeps the Rails identifier, camelCased — so the fix is
   the rename, never the mark. Converged one? `pnpm parity:api:params:tighten`
   writes the mark DOWN; there is no reseed.

4. **Did you add any public TS name?** `pnpm parity:api:extra --package <pkg>` — it
   lists every public TS method, getter, class, and top-level function in a
   Rails-matched file with no Ruby counterpart. Anything you added and can't
   trace to a Ruby method is invented surface: delete it, fold it into the
   ported method, or tag it `@noRailsEquivalent <reason>`. Do **not** reach for
   a baseline allowlist to defer it. The tag is a receipt, not absolution — it
   says "known extra surface, not yet removed", and someone will come back for
   it.

   **`arel`, `activerecord` and `ruby-compat` are gated**, by the RFC 0117
   extra-surface ratchet:

   ```bash
   pnpm parity:api:extra:gate
   ```

   It reads the committed marks in `scripts/api-compare/extra-surface-mark.json`
   and is **only-shrink** for every gated package, like the two call gates: a
   new public name with no Ruby counterpart raises `novel` or `total` and turns
   it red, and the fix is to remove the name — never to raise the mark.
   **Converged something?** The mark then sits above the measurement; narrow it
   with `pnpm parity:api:extra:tighten`, which writes each dimension DOWN and
   never up. There is **no reseed**, for the same reason the call baselines
   forbid one.

   `ruby-compat` is no exception, although its surface is inventory rather
   than debt: every move story adds MRI surface. A member carrying its
   `@noRailsEquivalent PERMANENT` receipt (the package's rule 2) is subtracted
   from both `novel` and `total`, so a receipted addition moves neither and
   growth is mark-neutral. An unreceipted one reds the gate and wants the
   receipt, not a bigger mark. The receipt does not prove a call site: the
   package's rule 1 is not enforced by this gate (see
   [its README](packages/ruby-compat/README.md#1-only-what-trails-actually-calls)).

   A package that has burnt its untagged novel surface to zero (`arel` today)
   is additionally **pinned**: its `novel` is the constant 0 regardless of what
   its row says, so widening the row cannot clear a red run. The only two
   remedies are a `@noRailsEquivalent PERMANENT|CONVERGEABLE <story-id>`
   receipt at the declaration, or deleting the name. That is where every gated
   package is headed — a receipt lives in the file you are already editing, so
   it never conflicts the way a shared counter does.

   Being pinned does **not** exempt `total`. A moved-not-novel extra is a name
   Rails does define, just in another `.rb`, and nothing else in the repo
   catches that: `rails-file-structure-method-order` orders members within one
   file and cannot see a cross-file relocation, and `parity:api:moves` only
   reports. So `total` stays gated in both modes.

   A package that burns `total` to zero as well (`activerecord` today) is
   **rowless**: both `novel` and `total` are the constant 0, it carries **no
   row** in the mark file, and the gate fails if one is re-added. Every extra
   there — novel or moved — needs a receipt at its declaration, a deletion, or
   a relocation to the file mirroring the `.rb` that defines it.

   A package gets pinned as a reviewed step of its own burndown (the
   `activerecord-extra-surface-receipt-burndown` RFC for activerecord's 342 novel
   and 396 moved, now rowless;
   RFC 0129 for ruby-compat's 4). That direction is **only-grow**: no package
   is ever un-pinned to turn a red run green. Other packages are still measured
   and ungated; widening `GATED_PACKAGES` is a separate decision with its own
   burndown, not a mechanical step.

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

## Module mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. TS has no
equivalent, so we use **`this`-typed functions assigned directly to the class**.

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

For **instance methods mixed in bulk** (like Rails' `include QueryMethods`),
use `include()` / `Included<>` from `@blazetrails/activesupport`. See
`ruby-compat/src/include.ts` and `relation.ts` + `relation/query-methods.ts`.

When NOT to use this:

- A **string-named** `extended` / `included` / `inherited` method. Those names
  are Ruby lifecycle hooks; a TS method spelled that way is drift, not a
  mirror, which is why `SKIP_GROUPS` in `scripts/parity/conventions.ts` marks
  them `tsMirrorIsDrift: true` and `parity:api:extra` keeps flagging them.
- If the method needs Model-specific state beyond the host interface,
  keep it in `model.ts` directly.

`included` and `extended` themselves **do** have a TS equivalent, and the
sentence above is only about the spelling. `include()` / `extend()` fire
callbacks keyed by the exported `included` / `extended` symbols
(`Symbol.for("@blazetrails/ruby-compat:included")`, see
`ruby-compat/src/include.ts`), which is how you port an
`included do ... end` block. Because they are symbol-keyed they are not public
string-named members, so they never collide with the `SKIP_GROUPS` entry above.
Only `inherited` has no equivalent — JS has no hook that fires when a subclass
is defined, so its Rails semantics have to be deferred some other way.

The class-method half of a Concern is `extend()` / `Extended<>`, the mirror of
Ruby `extend SomeModule` — reach for it instead of hand-assigning
`static x = x` onto the class. And an `included do class_attribute :foo ... end`
is `classAttribute()` from `@blazetrails/activesupport`, which already gives
Rails' semantics (reads walk the constructor chain, writes are local to the
class); do not hand-roll copy-on-first-write per call site.

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
- **The reader and writer halves carry different types.** A Rails writer takes
  the raw value (`_write_attribute(name, value)`,
  `activerecord/attribute_methods/write.rb:36`) and the reader returns the cast
  one (`_read_attribute`, `read.rb:35`), so no single field type is honest. A
  generated member is emitted as a `get name(): CastType` /
  `set name(value: unknown)` pair — in an interface that merges with the model
  class, since a class body cannot hold a bodiless accessor. A hand-written
  `declare` may name the reader type alone wherever nothing writes a raw value
  to it.
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

## Serialization's dual sync/async hash (`serializable_hash` / `as_json`)

Ruby's `serializable_add_includes`
(`activemodel/lib/active_model/serialization.rb:191`) reads an association
synchronously — `if records = send(association)` — and `CollectionProxy#to_ary`
lazily loads it in-line at `serialization.rb:143`. In trails an association read
is async, so an `include:`-bearing `serializable_hash` cannot be fully
synchronous.

**The settled answer is the dual-shape return** — `thenableHash` in
`activemodel/src/serialization.ts` builds a Proxy that is both a plain hash and
a `PromiseLike`. Read a key off it and you get the synchronous hash, where an
unloaded `include:` fails loud rather than silently serializing nothing;
`await` it and the includes are lazily loaded first, which is where Ruby's
in-line `to_ary` load lands. `asJsonThenable` is the same shape for
`ActiveModel::Serializers::JSON#as_json`
(`activemodel/lib/active_model/serializers/json.rb:96-110`), and
`serializableHash`'s third parameter is the module-private sync re-entry flag
the Proxy calls back through.

**The alternative — `serializableHash` / `asJson` returning `Promise`
unconditionally, the way RFC 0063 made `isValid()` return `Promise<boolean>` —
was considered and rejected, because an async `asJson` propagates through the
whole JSON encoder and takes `to_json` with it.** `asJson` is not one method;
it is the recursive dispatcher at
`activesupport/src/core-ext/object/json.ts:256`, standing in for Ruby's
`as_json` method lookup, and there are ~19 `asJson` definitions feeding it.
`Array.asJson` recurses per element back through that dispatcher (`:125-137`)
and `Enumerable.asJson` delegates to `Array.asJson` (`:85-89`), so any
collection containing a model goes async. `JSONGemEncoder#jsonify`
(`activesupport/src/json/encoding.ts:40`, Rails'
`activesupport/lib/active_support/json/encoding.rb`) recurses through `asJson`
for every nested node, so the encoder goes async; `Encoding#encode`
(`encoding.ts:19`) and its call sites follow, and **`to_json` returns a
Promise** where Rails' returns a String
(`activesupport/lib/active_support/core_ext/object/json.rb:35-43`). That is a
fidelity loss at a more prominent Rails surface than the thenable it would
remove. And it does not even buy the simplification: `jsonify` would still need
a synchronous path for the `JSON.stringify` case, so the same sync/async split
survives — relocated out of one contained Proxy and duplicated across every
`asJson` definition in the repo.

**The `JSON.stringify` → `toJSON` path is not the binding constraint.**
`JSON.stringify` does call `toJSON` synchronously and never awaits, and trails'
`toJSON` (`activesupport/src/core-ext/object/json.ts:47-60`, the port of
`ActiveSupport::ToJsonWithActiveSupportEncoder#to_json`) returns
`this.asJson()` from inside that synchronous call — but on that path `toJSON`
receives only the property key and calls `asJson()` with **no options**, so
there is no `include:` to load and nothing to await. It is a fixable coupling,
not a wall; do not mistake it for the decision's foundation. There is also no
third shape: `to_json` is Rails-facing API, so it cannot be dropped to buy the
uniform Promise.

This is a genuine language shortcoming — JS has no synchronous await and no
lazily-loading collection read — and it is ratified repo-wide here.
`thenableHash`, `asJsonThenable` and `preloadIncludes` carry
`@noRailsEquivalent PERMANENT` receipts against this section, and the
`SerializableHash` type and the `sync` re-entry parameter exist to serve them.
Do not re-derive the decision per call site, and do not file a story to make
them `Promise`.

## `Relation` is evaluated by an async query (`records`, and the predicates it carries)

Ruby's `Relation` is an Enumerable, and every call that needs the records
themselves reaches them through `records`
(`activerecord/lib/active_record/relation.rb:342-345`), which calls `load`
(`:1179-1186`) and runs the query **synchronously**. Some terminal calls answer
without materializing anything — an unloaded `size` is `count(:all)` and an
unloaded `empty?` is `!exists?` (`:352-369`) — but those run a query
synchronously too. Nothing in Rails' relation surface is a promise, so a
`Relation` is both the query and its result, and a predicate that needs a
second query to build itself can just run it in place.

In trails the query is `await`ed, and that costs three shapes Rails has no
counterpart for:

- **`applyThenable` / `stripThenable`** (`relation/thenable.ts`). `await rel`
  has to evaluate the relation, so `Relation.prototype` carries `then` /
  `catch` / `finally` forwarding to `toArray()`. That makes every `Relation` a
  thenable, which JS then unwraps automatically anywhere one is _returned_ from
  an `async` body — so a builder that returns a relation would evaluate it.
  `stripThenable` is the `then`-hiding Proxy view that lets a relation be
  returned without being run. This is the same language shortcoming
  § "Serialization's dual sync/async hash" ratifies for `serializable_hash`,
  one layer down.
- **`DeferredIdsIn` / `DeferredIdsNotIn`**
  (`relation/predicate-builder/deferred-distinct-pk-in.ts`). Two predicate
  builders need ids that only a query can produce, and both are reached from
  synchronous Rails bodies: `RelationHandler#call`
  (`relation/predicate_builder/relation_handler.rb:5-25`) reads `value.arel`
  after `apply_join_dependency`, and `Relation#excluding`
  (`relation/query_methods.rb`) builds a `NOT IN` over records. Where Rails runs
  that query in line, trails parks an `Arel::Nodes::In` / `NotIn` subclass
  carrying the thunks, and `Relation#_materializeDeferredDistinctPkPredicates`
  drains them on the way to SQL. The pair exists so `invert()` keeps working
  (`WhereClause#invert`) while the ids are still unresolved.
- **The synchronous eager builders behind `toSql`** — `Relation#toSql`,
  `_buildEagerOperandManager`, `_applyEagerJoinDependency`,
  `_materializeDeferredDistinctPkPredicates` (all `relation.ts`), and the
  `ConnectionPool#withConnectionSync` call `toSql` runs them through. Rails'
  `Relation#to_sql` (`relation.rb:1210-1221`) returns a String: its
  `eager_loading?` arm goes through `apply_join_dependency`, the other through
  `model.with_connection { |conn| conn.unprepared_statement { conn.to_sql(arel) } }`.
  Two independent constraints keep trails' `toSql(): string` synchronous. First,
  `_buildEagerOperandManager` reads `this._model.primaryKey`, a synchronous
  reader because a JS constructor cannot await — the reader § "Schema
  reflection peeks at a warm cache" ratifies — so an async builder would force
  that reader async and break `new Post()`. Second, an async builder turns a
  prominent Rails String API into `Promise<string>`, and `toSql` is also read
  from sync paths that have nothing to do with construction: the relation `==`
  (`other.toSql() === this.toSql()`) and the query-cache key
  (`computeCacheKey`). Nor is a synchronous `with_connection` seam expressible:
  `ConnectionPool#withConnection` is `async`, so a sync seam can only serve an
  already-leased connection — which is exactly the lease `withConnectionSync`
  hands `toSql`. That is the settled shape, not a gap. This ratifies the sync
  builders and `toSql`'s sync surface only; the synchronous _lease_ behind
  `withConnectionSync` stays under § "Schema reflection peeks at a warm
  cache"'s scope boundary.

This is a genuine language shortcoming — JS has no synchronous await — and it is
ratified repo-wide here. Those names carry `@noRailsEquivalent PERMANENT`
receipts against this section, and `toSql`'s omitted `apply_join_dependency` /
`with_connection` calls carry `@missingRailsCall … — PERMANENT`; do not
re-derive the decision per call site, and do not file a story to remove them or
to make `toSql` async.

## Override arity (Ruby does not check it; TypeScript does)

Ruby lets a subclass replace an inherited method's parameter list outright.
`AbstractAdapter#fetch_type_metadata` takes one argument
(`activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1717`),
MySQL's override adds `extra` (`mysql/schema_statements.rb:221`), and
PostgreSQL's replaces the list entirely with
`(column_name, sql_type, oid, fmod)` (`postgresql/schema_statements.rb:995`).
No arity check runs, so all three are legal and all three are read as the same
method.

TypeScript checks a derived member against the base member and rejects a
derived signature that requires MORE arguments than the base publishes:

```text
TS2416: Property 'fetchTypeMetadata' in type 'SchemaStatements' is not
assignable to the same property in base type 'SchemaStatements'.
  Target signature provides too few arguments. Expected 4 or more, but got 1.
```

Every route around it was tried and each one loses more fidelity than it buys:

- **An overload set** compiles, because TypeScript checks the override against
  the WHOLE list — but the only arrangement that type-checks makes
  `PostgreSQLAdapter` publish a 1-argument signature its body never answers.
- **Optional parameters** on the override (`sqlType?: string`) satisfy the
  arity check by declaring parameters Rails declares as required, and force
  `undefined` narrowing into a body that is otherwise line-for-line.
- **Defaults** on the override are worse still: they invent values Rails has no
  counterpart for.
- **Breaking the inheritance edge** — porting the override as a `this`-typed
  module function, or as a class property — does not help: the check follows
  any inheritance path, `override` keyword or not.

So the base declares the Rails signature plus a rest parameter that carries the
overrides' extra arguments and nothing else:

```ts
fetchTypeMetadata(sqlType: string | null, ..._rest: unknown[]): SqlTypeMetadata
```

The rest parameter is named `_rest` and is never read. It is not extra API
surface (`parity:api:extra` scores members, not parameters) and it is not a
renamed Rails parameter (`parity:api:params` compares the positions Rails
declares, which still spell Rails' identifiers), which is why none of the three
existing JSDoc receipts — `@noRailsEquivalent` for extra surface,
`@missingRailsCall` for an omitted call, `@missingRailsArgs` for a call site's
argument shape — fits it: there is nothing for them to suppress. This section
is its receipt.

This is a genuine language shortcoming, not a preference, and it is ratified
repo-wide here. Code carrying an override-arity rest parameter cites **this
section**; a new instance is not a new decision to argue. Two rules bound it:
the rest parameter exists ONLY to admit an override's wider list — never to let
a caller pass arguments Rails has no parameter for — and it is spelled
`..._rest: unknown[]`, so a grep finds every instance.

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
where Ruby resolves the constant. Two instances exist and are the only ones, plus the namespace
modules converged onto `Autoload`:

- `arel/src/namespaces.ts` — not a slot: the `Arel` / `Arel::Attributes` /
  `Arel::Nodes` / `Arel::Visitors` namespace objects, extended with
  `ActiveSupport::Autoload` (RFC 0151). Each constant is `autoload`ed there,
  seated by its defining module (`Nodes.Not = Not`) and read as a property at
  call time (`new Nodes.Not(this)`). `Nodes` and `Visitors` are also the
  public `Arel.Nodes` / `Arel.Visitors` exports: every class seats itself on
  them in its defining module, and a type-only `declare namespace` of the same
  name carries the type side. This is the shape the remaining slots
  converge onto.
- `activesupport/src/namespaces.ts`, `actionview/src/namespaces.ts`,
  `actionpack/src/namespaces.ts` — not slots: the `ActiveSupport`, `ActionView`
  and `ActionDispatch` namespace objects, shaped like arel's.
  `ActionView.Base` (`action_view.rb:37`, read by `handlers/erb.rb:86`,
  `log_subscriber.rb:59`, `digestor.rb:39`); `ActionDispatch.Request`
  (`action_dispatch.rb:63`, read by `http/headers.rb:55`,
  `content_security_policy.rb:46`, `permissions_policy.rb:42`,
  `middleware/cookies.rb:705`). A constant Rails `require`s rather than
  autoloads is seated on its namespace with no `autoload` call:
  `ActiveSupport.BroadcastLogger` (`active_support.rb:30`, read at
  `logger.rb:21`), and `Attribute.UserProvidedDefault` on the class Rails nests
  it in (`attribute_registration.rb:5`).
- `activesupport/src/namespaces.ts`'s `TopLevel` — not a slot: Ruby's
  top-level `Object`, where a top-level constant lives when the gem reading it
  does not depend on the gem defining it, or when it is `::Rails` itself. The
  defining gem seats it (`TopLevel.Trails = Trails` in `trailties/src/rails.ts`,
  `TopLevel.ActionDispatch` / `TopLevel.ActionController` in
  `actionpack/src/namespaces.ts`, which are actionpack's own namespace objects),
  and a reader names it at call time: `TopLevel.Trails!.env` for `Rails.env.local?`
  (`engine.rb:592`), `new TopLevel.ActionDispatch!.Request(env)`
  (`shard_selector.rb:41`, `database_selector.rb:64`),
  `TopLevel.ActionController!.Parameters` and
  `TopLevel.ActionDispatch!.Routing.PolymorphicRoutes.HelperMethodBuilder`
  (`routing_url_for.rb:92,109`). A read carries a guard only where Rails has a
  `defined?`: `TopLevel.Trails?.logger` (`deprecation/behaviors.rb:27`,
  `testing/tagged_logging.rb:23`, `log_subscriber.rb:94`) and
  `TopLevel.Trails !== undefined` (`action_controller/log_subscriber.rb:40`).
  A `globalThis` seat was the alternative; it was rejected because a
  `declare global` in a published `.d.ts` puts `Trails` and `ActionDispatch` in
  every consumer's global scope. `ActionView::RoutingUrlFor#url_for`'s `super`
  (`routing_url_for.rb:80-136`) is a real `super`: the
  `on_load(:action_controller)` hook (`railtie.rb:97-101`) includes UrlFor as a
  live `Module`, whose link is spliced into `RoutingUrlFor`'s ancestry, because
  `include()` flattens a plain-object module beneath the class's own methods.
- `activerecord/src/namespaces.ts` — not a slot: the `ActiveRecord`,
  `ActiveRecord::Associations`, `ActiveRecord::ConnectionAdapters`,
  `ActiveRecord::Encryption` and `ActiveRecord::Migration` namespace objects, extended with
  `ActiveSupport::Autoload` exactly like arel's (RFC 0151). Autoloaded there,
  mirroring `active_record.rb:43-112`, `associations.rb:15,29-41`,
  `encryption.rb:14` and `migration.rb:573`: `ActiveRecord.Base`,
  `.ConnectionHandling` (`DEFAULT_ENV`, `connection_handling.rb:7`),
  `.ModelSchema` (`derive_join_table_name`, `migration/join_table.rb:12`),
  `.Fixture` (Rails has no `autoload :Fixture`: it is defined in `active_record/fixtures.rb`,
  which `active_record.rb:54`'s `autoload :FixtureSet` loads; its `Fixture::FixtureError`
  (`fixtures.rb:809`) is raised at
  `abstract/database_statements.rb:615`), and `.Relation`, `.AssociationRelation` and
  `.DisableJoinsAssociationRelation`, which `Delegation.delegated_classes` reads
  (`relation/delegation.rb:7-15`); the six
  concrete association ctors `AssociationReflection#association_class` returns
  (`reflection.rb:889-923`), `Associations.CollectionProxy` and
  `Associations.DisableJoinsAssociationScope` (`associations/association.rb:107-115`);
  `Encryption.Configurable`, which encryption.ts `extend`s onto `Encryption`
  itself with `Contexts`, as `encryption.rb:47-48` does `include Configurable` /
  `include Contexts`, so readers spell `Encryption.config.x`; `Migration.Compatibility` (`migration.rb:629-631`,
  `schema.rb:72`); `ConnectionAdapters.ConnectionPool`
  (`connection_adapters.rb:107-110`, read by `abstract/query_cache.rb:100` for
  `ConnectionPool::WeakThreadKeyMap`), and `ConnectionAdapters.register` /
  `.resolve`, the module's singleton methods (`connection_adapters.rb:22-50`,
  read by `database_config.rb:17`), seated by connection-adapters.ts;
  `ActiveRecord.Migration` (`active_record.rb:60`). Every `autoload` seat
  registers its `Namespace::Const` path with `constantize` as it is seated, as
  Ruby's `Module#autoload` defines the constant. `ActiveRecord.Point`
  (`postgresql/oid/point.rb:4`) is required, not autoloaded, and is seated with
  no `autoload` call. The cycles they break are the ones the deleted slots broke:
  `base.ts` importing every `self == Base` reader; `class SingularAssociation` /
  `CollectionAssociation extends Association` reaching `reflection.ts`; `class
AssociationRelation extends Relation`; `V8_0 = Current`; and
  `schema-statements.ts -> join-table.ts -> model-schema.ts ->
connection-handling.ts -> … -> abstract-adapter.ts`, whose module-scope
  `include(AbstractAdapter, SchemaStatements)` reads `SchemaStatements` in TDZ,
  and `query-cache.ts -> connection-pool.ts -> abstract-adapter.ts`, whose
  `include(AbstractAdapter, QueryCacheMixin)` reads `QueryCacheMixin` in TDZ.
  `connection-adapters/abstract-adapter.ts` reads `ActiveRecord.Base?.logger ?? null` in the constructor
  (`abstract_adapter.rb:132,140`). That read on a standalone adapter's own
  path is one of the two guarded autoload reads, falling back to the value Rails'
  autoloaded `active_record.rb` would hold. The other is
  `connection-adapters/abstract/query-cache.ts`'s `dirties_query_cache` arm,
  `ActiveRecord.Base?.connectionHandler` (`abstract/query_cache.rb:24-25`,
  `connection_handling.rb:258-262`), which a standalone adapter's `execute`
  reaches. An
  adapter is a standalone public entry point, constructed and queried with no
  model layer loaded at all (the whole `sqlite-drivers` lane), so an unseated
  `Base` there is not a load-order bug but a legitimate configuration. A read
  is added to this exception only when that lane is shown to reach it. A seat that
  has moved onto the `ActiveRecord` module (`active-record.ts`) needs no guard:
  the module is a plain import, and it holds the Rails default
  itself — which is how `queryTransformers()` in `preprocessQuery`,
  `disablePreparedStatements()` in the adapter constructor,
  `lazilyLoadSchemaCache()` in `ConnectionPool#new_connection`, and
  `asyncQueryExecutor()` in `abstract-adapter.ts` and
  `ConnectionPool#build_async_executor` left the slot.
  Every `ActiveRecord` singleton config seat (`active_record.rb:182-491`'s
  `singleton_class.attr_*` block) and its `def self.` methods live on the
  `ActiveRecord` module in `active-record.ts`, where `parity:api` records them
  against `active_record.rb` itself, and `Base` holds none of them.
- `activerecord/src/reflection-slot.ts` — the `Reflection` module, read by
  `associations/builder/association.ts` for `Builder::Association.create_reflection`
  (`associations/builder/association.rb:40-51` names `ActiveRecord::Reflection.create`
  at call time). The cycle is `builder/singular-association.ts ->
builder/association.ts -> reflection.ts -> associations.ts -> builder/has-one.ts`,
  whose `class HasOne extends SingularAssociation` reads `SingularAssociation` in
  TDZ when a builder is the entry module.
- `activerecord/src/tasks/database-tasks-slot.ts` — `DatabaseTasks`, read by
  `migration.ts` for `ActiveRecord::Tasks::DatabaseTasks`
  (`migration.rb:151-183,696,750,1037-1041,1361-1365`). `database-tasks.ts`
  imports `migration.ts` and `connection-handling.ts`, so a plain import back
  re-enters the `schema-statements.ts -> migration/command-recorder.ts ->
migration.ts` cycle `ActiveRecord.ConnectionHandling` breaks.

This is a genuine language shortcoming, not a preference, and it is the one
sanctioned shape for it — do not re-derive a per-cluster justification, and do
not reach for a slot when a plain import does not actually close a cycle.
Verify both directions with a plain-node import of the **built** `dist/**.js`
modules as entry modules; a vitest run enters the funnel module first and masks
the TDZ, so a green suite proves nothing here.

Deferring the subclass edges instead (a slot per `extends` site) is the
alternative that looks smaller and does not work: nothing then loads the
subclass modules at all, so their self-registration never runs.

**A slot read carries no guard**, because the Ruby body it mirrors carries none:
`Arel::Nodes::Node#not` is `Nodes::Not.new self` (`arel/nodes/node.rb:122`) and
raises `NameError` if the constant will not resolve. So a reader is written
`new _Not!(this)`, and an unset slot surfaces as a plain `TypeError` at the call
site — the JS analogue of that `NameError`. A `throw` explaining that the caller
deep-imported the module is invented surface: it is a guard Rails does not have,
in a body that is otherwise line-for-line. This is the one place the decision is
recorded; do not re-derive it per slot or per call site.

## The pool monitor guards only sections that span an `await` (`ConnectionPool`'s `MonitorMixin`)

Rails' `ConnectionPool` is a monitor (`include MonitorMixin`,
`activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb:217`),
and trails' takes that monitor through ruby-compat's `synchronize`, which keys
it on the receiver — `synchronize.call(this, block)` is Ruby's bare
`synchronize do` self-call, with no extra member on the class. A monitor
excludes other callers only while its holder is
suspended, and a JS body with no `await` cannot be suspended: nothing else runs
until it returns. So a `synchronize do` whose body is synchronous in trails is
already atomic, and wrapping it would change nothing but its return type.

That is the whole constraint, and it splits Rails' sections in two:

- **Ported onto the monitor**: `checkout`'s pinned branch (`:550-567`), whose body
  awaits `verify!`. It nests inside the pinned connection's `lock` exactly as
  Rails nests it, and keeps the `:553` re-check. `disconnect` (`:454`),
  `discard!` (`:485`) and `clear_reloadable_connections` (`:507`) are on it too:
  their bodies await each connection's `disconnect!` / close, and
  `with_exclusively_acquired_all_connections` is async, because
  `checkout_for_exclusive_access` (`:802-820`) awaits `checkout` inside the
  monitor exactly as Rails' `attempt_to_checkout_all_existing_connections`
  (`:753-800`) calls it.
- **Not wrapped**: `connections` (`:443`) and the queue's `synchronize`
  (`connection_pool/queue.rb:80-81`, a bare `block()` in `queue.ts`). Their
  trails bodies contain no `await`, and `connections` is a synchronous reader in
  Rails, so it could not await the monitor even if it needed to.

This is a genuine language shortcoming, ratified repo-wide here. If one of those
bodies ever gains an `await`, it gains the monitor in the same change.

## Method visibility is not a runtime fact in JS (`basic_obj_respond_to`'s `pub`)

Ruby's `basic_obj_respond_to` (`vendor/ruby/vm_method.c:2864-2879`) takes a
`pub` flag and hands it to `method_boundp`, so `respond_to?(:m)` and
`respond_to?(:m, true)` can answer differently for the same receiver: the first
sees public and protected methods, the second also sees private ones. Visibility
is a property of the method entry, readable at run time.

JS has no such fact to read, and both of its would-be carriers fail in opposite
directions:

- A `#private` field or method is not a string-named property at all, so
  `"#x" in obj` is false — it is invisible at BOTH `pub` values, where Ruby
  reports it at `pub = 0`. There is no reflection API that reaches it; that is
  the point of the syntax.
- A TS `private` / `protected` member is a compile-time annotation with no
  runtime residue: it is emitted as an ordinary property, so `in` reports it at
  BOTH `pub` values, where Ruby hides it at `pub = 1`.

So the prototype-chain lookup of `mid` is the whole of `method_boundp` here —
the nearest own descriptor answers, and an own `undefined` value is
`Module#undefMethod`'s `VM_METHOD_TYPE_UNDEF` entry, which answers false — and
`pub` cannot change its answer. The parameter is still declared and still plumbed — Rails'
`ActiveModel::AttributeMethods#respond_to?`
(`activemodel/lib/active_model/attribute_methods.rb:528-533`) makes two `super`
calls that differ only in it, and dropping it collapses them into one call
eslint's `no-dupe-else-if` rejects as a dead branch — but its body is
`void pub;`.

This is a genuine language shortcoming, not a preference, and it is ratified
repo-wide here. `basicObjRespondTo` (`packages/ruby-compat/src/object.ts`) cites
**this section**; a call site that passes `pub` is not re-deriving the decision,
and there is no story to make `in` visibility-aware.

## Schema reflection peeks at a warm cache (`load_schema!`'s `schema_cache.columns_hash`)

Rails' `ModelSchema#load_schema!`
(`activerecord/lib/active_record/model_schema.rb:587-597`) reads
`schema_cache.columns_hash(table_name)` at `:592` synchronously, and a cold
cache is no special case: the schema cache runs the reflection query in line,
because in Ruby every query is synchronous. So every caller that needs
`columns_hash`, `primary_key` or `table_exists?` can reach the database from a
plain method body.

In trails a cold cache needs a query, and a query is `await`ed. A warm cache
needs nothing. So the divergence is confined to the cold path, and the settled
shape splits it the same way:

- **Warming is an explicit async step.** `SchemaCache#columnsHash`,
  `#primaryKeys` and `#dataSourceExists` are the async ports, and
  `loadSchemaFromAdapter` (`model-schema.ts`) warms all three inside a
  `withConnection` scope and then enters the single `loadSchemaBang` body.
  `SchemaReflection#loadAllBang` / `BoundSchemaReflection#loadAllBang` and
  `SchemaReflection.eagerLoadSchemaCache` warm a whole pool up front.
- **Synchronous readers peek.** `SchemaCache#getCachedColumnsHash`,
  `#getCachedDataSourceExists`, `#getCachedPrimaryKeys`, `#setColumns` and
  `SchemaReflection#loadedCache` read or seed the memo maps and never query.
  The warm precondition is that one of the async steps above has already run
  for that table on that pool.
- **A cold peek answers `undefined`, never a query.** Each sync reader treats
  it as "not reflected yet": `loadSchemaFromCacheSync` (`model-schema.ts`)
  returns `false` and leaves the model unloaded, `cachedTableExists` returns
  `undefined` (unknown), and `getPrimaryKey`
  (`attribute-methods/primary-key.ts`) falls through to the `"id"` convention —
  the same answer its `table_exists?` arm gives an absent table. The one exception is `warmColumnsHashSync`, which
  seeds the cache when the adapter's `columns` itself answers synchronously (a
  fake test adapter); a real adapter's promise is dropped with its rejection
  handled, and the cold answer stands.

The alternatives each lose more than they buy:

- **Making every reader async** propagates through `columns_hash`,
  `attribute_types`, `type_for_attribute`, Arel type-casting and
  `Relation#to_sql`, which are synchronous Rails-facing API — the same cascade
  § "Serialization's dual sync/async hash" rejects for `as_json`.
- **Blocking on the query** is not available: JS has no synchronous await.
- **Answering a cold column read with an empty column set** makes a cold model
  silently attribute-less where Rails would have reflected it; `undefined`
  keeps it unloaded so the async warm can still load it.

**Scope boundary.** This ratifies the schema-cache PEEK only. It does **not**
bless the synchronous _lease_ a peek may sit behind — `withConnectionSync`
(`reflectionAdapter`, `model-schema.ts:27-30`), `acquireConnectionSync`
(`abstract/connection-pool.ts`), or the promise arm in
`abstract/connection-pool/queue.ts`'s internal poll. Those stay CONVERGEABLE and are owned by their own RFC: a
synchronous lease is permanent, and it trips the
`permanent_connection_checkout = :disallowed` flag #7781 armed, which is exactly
why `loadSchemaFromAdapter` wraps its warm in `withConnection` (see its JSDoc).
Nothing here is a receipt for a new sync lease.

This is a genuine language shortcoming, ratified repo-wide here. The sync
schema-cache readers carry `@noRailsEquivalent PERMANENT` receipts against this
section, and a cold-cache `undefined` at a sync reader is the designed answer,
not a bug to re-derive per call site.

## The adapter lock defaults to a monitor, not `NullLock`

Rails' `AbstractAdapter#initialize` ends with `self.lock_thread = nil`
(`activerecord/lib/active_record/connection_adapters/abstract_adapter.rb:157`),
and `lock_thread=` (`:181-191`) maps `nil` to
`ActiveSupport::Concurrency::NullLock`. Only a pinned connection gets a real
monitor (`connection_pool.rb:335`). That is safe in Ruby because the pool leases
a connection per execution context
(`@leases[ActiveSupport::IsolatedExecutionState.context]`,
`connection_pool.rb:710-712`), and a thread runs one statement at a time: the
concurrency unit and the serialization unit are the same object.

In JS they are not. trails' lease registry is keyed the same way
(`connectionLease`, `abstract/connection-pool.ts`, over `IsolatedExecutionState.context()`),
faithfully — but one async context can hold many in-flight promises, so
`Promise.all([Post.count(), Post.first()])` hands one adapter to two concurrent
statements. Nothing in the lease model serializes them.

The alternatives were tried:

- **Porting `self.lock_thread = nil` verbatim** reds all three tests named in
  `abstract-adapter-null-lock-breaks-concurrent-async-statements`.
- **Leaning on SQLite's `_statementLock`** (`acquireStatementLock`,
  `sqlite3/database-statements.ts`) does not cover it: that lock wraps only
  `performQuery`, not `withRawConnection`'s `connectBang` (three concurrent
  opens) nor the post-`rawExecute` `_lastInsertRowid` read, and
  it exists on one adapter only.
- **Leasing per promise** has no Ruby counterpart and no JS hook to key on.

So trails' `lock` field initializer is `new LoadInterlockAwareMonitor()`
(`abstract-adapter.ts`), where Rails' constructor leaves `NullLock`, and
`setLockThread` itself stays a faithful port of `lock_thread=` — a caller that
passes `null` still gets `NullLock`. The constructor simply does not make that
call.

This is a genuine language shortcoming, ratified repo-wide here. Stories that
serialize adapter access (retiring SQLite's statement lock onto
`withRawConnection`, the server-version barrier, `FutureResult`'s mutex) build
on the monitor default; none of them is a story to restore `NullLock`.

## Records are not Proxies (`method_missing`)

Ruby reaches `NoMethodError` for an undefined name through
`BasicObject#method_missing`, and ActiveRecord regenerates undefined attribute
methods from the same hook. So `topic.mumbo` and `topic.mumbo = 5` raise at run
time (`activerecord/test/cases/attribute_methods_test.rb:641-645`), and a read
off an existing record after `undefine_attribute_methods` redefines the reader
(`attribute_methods_test.rb:1098`).

trails enforces both halves at **compile** time instead: #7222 removed
`[key: string]: unknown` from `ActiveModel::Model`, so `topic.mumbo` does not
type-check. An `as any` cast or a plain-JS caller still evades it, and there it
reads `undefined` / creates an own property.

The only JS read/write hook on an arbitrary name is a `Proxy` trap, and the
converged shape would be a Proxy returned from the constructor standing in for
`self`. Identity must be the object callers hold, or `errors.base`,
`association.owner`, WeakMap-keyed state and `has_secure_password`'s ivars land
on a second object. **The blocker is cost**, measured best-of-5 over 200k
iterations on #7208, on every ActiveModel instance:

| trap | operation              | slowdown |
| ---- | ---------------------- | -------- |
| get  | attribute read         | 3.7×     |
| get  | internal `_field` read | 64×      |
| set  | attribute write        | 1.5×     |
| set  | construction           | 1.7×     |

A proxied object defeats the property-read inlining those reads get, and the
internal-field number lands on every framework read, not only user code.
**Records are not Proxies.** As a consequence:

- An undefined name on a record is a type error, not a `NoMethodError`, and
  untyped access reads `undefined` or silently creates an own property.
- A generated reader removed by `undefineAttributeMethods` is not regenerated by
  reading it off an existing record. It comes back through
  `defineAttributeMethods`
  (`activerecord/lib/active_record/attribute_methods.rb:104`), or through
  construction.

**The Migration half.** Rails' `Migration#method_missing`
(`activerecord/lib/active_record/migration.rb:1044-1059`) wraps every DSL
statement (`create_table`, `add_column`, …) in `say_with_time` and sends it to
`execution_strategy`. trails has no
such dispatch, so `migration.ts` declares typed forwarders, each a
`this.methodMissing(name, ...args)` call (`createTable` at `:352` onward). They
**stay**. A Proxy would not buy back extra surface either: typing the proxied
statements needs a declaration-merged `interface Migration` in the same file,
whose members `parity:api:extra` counts exactly as it counts the class members,
so `moved` / `total` do not drop. The criterion is unreachable in TS either way.

This is a genuine language shortcoming, ratified repo-wide here. Tests mirroring
the Rails `NoMethodError` arms port the assertions that do not depend on the
hook (e.g. the first four of
`#undefine_attribute_methods undefines alias attribute methods`), and there is
no story to proxy records or to replace the Migration forwarders. It does not
rule out a `Proxy` on some other non-record object whose Rails counterpart
dispatches through `method_missing`; that is decided per class.

## Ruby protocol methods with a different JS mechanism

Five Ruby protocol names are neither portable by name nor meaningless: JS has
the capability, in a different place. Each is its own `SKIP_GROUPS` entry in
`scripts/parity/conventions.ts`, decided here:

- **`is_a?` / `kind_of?` — `instanceof`.** JS customises it with
  `static [Symbol.hasInstance]` on the class tested _against_, so
  `TimeWithZone#is_a?(Time)` (`time_with_zone.rb:509-511`) ports as a hook on
  `Time`, not a method on `TimeWithZone`. Skipped for name scoring. The one TS
  member, `Duration#isA`, answers `this instanceof klass` where Rails'
  `duration.rb:330-332` answers `value.is_a?(klass)`, and is filed for
  convergence. `HashObject` (`serialized-attribute.test.ts`) is the
  existing `hasInstance` hook.
- **`hash` / `eql?` — live, scored by their consumers.** `Map` and `Set` call no
  hook, but ruby-compat's `rbHash` and `rbEqual` dispatch to a TS `hash()` /
  `eql()`, and so do `Deduplicable#deduplicate` and the preloader's batch
  grouping (`associations/preloader/batch.ts`). The members are not dead code.
  Scoring them is a comparer change and has its own story.
- **`method_missing` / `respond_to_missing?` / `respond_to?` — per class.**
  `respond_to?` is `rbObjRespondTo`, a function; `in` cannot see a name a
  `respond_to_missing?` answers. § "Records are not Proxies" decides records;
  every other Rails definer is decided per class from this table:

| Rails file (`method_missing` / `respond_to_missing?`) | trails status         |
| ----------------------------------------------------- | --------------------- |
| `active_model/attribute_methods.rb`                   | named method, no trap |
| `active_record/attribute_methods.rb`                  | records: not a Proxy  |
| `connection_adapters/abstract/connection_pool.rb`     | Proxy (`NullPool`)    |
| `active_record/dynamic_matchers.rb`                   | `respondToMissing`    |
| `migration/command_recorder.rb`                       | typed forwarders      |
| `migration/default_strategy.rb`                       | typed forwarders      |
| `active_record/migration.rb`                          | typed forwarders      |
| `relation/delegation.rb`                              | named method, no trap |
| `active_record/test_fixtures.rb`                      | nothing               |
| `active_support/array_inquirer.rb`                    | Proxy                 |
| `active_support/broadcast_logger.rb`                  | Proxy                 |
| `core_ext/module/delegation.rb`                       | nothing (no file)     |
| `active_support/current_attributes.rb`                | nothing               |
| `active_support/delegation.rb`                        | Proxy                 |
| `deprecation/proxy_wrappers.rb`                       | Proxy                 |
| `active_support/duration.rb`                          | nothing               |
| `log_subscriber/test_helper.rb`                       | nothing (no file)     |
| `multibyte/chars.rb`                                  | nothing (no file)     |
| `active_support/option_merger.rb`                     | Proxy                 |
| `active_support/ordered_options.rb`                   | Proxy                 |
| `active_support/string_inquirer.rb`                   | Proxy                 |
| `active_support/time_with_zone.rb`                    | Proxy                 |

A Proxy row whose Ruby class also defines `respond_to_missing?` forwards a
name only when that predicate answers it (`broadcast_logger.rb:235-251`): a
`typeof x.m === "function"` probe is JS's `respond_to?`, and TaggedLogging's
`flush` and rack's `CommonLogger` probe a wrapped logger exactly that way, so
handing every name a raising function would turn Ruby's skipped arm into a
raise. The `method_missing` `super` arm stays in the port; an unanswered name
reads `undefined`, and calling it is a `TypeError` where Ruby raises
`NoMethodError`.

A "named method, no trap" row answers only an explicit `methodMissing` call,
which is where `finder-respond-to-dynamic-finders-invisible-to-in` and
`relation-dynamic-finders` sit. These rows are decided per class, not ratified: a "nothing" row with a
dispatch-dependent Rails test is a gap, filed against its package.

## `inherited` is deferred to own-property memo guards (`ModelSchema.inherited`)

§ "Module mixins" says only `inherited` has no JS equivalent and its semantics
"have to be deferred some other way". For `ModelSchema` this is that way.
Rails' `ModelSchema.inherited`
(`activerecord/lib/active_record/model_schema.rb:574-580`) runs at
class-definition time and gives the child a fresh load-schema monitor, calls
`reload_schema_from_cache(false)` — a non-recursive reset of the child's
schema memos — and clears `@ignored_columns`. So a subclass never observes its
parent's `@columns_hash`, `@schema_loaded` or attribute builder.

JS has no hook that fires when `class Child extends Parent` is evaluated, and a
static field read on the child walks the prototype chain to the parent's memo.
**The settled deferral is the own-property guard**: `ownSchemaMemo`
(`model-schema.ts`) answers a memo only when it is an own property of the class
being asked (`Object.prototype.hasOwnProperty.call(host, key)`), so an inherited
memo reads as unset — the observable state `inherited`'s reset leaves behind —
without anything running at definition time. `_schemaLoaded`, `_columnsHash`,
`_columns`, `_attributesBuilder` and `_yamlEncoder` are all read through it.

The alternatives lose:

- **A lazy reset at the child's first schema read** would clobber memos written
  to the child _before_ that read — `applyColumnsHash`, attribute declarations —
  which Rails' definition-time reset runs ahead of by construction.
- **A decorator or explicit registration step** on every model (`@model class
Post`, `Post.register()`) would fire at the right moment, but it is invented
  surface imposed at a Rails-facing API on every trails user.

This is a genuine language shortcoming, ratified repo-wide here. An own-property
memo guard in `model-schema.ts` is the port of `inherited`, not a deviation to
retire, and there is no story to port `inherited` as a hook.

## `singleton_class` is a per-object subclass (`rbObjSingletonClass`)

Ruby's `obj.singleton_class` (`vendor/ruby/object.c:288`, `class.c:2215`) is a
class of the object's own. It sits between the object and its class, and
`obj.class` skips it (`rb_obj_class`, `object.c:296`). So
`t2.singleton_class.validates(:title, uniqueness: true)`
(`activerecord/test/cases/validations/uniqueness_validation_test.rb:109`) gives
only `t2` the validator, and `t2.class` is still `Topic`.

JS has no per-object class. `rbObjSingletonClass(obj)`
(`ruby-compat/src/object.ts`) is the settled shape. It creates a subclass of
`obj.constructor` on first call and makes it `obj`'s prototype. Its
`prototype.constructor` is set back to the real class, so `obj.constructor`
keeps answering Ruby's `obj.class`. `rbModSingletonP` is
`Module#singleton_class?`. Rails code that
branches on `singleton_class?` ports the branch as it is:
`ClassAttribute.redefine`'s instance-reader arm (`class_attribute.rb:7-13`), and
`UniquenessValidator#initialize`'s `@klass.superclass` (`uniqueness.rb:16`).

Because a Ruby singleton class never fires `inherited`, the own-property memo
guards (§ "`inherited` is deferred") treat it as an unreset subclass. Do not
read class-level schema memos off a singleton class. Rails does not either:
every Rails call that reaches them goes through `record.class`.

A JS class has no metaclass apart from its own statics, so
`rbObjSingletonClass` raises `TypeError` for a class receiver. Code whose Rails
body reaches a class's singleton class keeps working on the class itself, and
`ClassAttribute.redefine` does not port its `attached_object.is_a?(Module)`
arm.

## Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)

`Rails::Autoloaders` (`railties/lib/rails/autoloaders.rb:12-28`) is a pair of
`Zeitwerk::Loader` instances, `main` and `once`. Zeitwerk's entire mechanism is
Ruby constant resolution at reference time: it maps file paths to constant names
and registers `Module#autoload` so the file loads when the constant is first
named. `Rails.autoloaders.main.ignore` (`application/configuration.rb:479-480`),
`Zeitwerk::Loader.eager_load_all`, `Rails.eager_load!`, and
`reloader.after_class_unload { … eager_load }` all hang off that graph
(`application/configuration.rb:471-493`, `application/finisher.rb:76-87`).

ESM resolves nothing from a constant name and offers no hook for an unresolved
identifier, so there is no loader graph for a `Trails.autoloaders` to hold. And
**Zeitwerk is not vendored under `vendor/`**, so a port would be invented surface
with no Ruby source to mirror — there is nothing to be faithful to.

**Trails has no autoloader.** Application constants come from explicit imports
and trails' eager directory scan: `loadControllers` in
`trailties/src/application/finisher.ts`, which walks every existent
`app/controllers` directory, dynamically `import()`s each `*_controller` /
`*-controller` `.ts`/`.js` file, and registers each exported `…Controller`
function under its underscored, namespace-prefixed name. That scan is the port.
As a consequence:

- The finisher's `eager_load!` initializer runs only its portable arms. The three
  Zeitwerk calls carry `@missingRailsCall … — PERMANENT`.
- `Configuration#autoloadLib` pushes its paths and has no loader to hand
  `ignore` to.
- There is no `Trails.autoloaders`, `autoloadLibOnce`, class-unload
  re-eager-load, or `autoload_lib` line emitted by `trails new`.

This is ratified repo-wide here, and there is no story to port Zeitwerk. It is
about the application loader only: framework-internal call-time constant
resolution (Ruby's `ActiveSupport::Autoload` / `Module#autoload` inside the gems)
is § "Call-time constant resolution" above.
