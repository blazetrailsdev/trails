# trails — Claude guide

The rules and conventions for working in this repo. For the Rails-port
methodology — working principles, the `@internal` JSDoc convention, and how to
measure progress — see [CONTRIBUTING.md](CONTRIBUTING.md). For project overview,
package list, and the `declare` / associations / enums / schema reference, see
[README.md](README.md). Rules that bind only inside one package live in that
package's `packages/<pkg>/CLAUDE.md`; every heading moved there is kept below as
a pointer, so a `CLAUDE.md, "Section title"` citation in code still resolves.
The history behind each ratified decision — alternatives tried, measurements,
the PRs that settled it — is in
[docs/claude-md-decision-history.md](docs/claude-md-decision-history.md).

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
  `modelClass`. Same for parameter _order_ and defaults.
- **Control flow.** Same branches, in the same order, with the same guards and
  early returns. Do not collapse two Rails branches into one, invert a guard,
  reorder side-effect-free calls, or drop a check you believe is unreachable.
- **Decomposition.** If Rails extracts a private helper, extract it, with the
  Rails name. If Rails inlines something, inline it. One Rails method is one TS
  method.
- **No extra abstraction.** Do not add a helper, wrapper, indirection layer, or
  "cleaner" rewrite that Rails does not have. Extra surface is measured —
  `pnpm parity:api:extra` reports every public TS name with no Ruby counterpart.
  If you genuinely need one, declare it with a `@noRailsEquivalent` JSDoc tag;
  that tag is the only sanctioned exception. A receipt has exactly two shapes
  and carries no prose: `PERMANENT`, where the token is the whole receipt, and
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
- Ruby `obj.clone` / `obj.dup` → `rbObjClone(obj)` / `rbObjDup(obj)` from
  `@blazetrails/ruby-compat` (MRI `rb_obj_clone` / `rb_obj_dup`): they copy
  the ivars and dispatch the class's `initializeClone` / `initializeDup` (else
  `initializeCopy`), ported at their Rails names. Never open-code the
  `Object.create` + copy at a call site.
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
decision. A row in one of them says "we know this is wrong and haven't fixed it
yet." It is never a licence to leave it, to copy the pattern into new code, or
to add a sibling row next to it.

So:

- **Finding an existing deviation next to your work is a reason to converge it,
  not to match it.** If it's out of scope for your PR, file it
  (`pnpm tasks new <rfc> <slug> --body-file <path>`) with the Rails `file:line`
  you already have in front of you. Do not silently propagate the shape.
- **A deviation-convergence story always converges.** Do not close one by
  writing a better justification for the deviation, by broadening a baseline
  reason, or by moving it to a different register. `pnpm tasks block` is for a
  story waiting on something that can change: another story, an unported
  package, an upstream release, an owner decision. Name that thing, and prefer
  a `deps` edge when it is a story. A story that can never converge is not
  blocked: once the limit is ratified in this file or ruled on by the repo
  owner, `pnpm tasks close` it with a reason that starts `PERMANENT:` and
  stands alone, after its receipts in the code are `PERMANENT` too. A story
  whose premise or acceptance criteria turned out wrong closes with
  `FALSIFIED:`. Both are rare, and "it would be a bigger diff" is neither.
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
- **An optional positional before trailing options or a block.** Ruby tells
  `remove_foreign_key(from_table, to_table = nil, **options)` apart by syntax;
  JS has only position. Keep every Rails parameter in its own slot, with the
  Rails default, and have the caller pass `undefined` for a positional it
  skips: `removeForeignKey("astronauts", undefined, { column: "rocket_id" })`,
  `withExampleTable(connection, "ex", undefined, block)`. Never overload the
  slot on `typeof`, which is an arm Rails does not have.
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
  the main worktree; bumping a `ref` follows the procedure in
  [vendor/README.md § "Upgrading a source"](vendor/README.md#upgrading-a-source-bumping-ref)).
  Before porting or fixing anything, read the corresponding Rails code and test
  there — e.g. `vendor/rails/v8.0.2/activerecord/lib/active_record/...` and
  `vendor/rails/v8.0.2/activerecord/test/cases/...`. The canonical test schema is
  `vendor/rails/v8.0.2/activerecord/test/schema/schema.rb`, which
  `packages/activerecord/src/test-helpers/test-schema.ts` mirrors — when a
  test needs a table or column, check schema.rb first; if it's not there,
  don't invent it. Likewise, Rails' test models live in
  `vendor/rails/v8.0.2/activerecord/test/models/` (ours:
  `packages/activerecord/src/test-helpers/models/`) and its fixture data in
  `vendor/rails/v8.0.2/activerecord/test/fixtures/` (ours:
  `packages/activerecord/src/test-helpers/fixtures/`) — mirror those too
  rather than making up models or fixture rows.
- To map a trails test name or method/constant to its vendored Rails
  `file:line` instead of hand-grepping, run `pnpm rails:find <query>` — it
  reuses the test-compare / api-compare manifests and falls back to a scoped
  grep of `vendor/rails/v8.0.2/activerecord/`, tagging each result with the mode.
- A `vendor/<source>/…` citation names the version it was verified against
  (`vendor/rails/v8.0.2/…`, not `vendor/rails/…`); `pnpm vendor:recite`
  rewrites unversioned or stale citations to each source's active version, and
  `scripts/vendor-citations.test.ts` (Preflight, so docs-only PRs too) fails
  CI on any citation it would rewrite
  (`ruby-compat-needs-mri-citation` additionally resolves each
  `vendor/ruby/<version>/<file>:<line>` against the tree).
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
  `scripts/tasks/tasks.sh`, that finds a tasks checkout and hands off; the CLI
  resolves the working tree it acts on from your cwd — your worktree's own
  `tasks/` symlink — and `tasks where` prints what it resolved. `tasks` is also
  on the `PATH` (installed by `start-worktree.sh`) and works from any cwd. Fix
  CLI bugs in the tasks repo, not here.
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

| Owner        | Fields                                                                                    | Changed by                     |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------ |
| **Markdown** | `title`, `rfc`, `cluster`, `deps`, `deps-rfc`, `est-loc`, `packages`, body prose          | edit the file, open a PR       |
| **Database** | `status`, `pr`, `claim`, `assignee`, `blocked-by`, `closed-reason`, `priority`, `updated` | a `tasks` verb — never by hand |

The authoritative list is `DB_OWNED` in the tasks repo's `src/ingest.ts`; when
this table and that constant disagree, the constant wins. Two rules of thumb
cover every field, including ones this table forgets:

- **Rewriting what the work IS** — retitling, resizing `est-loc`, adding a
  dependency, rewriting acceptance criteria — is a markdown edit. Edit the file,
  commit, open a PR; ingest picks it up when the PR merges. The one exception
  is dependency wiring: `tasks set-deps <id> <csv>` (or `--add a,b` /
  `--remove a,b`; `tasks set-deps-rfc` for `deps-rfc`) rewrites the file on
  main, refuses a dangling reference or a cycle, commits, pushes and ingests —
  use it instead of hand-editing `deps:` and asking to push to main.
- **Recording what HAPPENED to the work** — claimed, in progress, done, blocked,
  closed, reprioritized — is a verb: `tasks claim <id>` (`--assignee <name>` for
  `assignee`), `tasks in-progress <id> --pr trails#N`,
  `tasks done <id> --pr trails#N` (the PR is `repo#N` — `tasks#94`,
  `trailmap#22` for other repos; a bare number is refused),
  `tasks block <id> <reason>`, `tasks close <id> <reason>`,
  `tasks priority <id> <n>`, `tasks status-set <id> <status>` for anything
  else. `updated` is stamped by whichever verb you ran.

**Hand-editing a DB-owned field is the one failure worth spelling out**, because
it is silent rather than loud: ingest skips DB-owned columns by design, so
`status: done` typed into a story file reads correctly to a human, merges
cleanly, and marks nothing done. The tasks repo's CI runs an owned-fields guard
that turns that into a red naming the verb to use instead — but the rule is the
point, not the guard, and the guard only judges stories your PR _modified_.

Two traps follow from the DB being a real, _shared_ database:

- **`tasks ingest` is a sync verb, not an inspection verb.** It publishes
  main's markdown into the shared DB. Do not reach for it to check that a
  branch's stories parse — that is `pnpm tasks show` / `pnpm tasks list` /
  `pnpm validate` in the tasks worktree.
- **A worktree's `.git` is a pointer file into the main checkout**, so the
  `.git/tasks.db` your worktree resolves IS the shared database — every other
  agent reads and writes the same rows, and the read verbs answer from it, not
  from your branch's markdown. Gitignored does not mean local.

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
  Tests and fixtures count. **Do NOT fan out into sibling PRs yourself.** Keep
  each PR scoped to the single story you claimed; ship the portion that fits
  and register the rest as new stories. If the work is larger than one PR, or
  you discover additional work that belongs in a separate PR, do NOT open it
  yourself — add a new story to the epic with
  `pnpm tasks new <rfc-slug> <story-slug> --body-file <path>` so it gets
  scheduled and owned separately. **Capture the context you have right now:**
  `tasks new` refuses an empty/skeleton-only body, so pass `--body-file` with
  the `## Context` (the trails/Rails `file:line` you just read) and
  `## Acceptance criteria` — a title-only stub forces an expensive re-derivation
  later. The only exception is a single mechanical rename — note it in the PR
  body.
- **Do NOT stack PRs.** Each PR branches from `main` and stands alone. Stacked
  branches re-run CI on every parent rebase, force the reviewer to re-review
  the same diff, and conflict with sibling agents working in parallel. If a
  feature needs splitting, open each split PR from `main` with
  **non-overlapping files**; if true ordering is required, ship the first PR,
  wait for merge, then open the next from updated `main`.
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
undocumented: they still delegate so a stale prompt keeps working, but they are
scheduled for deletion. Never spell one in a doc, a comment, a script, or a CI
step — `parity:*` is the only name to write.

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
   [CONTRIBUTING.md](CONTRIBUTING.md#row-count-is-the-debt-metric-the-unreviewed-count-is-not)).
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
     [its README](packages/ruby-compat/README.md#1-only-what-trails-actually-calls)).
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
is defined, so its Rails semantics have to be deferred some other way (see
§ "`inherited` is deferred to own-property memo guards").

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
of these cites **this section** — `@noRailsEquivalent` there is a pointer to a
ratified repo-wide rule, not a local justification, and a new instance is not a
new decision to argue.

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

The alternative — `serializableHash` / `asJson` returning `Promise`
unconditionally — was rejected because `asJson` is the recursive dispatcher
behind the whole JSON encoder (`activesupport/src/core-ext/object/json.ts`,
standing in for Ruby's `as_json` method lookup, with ~19 definitions feeding
it): an async `asJson` makes every collection containing a model async, the
encoder async, and **`to_json` a `Promise`** where Rails' returns a String — a
fidelity loss at a more prominent surface than the thenable it would remove,
and one that still needs a synchronous path for `JSON.stringify`. The
`JSON.stringify` → `toJSON` path is not the binding constraint: on that path
`toJSON` calls `asJson()` with no options, so there is no `include:` to load.
There is no third shape, because `to_json` is Rails-facing API.

This is a genuine language shortcoming — JS has no synchronous await and no
lazily-loading collection read — and it is ratified repo-wide here.
`thenableHash` and `asJsonThenable` carry `@noRailsEquivalent PERMANENT`
receipts against this section, and the module-private `preloadIncludes`, the
`SerializableHash` type and the `sync` re-entry parameter exist to serve them.
Do not re-derive the decision per call site, and do not file a story to make
them `Promise`.

## `Relation` is evaluated by an async query (`records`, and the predicates it carries)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#relation-is-evaluated-by-an-async-query-records-and-the-predicates-it-carries).
The decision is unchanged; the heading stays here so code citing it still
resolves.

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
derived signature that requires MORE arguments than the base publishes
(`TS2416 ... Target signature provides too few arguments`). An overload set,
optional parameters, defaults, and breaking the inheritance edge were each
tried and each loses more fidelity than it buys (details in the decision
history). So the base declares the Rails signature plus a rest parameter that
carries the overrides' extra arguments and nothing else:

```ts
fetchTypeMetadata(sqlType: string | null, ..._rest: unknown[]): SqlTypeMetadata
```

The rest parameter is named `_rest` and is never read. It is not extra API
surface (`parity:api:extra` scores members, not parameters) and it is not a
renamed Rails parameter (`parity:api:params` compares the positions Rails
declares), which is why none of the JSDoc receipts fits it: there is nothing
for them to suppress. This section is its receipt.

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

Two shapes are sanctioned, and only these:

- **A namespace object extended with `ActiveSupport::Autoload`** (RFC 0151),
  mirroring Rails' `autoload` lists: each autoloaded constant is seated by its
  defining module with `rbModConstSet(Namespace, "Name", Klass)` — the constant
  binding is what paths it, as Ruby's `const_set` does — and read as a property
  at call time (`new Nodes.Not(this)`, `ActiveRecord.Base`). A constant Rails
  `require`s rather than autoloads is seated with no `autoload` call. Ruby's
  top-level `Object` is `TopLevel` in `activesupport/src/namespaces.ts`: the
  defining gem seats it (`TopLevel.Trails = Trails`) and a reader names it at
  call time (`TopLevel.Trails!.env`), carrying a guard only where Rails has a
  `defined?`. A `globalThis` seat was rejected because a `declare global` in a
  published `.d.ts` reaches every consumer.
- **A zero-import slot module**: a file with no runtime imports at all (so it
  cannot join any cycle) exporting a mutable binding plus a `_setX()` setter,
  which the defining module calls at the bottom of its own body. Readers import
  the binding from the slot and use it at call time. No instance remains:
  every slot has converged onto a namespace seat, which is the shape to reach
  for first.

The per-package inventories of namespace objects, seats and the cycles they
break live in [packages/arel/CLAUDE.md](packages/arel/CLAUDE.md#call-time-constant-resolution-arel),
[packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#call-time-constant-resolution-activesupport-actionview-actionpack)
and [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#call-time-constant-resolution-activerecord).

This is a genuine language shortcoming, not a preference, and it is the one
sanctioned shape for it — do not re-derive a per-cluster justification, and do
not reach for a slot when a plain import does not actually close a cycle.
Verify both directions with a plain-node import of the **built** `dist/**.js`
modules as entry modules; a vitest run enters the funnel module first and masks
the TDZ, so a green suite proves nothing here. Deferring the subclass edges
instead (a slot per `extends` site) does not work: nothing then loads the
subclass modules at all, so their self-registration never runs.

**A slot or seat read carries no guard**, because the Ruby body it mirrors
carries none: `Arel::Nodes::Node#not` is `Nodes::Not.new self`
(`arel/nodes/node.rb:122`) and raises `NameError` if the constant will not
resolve. So a reader is written `new _Not!(this)`, and an unset slot surfaces as
a plain `TypeError` at the call site — the JS analogue of that `NameError`. A
`throw` explaining that the caller deep-imported the module is invented
surface. The two guarded reads of `ActiveRecord.Base?.` on a standalone
adapter's own path are the one exception, recorded in the activerecord file.

## The pool monitor guards only sections that span an `await` (`ConnectionPool`'s `MonitorMixin`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#the-pool-monitor-guards-only-sections-that-span-an-await-connectionpools-monitormixin).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)

Ruby's `basic_obj_respond_to` (`vendor/ruby/v3.3.11/vm_method.c:2864-2879`) takes a
`pub` flag and hands it to `method_boundp` (`:1788-1818`), so `respond_to?(:m)`
and `respond_to?(:m, true)` can answer differently for the same receiver, and
`Kernel#public_send` (`vm_eval.c:1350`) raises `NoMethodError` "private method
'…' called for …" where `send` dispatches. Visibility is a property of the
method entry, readable at run time.

JS has no such fact of its own: a `#private` member is not a string-named
property at all (invisible at both `pub` values), and a TS `private` /
`protected` member is a compile-time annotation with no runtime residue
(visible at both). **trails has no runtime privates.** A Rails-private method
is marked `private` / `protected` in TypeScript, and `@internal` per
`blazetrails/rails-private-jsdoc`, and that is the whole port. No side table,
no `#private` emulation, no Proxy. A ruby-compat side table was built and
removed: it cost ~70% on every `public_send` (one per mass-assigned
attribute), almost nothing used it, and it could not make `topic.title` raise
where `send(:title)` succeeds.

As a consequence:

- Ruby `private` / `protected` ports as the TS keyword plus `@internal`. Nothing
  is recorded at run time, and `Module#private` / `Module#protected` /
  `private_constant` are not ported.
- `respond_to?(m)` and `respond_to?(m, true)` answer the same for a defined
  method. `basicObjRespondTo`'s `pub` and `rbObjRespondTo`'s `priv` stay, and
  reach only `respondToMissing` / an overridden `isRespondTo`, so
  `ActiveModel::AttributeMethods`' two `super` calls
  (`attribute_methods.rb:528-533`) are still ported as two calls.
- `rbFPublicSend` dispatches a defined method exactly as `rbFSend` does. It still
  raises `NoMethodError` for an undefined name and still goes to `methodMissing`,
  so a Rails `public_send` keeps its `rbFPublicSend` spelling and its rescue.
  `rbModPublicMethodDefined` (`Module#public_method_defined?`) answers "defined".
- A Rails test whose assertions turn on private / protected visibility at run
  time is permanently unportable for that arm: `assert_not_respond_to` on a
  private method, `assert_raise(NoMethodError)` on a private call, a `public_send`
  refused by a private writer ("attribute readers/writers/predicates respect
  access control" and "bulk updates respect access control",
  `activerecord/test/cases/attribute_methods_test.rb:998-1033`). Port the
  assertions that do not depend on it; park the rest as `it.skip` under a
  `PERMANENT-SKIP:` line citing this section.
- Code whose Rails body branches on visibility (Thor's `public_method?` /
  `private_method?` deciding what is a command) needs an explicit mechanism
  decided per class, not a general visibility table. Until one is decided the
  branch reads "defined": `Mapping#build_conditions`' `public_method_defined?`
  (`action_dispatch/routing/mapper.rb:198-204`) keeps a constraint named after a
  private `Request` method, filed as
  `mapper-build-conditions-keeps-request-private-method-constraints`.
- `ActiveRecord::Core#to_ary` (`activerecord/lib/active_record/core.rb:822-832`)
  is not ported. It is private and answers `nil`, there only to keep
  `Array#flatten` off a record's `method_missing`, so a Rails record does not
  `respond_to?(:to_ary)`. A `toAry` member would answer "defined", and
  `serializable_hash` (`activemodel/lib/active_model/serialization.rb:141`) and
  `fields_for_with_nested_attributes`
  (`actionview/lib/action_view/helpers/form_helper.rb:2713-2718`) would read a
  single record as a collection. Its scoped skip for `core.rb` / `base.rb` is
  permanent, ruled by the repo owner on trails#8750.
- `defineModule`'s section record (`ruby-compat/src/include.ts`), read by
  `publicInstanceMethods`, is such a mechanism and stays. It is read once at
  load, where a Rails body enumerates `public_instance_methods`
  (`relation/delegation.rb:19`, `associations/collection_proxy.rb:1132-1133`),
  and never at dispatch.

This is a genuine language shortcoming, ratified repo-wide here. There is no
story to add a runtime visibility carrier, and a new instance is not a new
decision to argue.

## Schema reflection peeks at a warm cache (`load_schema!`'s `schema_cache.columns_hash`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#schema-reflection-peeks-at-a-warm-cache-load_schemas-schema_cachecolumns_hash).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Adapter facts are prewarmed and peeked (`lookup_cast_type`, `max_identifier_length`, `quote_string`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#adapter-facts-are-prewarmed-and-peeked-lookup_cast_type-max_identifier_length-quote_string).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## The adapter lock defaults to a monitor, not `NullLock`

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#the-adapter-lock-defaults-to-a-monitor-not-nulllock).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Records are not Proxies (`method_missing`)

Ruby reaches `NoMethodError` for an undefined name through
`BasicObject#method_missing`, and ActiveRecord regenerates undefined attribute
methods from the same hook. So `topic.mumbo` and `topic.mumbo = 5` raise at run
time (`activerecord/test/cases/attribute_methods_test.rb:641-645`), and a read
off an existing record after `undefine_attribute_methods` redefines the reader
(`attribute_methods_test.rb:1098`).

trails enforces both halves at **compile** time instead: `ActiveModel::Model`
has no `[key: string]: unknown` index signature, so `topic.mumbo` does not
type-check. An `as any` cast or a plain-JS caller still evades it, and there it
reads `undefined` / creates an own property.

The only JS read/write hook on an arbitrary name is a `Proxy` trap, and the
converged shape would be a Proxy returned from the constructor standing in for
`self`. **The blocker is cost**, measured on every ActiveModel instance: a
`get` trap makes an attribute read 3.7× slower and an internal `_field` read
64× slower, because a proxied object defeats the property-read inlining those
reads get, and the internal-field number lands on every framework read, not
only user code. **Records are not Proxies.** As a consequence:

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
`execution_strategy`. trails has no such dispatch, so `migration.ts` declares
typed forwarders, each a `this.methodMissing(name, ...args)` call. They
**stay**. A Proxy would not buy back extra surface either: typing the proxied
statements needs a declaration-merged `interface Migration` in the same file,
whose members `parity:api:extra` counts exactly as it counts the class members.

This is a genuine language shortcoming, ratified repo-wide here. Tests mirroring
the Rails `NoMethodError` arms port the assertions that do not depend on the
hook, and there is no story to proxy records or to replace the Migration
forwarders. It does not rule out a `Proxy` on some other non-record object whose
Rails counterpart dispatches through `method_missing`; that is decided per class
(see § "Ruby protocol methods with a different JS mechanism").

## Ruby Strings are JS string primitives (no mutable String carrier)

A Ruby `String` is a mutable object with identity. `str << "x"` and
`str.replace("y")` change the receiver in place, `str.dup` is a second object
with the same content, and `frozen?` is a per-object fact. ActiveModel leans on
all three:

- **Identity across `dup`.** `Attribute#initialize_dup`
  (`activemodel/lib/active_model/attribute.rb:155-159`) dups a duplicable
  `@value`, so `attribute.value` and `attribute.dup.value` are two objects
  (`activemodel/test/cases/attribute_test.rb:134-138`), and a mutation made
  through a deep-duped `AttributeSet` does not reach the original
  (`attribute_set_test.rb:53-68`) while one made through a shallow dup does
  (`:35-50`).
- **An unfrozen copy out of the cast.** `Type::String#cast_value`
  (`activemodel/lib/active_model/type/string.rb:33-40`) answers a `::String`
  with `::String.new(value)` — a new, unfrozen String even for a frozen input
  (`activemodel/test/cases/type/string_test.rb:23-43`) — where
  `ImmutableString#cast_value` (`type/immutable_string.rb:62-68`) answers
  `value.to_s.freeze`.
- **In-place mutation feeding dirty tracking.** `Type::String#changed_in_place?`
  (`type/string.rb:16-20`) exists because the cast value can be mutated after
  it is read: `Attribute#changed_in_place?` (`attribute.rb:70-72`) compares the
  original database value with the live one, so `attribute.value << "!"`
  (`attribute_test.rb:271-277`) and `@model.name.replace("Hadad")`
  (`activemodel/test/cases/attributes_dirty_test.rb:67-73`) mark the attribute
  changed with no assignment, and `Attribute#with_type` (`attribute.rb:91-97`)
  carries the mutation across (`attribute_test.rb:325-330`).

A JS string is a primitive value: no identity, no in-place mutation, and
`Object.isFrozen` is `true` for every one of them. None of the three facts above
has a JS value to hold it. **A Ruby String is a JS string primitive,
everywhere.** trails has no mutable String carrier. A ruby-compat carrier class
was considered and rejected: every `:string` / `:text` attribute read would
change type and break `===`, `typeof`, Map keys and the 197 `typeof x ===
"string"` arms in activemodel and activerecord; it would still have to re-declare
`String.prototype`; and it measured 2–4× on `JSON.stringify` and template
interpolation, to buy eight ActiveModel tests. This is the same trade
§ "Records are not Proxies" records. As a consequence:

- `Type::String#cast_value` returns a primitive. Its `::String.new(value)` is
  ruby-compat's `rbStrSNew`, which answers the string itself: the value is its
  own copy.
- `Attribute#initializeDup` keeps Rails' `duplicable?` guard and `dup` call,
  and `rbObjDup` answers a string unchanged. `attribute.value()` and
  `attribute.dup().value()` are the same value.
- `ImmutableString#cast_value`'s `.freeze` is a no-op on a string, and
  `frozen?` is `true` of every cast result, `Type::String`'s included.
- `Type::String#changed_in_place?` stays ported, and is still reached when a
  type's `deserialize` and `serialize` do not round-trip. Its in-place-mutation
  arm is unreachable: no caller can mutate a string a record holds, so a string
  attribute becomes dirty by assignment or `name_will_change!` only.

A Rails test whose assertions turn on String identity, frozenness or in-place
mutation is permanently unportable for that arm. Port the assertions that do
not depend on it; where those leave a running test short of Rails' count, drop
each missing one with a row in `scripts/test-compare/assertion-receipts.ts`
citing this section. A test with nothing left is parked as `it.skip` under a
`PERMANENT-SKIP:` line citing this section, its body kept as the Rails body.

This is a genuine language shortcoming, ratified repo-wide here. There is no
story to add a mutable String carrier, and a new instance is not a new decision
to argue.

### A String has no encoding tag either

`str.encoding`, `force_encoding` and `String#b` read or change a per-object
encoding. A JS string has none, and trails adds none: the carrier that would
hold it is the carrier this section rejects. ruby-compat tags a `Uint8Array`
only. A Rails body that branches on a String's encoding ports the UTF-8 arm,
and a test asserting `str.encoding` is permanently unportable for that
assertion.

## Runtime facts Node does not expose

Each of these is a Ruby or C-library fact with no Node source. They are
ratified here so no port re-derives them.

- **`fork`.** Ruby's `fork` copies the parent's heap; `child_process.fork`
  starts a fresh process. A Rails test that asserts on per-pid state after a
  fork is permanently unportable.
- **Allocated-object count.** `Event#now_allocations`
  (`activesupport/lib/active_support/notifications/instrumenter.rb:229-236`)
  reads `GC.stat(:total_allocated_objects)`, which only grows. V8's heap
  statistics report occupancy, which a collection lowers. `nowAllocations`
  answers 0, the arm Rails takes where `GC.stat` has no such key.
- **Arity -1.** `Function.length` cannot express a method that takes any number
  of arguments, so an assertion on `arity == -1` is dropped.
- **The errno behind a failed `IO#noecho`.** Node exposes termios only as
  `setRawMode`, and `stty` reports libc- and locale-dependent text, never the
  number. ruby-compat raises a bare `SystemCallError` where Ruby raises the
  specific `Errno` class. A native termios binding is not taken on.
- **SQLite's double-quoted-string setting.** better-sqlite3 compiles with
  `SQLITE_DQS=0` and no option reaches `SQLITE_DBCONFIG_DQS_DDL` / `_DML`, so
  `strict: false` cannot re-enable double-quoted string literals on that
  driver.

A test that depends on one of these ports the assertions that do not, and parks
the rest as `it.skip` under a `PERMANENT-SKIP:` line citing this section.

## Fixtures load from `.ts` modules as well as YAML (`FixtureSet::File`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#fixtures-load-from-ts-modules-as-well-as-yaml-fixturesetfile).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Ruby protocol methods with a different JS mechanism

Five Ruby protocol names are neither portable by name nor meaningless: JS has
the capability, in a different place. Each is decided here, and each but
`hash` / `eql?` is its own `SKIP_GROUPS` entry in
`scripts/parity/conventions.ts`:

- **`is_a?` / `kind_of?` — `instanceof`.** JS customises it with
  `static [Symbol.hasInstance]` on the class tested _against_, so
  `TimeWithZone#is_a?(Time)` (`time_with_zone.rb:509-511`) ports as a hook on
  `Time`, not a method on `TimeWithZone`. Skipped for name scoring. The one TS
  member, `Duration#isA`, answers `this instanceof klass` where Rails'
  `duration.rb:330-332` answers `value.is_a?(klass)`, and is filed for
  convergence.
- **`hash` / `eql?` — live, scored by their consumers.** `Map` and `Set` call no
  hook, but ruby-compat's `rbHash` and `rbEqual` dispatch to a TS `hash()` /
  `eql()`, and so do `Deduplicable#deduplicate` and the preloader's batch
  grouping (`associations/preloader/batch.ts`). The members are not dead code,
  and they are scored by name like any ported method: `hash` is `hash`, `eql?`
  is `eql`.
- **`method_missing` / `respond_to_missing?` / `respond_to?` — per class.**
  `respond_to?` is `rbObjRespondTo`, a function; `in` cannot see a name a
  `respond_to_missing?` answers. A class that overrides `respond_to?` spells
  the override `isRespondTo` (the `is*` spelling for a predicate whose bare
  camel name is taken), and `rbObjRespondTo` dispatches to that name only:
  `respondTo` is `ActionController::MimeResponds#respond_to`
  (`mime_responds.rb:211`), a different Rails method, and a controller's
  `respond_to?` must not negotiate a format. § "Records are not Proxies"
  decides records; every other Rails definer is decided per class from this
  table:

| Rails file (`method_missing` / `respond_to_missing?`) | trails status         |
| ----------------------------------------------------- | --------------------- |
| `active_model/attribute_methods.rb`                   | named method, no trap |
| `active_record/attribute_methods.rb`                  | records: not a Proxy  |
| `connection_adapters/abstract/connection_pool.rb`     | Proxy (`NullPool`)    |
| `active_record/dynamic_matchers.rb`                   | Proxy (class chain)   |
| `migration/command_recorder.rb`                       | typed forwarders      |
| `migration/default_strategy.rb`                       | typed forwarders      |
| `active_record/migration.rb`                          | typed forwarders      |
| `relation/delegation.rb`                              | Proxy                 |
| `active_record/test_fixtures.rb`                      | Proxy (proto chain)   |
| `active_support/array_inquirer.rb`                    | Proxy                 |
| `active_support/broadcast_logger.rb`                  | Proxy                 |
| `core_ext/module/delegation.rb`                       | nothing (no file)     |
| `active_support/current_attributes.rb`                | nothing               |
| `active_support/delegation.rb`                        | Proxy                 |
| `deprecation/proxy_wrappers.rb`                       | Proxy                 |
| `active_support/duration.rb`                          | nothing               |
| `log_subscriber/test_helper.rb`                       | typed forwarders      |
| `multibyte/chars.rb`                                  | nothing (no file)     |
| `active_support/option_merger.rb`                     | Proxy                 |
| `active_support/ordered_options.rb`                   | Proxy                 |
| `active_support/string_inquirer.rb`                   | Proxy                 |
| `active_support/time_with_zone.rb`                    | Proxy                 |
| `rails/railtie.rb`                                    | Proxy (class chain)   |
| `rails/engine/lazy_route_set.rb`                      | Proxy (module chain)  |
| `rails/railtie/configuration.rb`                      | Proxy                 |
| `abstract_controller/collector.rb`                    | Proxy (proto chain)   |
| `action_controller/metal/mime_responds.rb`            | Proxy                 |
| `action_dispatch/http/mime_type.rb`                   | Proxy (`is…` names)   |
| `action_dispatch/testing/assertions/routing.rb`       | Proxy (proto chain)   |
| `action_dispatch/testing/integration.rb`              | Proxy (proto chain)   |
| `thor/core_ext/hash_with_indifferent_access.rb`       | Proxy (proto chain)   |

Rules that apply across the table:

- A Proxy row whose Ruby class also defines `respond_to_missing?` forwards a
  name only when that predicate answers it (`broadcast_logger.rb:235-251`): a
  `typeof x.m === "function"` probe is JS's `respond_to?`, so handing every
  name a raising function would turn Ruby's skipped arm into a raise. The
  `method_missing` `super` arm stays in the port; an unanswered name reads
  `undefined`, and calling it is a `TypeError` where Ruby raises
  `NoMethodError`.
- A Proxy spliced into a prototype chain wraps `Object.create(parent)`, not the
  parent prototype itself, so `instanceof` the parent keeps working.
- Where the trap answers `…?` names (`mime_type.rb:336-346,379-385`,
  `hash_with_indifferent_access.rb:93-104`), it reads an `is…` name that missed
  the class as the Ruby predicate `foo?` (`isUrlEncodedForm` is
  `url_encoded_form?`), skipping `KERNEL_METHODS` / `PROTOCOL_PROBES`; a defined
  predicate is found before the trap, as Ruby finds `html?` before
  `method_missing`. Thor's HWIA reads a missed name as `self[method]` with
  Ruby truthiness, and a missed assignment as `[]=` (so a frozen hash raises
  `FrozenError`); its one-argument compare arm is reached only by `rbFSend`.
- A "named method, no trap" row answers only an explicit `methodMissing` call.
  A "nothing" row with a dispatch-dependent Rails test is a gap, filed against
  its package; the rows are decided per class, not ratified.
- A class-level pair `extend`ed onto a class (`dynamic_matchers.rb`,
  `railtie.rb:216-230`) is a Proxy spliced into the static prototype chain
  directly above `Base` / `Trailtie`: it forwards only a read that missed every
  class below it, and only a name `respond_to_missing?` claims. The name is
  untyped (a static `findBy${string}` index signature breaks subclass
  assignability), so a call site reaches it through a cast, and `in` still
  cannot see it. `Function.prototype.call` answers `call` before the trap can,
  so `Engine` forwards that one name with an explicit `static call`.
- `rails/engine/lazy_route_set.rb`'s `method_missing_module` is spliced beneath
  the generated url-helpers module in `LazyRouteSet#generateUrlHelpers`, since a
  trails `Module` copies its carrier into each includer and a Proxy on the
  module itself would reach no includer. That row is not converged: the reload
  is async, so `respondToMissing` starts it and answers `super`, the in-line
  re-send is unported, and test_help's integration `before_setup` awaits the
  reload — debt tracked by `lazy-route-set-method-missing-resends-in-line`.

## `inherited` is deferred to own-property memo guards (`ModelSchema.inherited`)

§ "Module mixins" says only `inherited` has no JS equivalent. JS has no hook
that fires when `class Child extends Parent` is evaluated, so wherever Rails'
`inherited` resets or seeds per-class state, trails defers it to the first read
or first write on the subclass: a memo is answered only when it is an own
property of the class being asked (`Object.prototype.hasOwnProperty.call(host,
key)`), so an inherited memo reads as unset — the observable state `inherited`'s
reset leaves behind — with nothing running at definition time. A lazy reset at
first read would clobber memos written to the child before it, and a decorator
or registration step on every model is invented Rails-facing surface. This is
a genuine language shortcoming, ratified repo-wide; an own-property memo guard
is the port of `inherited`, not a deviation to retire, and there is no story to
port `inherited` as a hook.

`ActiveRecord::Base`'s chain, all eight modules that define `inherited` under
it, is in
[packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#inherited-is-deferred-to-own-property-memo-guards-modelschemainherited);
the `Class#subclasses` seat is in
[packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#classsubclasses-is-seated-on-a-classs-first-own-write-callbacksclassmethodsset_callbacks);
`ParamsWrapper` is in
[packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#paramswrapperclassmethodsinherited-runs-at-a-subclasss-first-_wrapper_options-read);
Thor's is in [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#thor-commands-register-through-an-explicit-methodadded).

### `Class#subclasses` is seated on a class's first own write (`Callbacks::ClassMethods#set_callbacks`)

Moved to [packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#classsubclasses-is-seated-on-a-classs-first-own-write-callbacksclassmethodsset_callbacks).
The decision is unchanged; the heading stays here so code citing it still
resolves.

### `ParamsWrapper::ClassMethods#inherited` runs at a subclass's first `_wrapper_options` read

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#paramswrapperclassmethodsinherited-runs-at-a-subclasss-first-_wrapper_options-read).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## `singleton_class` is a per-object subclass (`rbObjSingletonClass`)

Ruby's `obj.singleton_class` (`vendor/ruby/v3.3.11/object.c:288`, `class.c:2215`) is a
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
`Module#singleton_class?`. Rails code that branches on `singleton_class?` ports
the branch as it is: `ClassAttribute.redefine`'s instance-reader arm
(`class_attribute.rb:7-13`), and `UniquenessValidator#initialize`'s
`@klass.superclass` (`uniqueness.rb:16`).

Because a Ruby singleton class never fires `inherited`, the own-property memo
guards (§ "`inherited` is deferred") treat it as an unreset subclass. Do not
read class-level schema memos off a singleton class. Rails does not either:
every Rails call that reaches them goes through `record.class`.

A JS class has no metaclass apart from its own statics, so
`rbObjSingletonClass` raises `TypeError` for a class receiver. Code whose Rails
body reaches a class's singleton class keeps working on the class itself, and
`ClassAttribute.redefine` does not port its `attached_object.is_a?(Module)`
arm.

## A record is built with `new Klass` only (`Inheritance::ClassMethods#new`)

Ruby has one way to build a record, `Klass.new(attributes, &block)`, and
`Inheritance::ClassMethods#new`
(`activerecord/lib/active_record/inheritance.rb:56-78`) overrides it: it raises
`NotImplementedError` for an abstract class or `Base`, resolves an STI subclass
through `subclass_from_attributes`, and calls `subclass.new` or `super`.

JS builds an object with the `new` expression, and that is the only spelling
trails has. **There is no static `Klass.new`.** `new Klass(attributes, block)`
is Rails' `Klass.new(attributes, &block)`, so the body of
`Inheritance::ClassMethods#new` runs in `Base`'s constructor
(`packages/activerecord/src/base.ts`): the abstract raise, then the three
`subclass_from_attributes` arms in Rails' order, then
`new subclass(attributes, block)` or the rest of the constructor, which is
`Class#new`. A static `new` beside the constructor was rejected by the repo
owner (trails#8659): it leaves two spellings for one operation, and either the
bare `new` silently skips the abstract check and the STI dispatch, or the
constructor has to re-enter the static method through a marker and run twice.

As a consequence:

- A Rails `klass.new(attributes, &block)` ports as
  `new klass(attributes, block)`, in source and in tests. Generated application
  code says `new Post(params)` too (`trailties/src/generators/active-model.ts`).
- `inheritance.rb`'s `new` has no member in `inheritance.ts`. Do not add one,
  and do not file a story to move the body out of the constructor.
- `Persistence#becomes` (`persistence.rb:487-500`) is `klass.allocate` +
  `initialize`, which skips `Inheritance::ClassMethods#new`. It reaches the
  constructor with `_suppressAbstractCheck` and `_suppressStiNewDispatch` set.
- `Relation#new` and `CollectionProxy#new` are instance methods with no `new`
  expression to stand in for them, and stay.
- A record loaded from the database is built with `new` too. Rails'
  `instantiate_instance_of` is `klass.allocate.init_with_attributes(attributes,
&block)` (`persistence.rb:313`), which skips `initialize`. The JS spelling of
  `allocate`, `Object.create`, also skips every class-field initializer, so a
  model field such as `history = []` would be unset on a record `find`
  returns. That was tried on trails#8661 and reddened
  `TransactionCallbacksTest` on all three adapters. `Base.allocate` therefore
  goes through the constructor and carries `@noRailsEquivalent PERMANENT`, and
  the arm in `Core`'s constructor that recognises an allocation carries
  `@inventedArm if — PERMANENT`.

This is ratified repo-wide here by the repo owner.

## A create path awaits its block before saving (`create`'s `&block`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-create-path-awaits-its-block-before-saving-creates-block).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Thor commands register through an explicit `methodAdded`

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#thor-commands-register-through-an-explicit-methodadded).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Thor dispatch is async

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#thor-dispatch-is-async).
The decision is unchanged; the heading stays here so code citing it still
resolves.

## Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#trails-has-no-autoloader-railsautoloaders--zeitwerk).
The decision is unchanged; the heading stays here so code citing it still
resolves. It is about the application loader only; framework-internal
call-time constant resolution is § "Call-time constant resolution" above.

## An action's name is its method's name (`AbstractController::Base#action_methods`)

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#an-actions-name-is-its-methods-name-abstractcontrollerbaseaction_methods).
The decision is unchanged; the heading stays here so code citing it still
resolves. actionview's template lookups and trailties' generators follow that
section; the one-line rule is that an action goes by its method's camelCase
name everywhere, and a file or locale key named for an action is kebab-case.

## Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#trilogy-is-out-of-scope-trilogy_adapterrb-adapterstrilogy).
The decision is unchanged; the heading stays here so code citing it still
resolves. The one-line rule: Trilogy is never ported, its unported-files rows
are permanent, and a Trilogy-only test arm is dropped.

## An adapter file is loaded by an awaited step (`ConnectionAdapters.resolve`'s `require`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#an-adapter-file-is-loaded-by-an-awaited-step-connectionadaptersresolves-require).
The one-line rule: ESM has no synchronous `require`, so
`ConnectionAdapters.load` awaits the adapter's `import()` before `resolve`. The
one other `require` ported that way is `active_support/message_pack`, awaited
at boot ([packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#active_supportmessage_pack-is-loaded-by-an-awaited-step-at-boot-serializerwithfallbacks-require)).

## A migration file is loaded by `Kernel#load` (`MigrationProxy#load_migration`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-migration-file-is-loaded-by-kernelload-migrationproxyload_migration).
The one-line rule: `Kernel#load` is ruby-compat's `rbFLoad`, an awaited
`import()` that evaluates the file again and seats its constant-named exports.

## A dumped statement wraps its trailing options in braces (`SchemaDumper`'s `parts.join(", ")`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-dumped-statement-wraps-its-trailing-options-in-braces-schemadumpers-partsjoin-).
The one-line rule: a dumped TypeScript call needs `{ }` around its options only
when it has any, and that one arm is permanent.

## `ActiveRecord::Promise` is the native promise (`promise.rb`, `Promise::Complete`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#activerecordpromise-is-the-native-promise-promiserb-promisecomplete).
The decision is unchanged; the heading stays here so code citing it still
resolves. The one-line rule: every `async_*` reader returns a native promise,
`promise.rb` is not ported, and a `Promise.new` / `Promise.wrap` call is
omitted without a receipt.
