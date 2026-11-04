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
- **Speed.** A declaration or arm that exists only for a measured hot path
  carries `@perf <measurement> — PERMANENT|CONVERGEABLE <story-id>`, the
  measurement the number the bench showed (`100ns`, `2x`, `30%`), so a reader
  and a gate can tell it from a deviation a language shortcoming forced.
  `blazetrails/perf-tag-placement` holds the shape and reds a tag that
  documents no declaration; `stale-story-references` reds one naming a landed
  story. `@perf` exempts nothing: it is not a `@noRailsEquivalent`, does not
  discharge `@inventedArm` or any call gate, and does not take a declaration
  out of the `internal` or extra-surface counts. A module-private helper is
  still counted as internal (`extractFileLocalHelpers` marks it so); what
  keeps a perf helper out of that count is the `_` prefix
  `countTsInternalNames` skips, and the helper carries `@perf` so the prefix
  is receipted. The tag goes on the cache machinery itself, not on a
  declaration that only bumps it.

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
`call-mismatches-exclude` baselines, `@noRailsEquivalent`,
`@missingRailsCall`, `SKIP_GROUPS`, and every story in a
`<package>-surfaced-deviations` bucket — is a **burndown ledger**, not a settled
decision. A row in one of them says "we know this is wrong and haven't fixed it
yet." It is never a licence to leave it, to copy the pattern into new code, or
to add a sibling row next to it.
Which registers are JSDoc tags at a declaration and which stay JSON is in
[docs/infrastructure/curation-register-split.md](docs/infrastructure/curation-register-split.md).

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
  relation readers depend on the difference. Its two-argument arm on a plain
  object with a literal key is `Object.hasOwn(h, "k") ? h.k : default`; every
  other `fetch` is ruby-compat's `fetch` (see the next bullet).
- **Native first (RFC 0194).** Every ruby-compat helper follows one rule:
  write the native JS form wherever behavior at the call site is identical,
  and keep the helper only where it dispatches or where semantics observably
  differ. "Dispatches" means the receiver may be a `Map` / `Hash`, the
  receiver answers the call itself (`isEmpty`, `fetch`, `isRespondTo`), or
  the name is computed. Where the form is identical the helper is not
  optional but wrong (owner ruling, 2026-10-19), and
  `ruby-compat-native-required` (`eslint/ruby-compat-native-required.mjs`)
  reports the helpers listed in its only-grow
  `ruby-compat-native-required.json` called on an Array, `string`, `number`
  or plain object. The Hash table and the Array / String / Enumerable table
  below are this rule applied.
- **Hash calls on a plain object.** Where the receiver is a plain object, write
  the JS form and not the ruby-compat helper. The call gates credit the form on
  the receiver Rails names, and `parity:api:calls:args` checks a literal key.

  | Ruby                              | Native form                               | Keeps the helper where                                                                                                    |
  | --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `h.key?(:k)` / `has_key?`         | `"k" in h`; `Object.hasOwn(h, k)`         | the object can hold `{ k: undefined }` for an absent keyword                                                              |
  | `h[k]` / `h[k] = v`               | `h[k]` / `h[k] = v`                       | a miss must read `null`; `k` is caller-supplied (`"__proto__"`, an `Object.prototype` name); a test asserts `FrozenError` |
  | `h.delete(:k)`                    | `delete h.k`                              | the removed value is used, or a block is passed                                                                           |
  | `h.merge!(other)` / `update`      | `Object.assign(h, other)`                 | a conflict block is passed                                                                                                |
  | `h.merge(other)`                  | `{ ...h, ...other }`                      | a conflict block is passed; the result must have no prototype                                                             |
  | `h.each_pair { \|k, v\| }`        | `for (const [k, v] of Object.entries(h))` | the call's return value is used                                                                                           |
  | `h.fetch(:k, default)`            | `Object.hasOwn(h, "k") ? h.k : default`   | the key is computed; one argument (`KeyError`) or a block is passed                                                       |
  | `delete_if`, `keep_if`, `replace` | none                                      | always                                                                                                                    |

  `in` is for a literal key that is not an `Object.prototype` member name;
  a computed or caller-supplied key is `Object.hasOwn(h, k)`, since `in` walks
  the prototype chain and `"toString" in options` is true. Every row also keeps
  the helper where the receiver may be a `Map`, a `Hash`, or an object that
  answers the call itself (`isKey`, `get`, `set`, `each`), because the helper
  dispatches and the form does not. A member call (`headers.hasKey(k)` for
  `Rack::Headers#key?`) is a ported Rails method, not a helper, and stays.

- **Array, String and Enumerable calls on a native value.** The same rule,
  for the receivers JS already has. `ruby-compat-native-required` enforces
  each row once its sweep adds the helper to the JSON list; until then it
  is enforced by review.

  | Ruby                               | Native form                            | Keeps the helper where                                                        |
  | ---------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
  | `a.first` / `a.last` (no argument) | `a[0] ?? null` / `a.at(-1) ?? null`    | the receiver may be an Enumerable or a `Range`; a count argument is passed    |
  | `a.include?(x)`                    | `a.includes(x)`                        | equality must be Ruby `==` (`rbEqual`) on objects, not `SameValueZero`        |
  | `a.map` / `a.select` / `a.reject`  | `a.map` / `a.filter` / `!` in filter   | the block result is read with Ruby truthiness (`0`, `""` are truthy in Ruby)  |
  | `a.join(sep)`                      | `a.join(sep)`                          | an element is a nested Array: Ruby joins it with `sep`, JS with `","`         |
  | `a.compact`                        | `a.filter((x) => x != null)`           | the in-place `compact!` and its `nil`-when-unchanged result                   |
  | `a.each_with_index`                | `a.forEach((x, i) => …)` / `entries`   | the receiver may be any `each` receiver, or the enumerator result is used     |
  | `s.start_with?` / `s.end_with?`    | `startsWith` / `endsWith`              | a Regexp or several prefixes are passed                                       |
  | `s.include?(t)`                    | `s.includes(t)`                        | never, on a `string` receiver                                                 |
  | `s.strip` / `upcase` / `downcase`  | `trim` / `toUpperCase` / `toLowerCase` | Ruby's whitespace set (`strip` keeps `\u00A0`) or ASCII-only case mapping     |
  | `s.split(sep)`                     | `s.split(sep)`                         | trailing empty fields are dropped, a limit is passed, or `sep` is `nil`/`" "` |

  Enumerable helpers are free functions taking the receiver first,
  `partition(enum, fn)`, never a method spliced onto `Array.prototype`. Keep
  one only where the receiver is not an Array (`each` receiver, `Range`,
  `Set`) or where it reads its block with Ruby truthiness.

- **`present?` / `blank?` / `presence`.** Use the ActiveSupport analogues, not
  `!!x` or `x?.length`. `" "` is blank in Ruby and truthy in JS.
- **kwargs.** A TS default parameter swallows an explicitly-passed `undefined`,
  so a caller forwarding an absent kwarg silently gets the default where Ruby
  would have seen `nil`. Match Ruby's kwarg semantics explicitly when it matters.
- **An optional positional before trailing options or a block.** Ruby tells
  `has_many(name, scope = nil, **options)` apart by syntax; JS has only
  position. Keep every Rails parameter in its own slot, with the Rails default
  (`scope = null`). Where the skipped positional and the options hash are told
  apart by type (a callable or `nil` against a plain object), the method may
  take the options in the positional's slot and move them across at the top of
  its body, as Ruby's signature does, so `hasMany("posts", { dependent:
"destroy" })` keeps working. Where they cannot be told apart (both hashes,
  both strings), the caller passes `undefined` for the skipped positional:
  `removeForeignKey("astronauts", undefined, { column: "rocket_id" })`,
  `withExampleTable(connection, "ex", undefined, block)`. The move-across lives
  in the method whose Ruby signature does the split, never in a helper it
  calls. Ruled by the repo owner on 2026-10-20.
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
- **A Ruby Hash is a plain object unless it needs a `Hash` feature.** The
  features, each with its MRI citation, are in
  [packages/ruby-compat/README.md](packages/ruby-compat/README.md#when-a-ruby-hash-is-a-hash-and-when-it-is-an-object).
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

- **Minitest assertions.** A Minitest built-in (`assert_equal`, `assert_nil`,
  `assert_predicate`, …) ports as a Vitest `expect` by the table in
  [CONTRIBUTING.md § "Porting a Minitest assertion"](CONTRIBUTING.md#porting-a-minitest-assertion):
  the built-in matcher by default, and a `@blazetrails/vitest-matchers` matcher
  only where the built-in gives the wrong result for the value under test
  (`toBeTruthy` on a value that can be `0` or `""`).

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
  `rails` is `trails` the same way: `test "rails env is dev"` is
  `it("trails env is dev")`, unless the test is about real Rails interop.
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

Run these in order. Each gate's full contract — mark regimes, tighten
commands, receipt shapes, enrollment sets — is in
[docs/parity-gates.md](docs/parity-gates.md); read the relevant step there
before you baseline, tighten or receipt anything. Write only `parity:*` script
names: the old `api:*` / `test:compare` / `test:assertions:*` aliases are
deprecated and never go in a doc, comment, script or CI step.

Every ratchet gate below (`parity:api:calls`, `:calls:args`, `:params`,
`:predicates`, `:extra:gate`) shares one contract: it is **only-shrink**, the
fix is the code and never the mark, a converged row is deleted by hand and its
mark narrowed with the gate's `:tighten` command, and there is **no reseed**
(`--write` buries the one row you meant to retire). `:params` and
`:predicates` keep marks with no rows; the lint rules in steps 5–6 have
neither. A receipt is `PERMANENT` or `CONVERGEABLE <story-id>`; a tag claiming
neither is an error.

1. **Size.** `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**' ':!**/*.md'`
   against the LOC ceiling in your prompt's "Hard rules" block.
2. **Touched a ported method body?** `pnpm parity:api:calls` (call set, RFC
   0047; `API_COMPARE_FORCE=1 pnpm parity:api --calls` past a warm cache) and
   `pnpm parity:api:calls:args` (call arguments, RFC 0095). A new mismatch is
   fixed by calling what Rails calls, with what Rails passes; a baseline row
   is the fallback and costs a reviewed one-line `reason` for the row **you**
   add. The debt metric is the row count (RFC 0084). One justified omission
   can carry `@missingRailsCall` / `@missingRailsArgs` at the call site.
   `naming` rows are never baselined in the AR require-closure or
   `NAMING_ENROLLED_PACKAGES`: rename, or receipt with `@missingRailsName`. An
   arm or call your body ADDS is invisible to both gates: converge it, or
   receipt it with `@inventedArm <token>` (`pnpm parity:api:arms:throws`). A
   constructor with `@inlinedFrom` tags: `pnpm parity:api:inlined` (and
   `:fix`).
3. **Touched a signature?** `pnpm parity:api:params` (RFC 0126): a parameter
   keeps the Rails identifier, camelCased. **Ported a Ruby predicate?**
   `pnpm parity:api:predicates` (RFC 0156): `foo?` is `isFoo` (or a
   boolean-typed member), never a value-typed `foo`.
4. **Added a public TS name?** `pnpm parity:api:extra --package <pkg>` lists
   names with no Ruby counterpart: delete it, fold it into the ported method,
   or receipt it with `@noRailsEquivalent`. Never defer it to an allowlist.
   `pnpm parity:api:extra:gate` (RFC 0117) gates `novel` and `total`; a pinned
   or rowless package needs a receipt or a deletion, and no package is ever
   un-pinned to turn a run green.
5. **Wrote an `@internal` tag?** `blazetrails/rails-private-jsdoc` requires it
   where Rails is private on every host; `unbacked-internal-needs-receipt`
   (RFC 0121) requires a `@noRailsEquivalent` receipt on one Rails does not
   back. Both enrollment sets are only-grow.
6. **Working in `arel` or `activemodel`?** `pnpm lint --fix` after step 2:
   `rails-file-structure-method-order` needs the manifest `pnpm parity:api`
   builds, and silently passes without it.
7. **`pnpm parity:api` / `pnpm parity:test`** deltas must be non-negative.

## Module mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. TS has no
language-level equivalent, so `@blazetrails/ruby-compat` and
`@blazetrails/activesupport` supply one for each Ruby construct. **Pick by
what the Ruby does**, so the TS reads back as the same mixin:

| Ruby                                | TypeScript                           |
| ----------------------------------- | ------------------------------------ |
| `include SomeModule`                | `include()` / `Included<>`           |
| `extend SomeModule`, `ClassMethods` | `extend()` / `Extended<>`            |
| `prepend SomeModule`                | `prepend()`                          |
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
and `this` resolves to the actual subclass at runtime. This form is for an
_individual_ method. A run of `static X = X` lines standing in for one Ruby
`extend SomeModule` is a hand-rolled `extend`: use `extend()`, so the mixin
survives as one construct.

**Instance methods mixed in bulk** (Rails' `include QueryMethods`) are
`include()` / `Included<>`; see `ruby-compat/src/include.ts` and `relation.ts` +
`relation/query-methods.ts`. **Class methods mixed in bulk** (Rails'
`extend SomeModule`, and the `ClassMethods` half of an
`ActiveSupport::Concern`) are `extend()` / `Extended<>`.

**An `included do ... end` block** is a property on the module keyed by the
exported `included` symbol (`Symbol.for("@blazetrails/ruby-compat:included")`).
`include()` calls it with the including class after the module's methods are
installed, which is where Ruby runs the block; `extend()` does the same with
`extended`. `ruby-compat/src/include.test.ts` covers both: "fires the included
callback after methods are copied" and "does not copy the included symbol onto
the prototype".

**`class_attribute :foo`**, including one inside an `included do` block, is
`classAttribute()`, which already gives Rails' semantics (reads walk the
constructor chain, writes are local to the class); do not hand-roll
copy-on-first-write per call site.

When NOT to use these:

- A **string-named** `extended` / `included` / `inherited` method. Those names
  are Ruby lifecycle hooks; a TS method spelled that way is drift, not a
  mirror, which is why `SKIP_GROUPS` in `scripts/parity/conventions.ts` marks
  them `tsMirrorIsDrift: true` and `parity:api:extra` keeps flagging them. The
  hooks above are symbol-keyed, so they never collide with that entry.
- `inherited`, unlike the other two, has **no** equivalent: JS has no hook that
  fires when a subclass is defined (see § "`inherited` is deferred to
  own-property memo guards").
- If the method needs Model-specific state beyond the host interface,
  keep it in `model.ts` directly.

### A Ruby module is a JS object or a JS class

**A Ruby module is a JavaScript object or a JavaScript class. There is no
third shape.** ruby-compat's `Module` class, and any carrier object spliced
into an includer's prototype chain, is not one of them: it is a carrier trails
invented, it is being deleted (RFC 0197), and a new one is never the answer to
a porting problem. Ruled by the repo owner on 2026-10-22.

- **Plain-object module.** Its own enumerable members are its instance
  methods, which `include()` copies onto the includer's prototype. Its own
  non-enumerable members are its singleton methods (what `extend()` installs,
  such as `Concern`'s hooks) and its module state (`Concern`'s
  `@_dependencies`). A member whose name starts with a capital is a constant
  and is not copied. Reach for this shape first.
- **Class module.** A TS class marked with `static readonly [classModule] = true`.
  Its prototype holds the instance methods, enumerable or not, and its
  statics hold the singleton methods. Use it when a module has a singleton
  and an instance member of the same name (`mattr_accessor`), or when a
  definer writes instance members non-enumerably (`attr_internal`,
  `delegate`, accessor `defineProperties`): `FormHelper`, `SanitizeHelper`.

**A module that includes a module records it.** `include(mod, other)` on
either shape copies nothing onto `mod`. When a class later includes `mod`,
`rbModAppendFeatures` appends the recorded modules first, as
`include_modules_at` (`vendor/ruby/v3.3.11/class.c:1253`) walks the included
module's ancestry, so `mod`'s own methods outrank them and the class reports
`other` as included. A `Concern` dependency still goes through
`Concern#append_features`.

**A method defined on a module after it is included** has no carrier-free
form: Ruby's includers share the module's method table (`rb_include_module`,
`vendor/ruby/v3.3.11/class.c:1179`), and the repo owner has ruled out both a
carrier and a list of a module's includers. Each such site is ported so that
its definitions exist before the include. That is the whole remedy — "leave it
on a `Module` until its own story settles it" is not a second one, and reaching
for the carrier because the ordering is awkward is how the 61 remaining
instances got there.

One exception is ratified: `RoutesHelpers.with`
(`actionpack/lib/abstract_controller/railties/routes_helpers.rb:12-30`).
A route set draws its routes after controllers include its `url_helpers`, so
no ordering puts the helpers first. Its `NamedRouteCollection` keeps a weak
list of the prototypes that copied its helpers, and `add_url_helper` /
`clear!` write through to them (`_appendIncluder`, `isIncludedMember`). No
carrier is spliced into the prototype chain. Ruled by the repo owner on
2026-10-29; it does not license an includer list for any other module.

`pnpm parity:modules` (`scripts/parity/module-count.ts`) counts, per package,
the `new Module` expressions, `superMethod(` calls and `Module` imports from
`@blazetrails/ruby-compat`, against `scripts/parity/module-count-mark.json`.
It is **only-shrink** with no reseed: `--tighten` writes each mark DOWN, every
mark's destination is 0, and the file is deleted with the class
(`delete-ruby-compat-module-class-final`). Finding a `Module` next to your work
is a reason to converge it, not to match it (§ "A documented deviation is debt,
not permission").

## A module's `initialize` is inlined into the constructor (`@inlinedFrom`)

Ruby lets a module define `initialize` and reach the next one up the ancestor
chain through `super`. A JS constructor has no such chain through a mixin.
**trails has no `initialize` methods**: Ruby's `new` / `initialize` chain is
written as JS constructors, by two rules.

- **A Rails class that inherits from a class uses JS `super()`.** Statements
  that only compute arguments stay ahead of it. Where Ruby does work on `self`
  and then calls `super`, and the parent's body does not read that work,
  `super()` is hoisted to the first line. JS forbids `this` before `super()`,
  so that reorder is forced by the language and is the sanctioned spelling.
- **A module's `initialize`, or a parent's that reads the child's setup, is
  inlined.** The body is written into the constructor at the position Ruby's
  `super` occupies, line for line, in the constructor of each class that
  includes or prepends the module. A `new` that arrives through a
  `ClassMethods` module the class extends is inlined at the head of the
  constructor the same way. A class's own `def self.new` is not an inlining:
  `Klass.new` and `new Klass` are one operation, so it is the first part of
  the constructor and takes no tag (see § "A record is built with `new Klass`
  only").

A parent constructor never calls an overridable hook to let a subclass run
early. JS runs a subclass's field initializers after `super()` returns, so a
field such as `history = []` overwrites whatever the hook set.

The worked example is `Base`. `ActiveModel::API#initialize`
(`activemodel/lib/active_model/api.rb:80-84`) is
`assign_attributes(attributes) if attributes`, then `super()`.
`ActiveRecord::Core#initialize`
(`activerecord/lib/active_record/core.rb:471-477`) sets `@new_record` and
`@attributes`, calls `init_internals` and `initialize_internals_callback`, and
only then calls `super`, which lands in `API#initialize` because
`ActiveRecord::Base` includes `ActiveModel::API` directly
(`activerecord/lib/active_record/base.rb:283`). So `Base`'s constructor is
`Core#initialize`'s body with `API#initialize`'s line at the `super` position:

```ts
/**
 * @inlinedFrom ActiveRecord::Inheritance::ClassMethods#new rails/v8.0.2/activerecord/lib/active_record/inheritance.rb:56-78
 * @inlinedFrom ActiveRecord::Core#initialize rails/v8.0.2/activerecord/lib/active_record/core.rb:471-482
 * @inlinedFrom ActiveModel::API#initialize rails/v8.0.2/activemodel/lib/active_model/api.rb:80-84
 */
constructor(attributes = null) { … }
```

`@inlinedFrom` names the Ruby body a segment of a constructor came from:

- **Where.** On a class constructor's JSDoc, or on the JSDoc of a class
  method that inlines a module method's `super` (below), and nowhere else, one
  tag per inlined segment, in chain order.
- **Value.** Exactly one shape: a Ruby `Module#initialize` or
  `Mod::ClassMethods#new` on a constructor, or the `Module#<method>` the method
  is named after, whose Rails body calls `super`, then its citation
  `<source>/<version>/<file>:<first>-<last>`, the span of the `def`, relative
  to `vendor/` and not spelling it. No prose, no story id, no `PERMANENT`.
- **The tag follows the file.** Only a body whose `def` lives in a different
  Ruby file from the one the constructor's file mirrors is tagged. A module
  defined in the same `.rb` as the class that includes it is inlined the same
  way and carries no tag, and a tag on one is an error.
- **The citation is derived, never hand-edited.** It comes from
  `rails-api.json`: `pnpm parity:api:inlined:fix` rewrites the path and line
  span, and `pnpm vendor:recite` rewrites a stale version. It is there for the
  reader. It does not detect a changed Rails body; the body pins
  (`pnpm parity:api:pins`) do.
- **It is not a licence for arel's `inlined-from` bucket.** That bucket is the
  general case, a module member whose body sits on an including class's file,
  and it is pinned at 0. The tag admits a constructor segment from the closed
  list of hooks in `eslint/inlined-from-placement.mjs` and nothing
  else.

**A module installed at run time is inlined behind a guard.** Where the
include or prepend happens in a load hook, conditionally, or on a subclass the
port cannot see (`EncryptedFixtures` prepended onto `Fixture` only under
`encrypt_fixtures`, `railtie.rb:357-362`; `Thor::Actions` included by a user's
Thor class), the body is still inlined at Ruby's `super` position in the
nearest constructor, wrapped in `if (isModuleIncluded(new.target, Mod))`, the
`include?` question Ruby's ancestor chain answers. The guard carries
`@inventedArm if — PERMANENT` where the arm gate compares the declaration, and
the segment is tagged only where the Rails manifest records the include
(`inlined-from-manifest-follows-included-hook-includes`). Ruled by the repo owner on 2026-10-19.

`parity:api` credits a tagged module hook to the constructor, both call gates
compare the constructor against the tagged bodies in chain order, and
`pnpm parity:api:inlined` reds on a stale or unfounded tag (see "Before you
open the PR"). `initialize_copy` / `initialize_dup` / `initialize_clone` are
the `rbObjDup` / `rbObjClone` protocol and stay methods. This rule was set by
the repo owner on 2026-10-08 (RFC 0188).

**A module method's `super` is inlined the same way** (RFC 0197). A copied
plain-module method has no link to resume a `super` search from, so a module
method `M#foo` whose Rails body calls `super` is not kept as a member of `M`.
For each class `C` that includes `M`, `C#foo` is `M#foo`'s body with the next
`foo` in `C`'s Rails ancestry inlined at the `super` position, line for line,
until a body makes no `super` call or the chain reaches `C`'s JS superclass,
where the `super` stays a real `super.foo()`. `C#foo` carries one
`@inlinedFrom <Module>#foo <citation>` per segment from another Ruby file, in
ancestor order, with the citation shape above. A module that is a `super`
target converts in the same PR as the module whose `super` reaches it, because
a plain module's copied methods outrank every carrier link.

**A module included by an open set of classes binds `super` at include time**
(RFC 0197, ruled by the repo owner on 2026-10-20). Inlining needs the list of
includers, and a concern application code includes (`ActiveModel::Dirty`,
`Validations`, `Attributes`, `TestFixtures`, a prepended `Correctable`) has
none. For such a module the method stays in the module's own file under its
Rails name, and its `super` is `rbCallSuper(this, foo, ...args)` (MRI
`rb_call_super`, `vendor/ruby/v3.3.11/vm_eval.c:366`). When `include()`,
`prepend()` or `extend()` copies `foo` over a method the target already
answers, it seats that method under a slot private to `foo`; `rbCallSuper`
reads it with one property read and, with nothing seated, falls through to
`Kernel`. The seat is a snapshot: a method defined above the target after the
include is not seen, so a `super` that reaches a live-include module stays on a
`Module`. A method a class defines itself is not overwritten by the copy, so
its JS `super.foo()` skips the module, and that class inlines the module body
at its `super` (`HasManyThroughAssociation#buildRecord`). Inlining stays the
rule for a module whose includers are a closed set of framework classes.

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

Moved to [packages/activemodel/CLAUDE.md](packages/activemodel/CLAUDE.md#serializations-dual-syncasync-hash-serializable_hash--as_json); unchanged, heading kept for citations.

## `Relation` is evaluated by an async query (`records`, and the predicates it carries)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#relation-is-evaluated-by-an-async-query-records-and-the-predicates-it-carries); unchanged, heading kept for citations.

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

## Call-time constant resolution (Ruby autoload → ES imports)

Ruby resolves a constant named inside a method body when the method **runs**,
and Zeitwerk autoloads the file at that moment. So `contexts.rb:36` can name
`EncryptingOnlyEncryptor` and `config.rb` can name `DerivedSecretKeyProvider`
without either file taking a load-order dependency on them.

**ESM already does this inside a function body, so a plain `import` is the
default.** An import binding is live: it is read when the expression runs, not
when the module is evaluated. So `import { Not } from "./unary.js"` named
inside a method is resolved at call time — what Zeitwerk's autoload buys Rails
— and it stays correct when the two modules sit in a cycle, because the method
runs long after both bodies have finished. Lean on ES imports and exports.

The `import` _edge_ is eager even though the read is not, and that matters for
a read evaluated **while the module body runs**. Four shapes do that, and a
class body is two of them:

- an `extends` clause;
- a **static field initializer** (`static x = Other.y`), which runs when the
  class definition is evaluated — so the `static x = x` of § "Module mixins"
  is a module-eval read, not a deferred one;
- a top-level call, `include(Base, ActiveRecord.Scoping)` among them;
- a top-level `new` or `const`.

When such an edge closes a cycle whose participants include a
`class Sub extends Super`, entering the graph at `super.ts` evaluates `Sub`
with `Super` still in TDZ and the module throws
`Cannot access 'Super' before initialization`. An instance field initializer is
not one of these: it runs per construction, so it is deferred.

A TypeScript type position (`T extends Nodes.X`, `: Nodes.X`) is erased and
costs no edge, so it is an `import type`.

Measured on 2026-10-22, 631 of 686 namespace reads in the repo were inside a
function or method body and 55 at module-eval time — of those, 8 erased type
positions and ~35 `extends Migration.Current` migration fixtures, leaving fewer
than ten genuine framework sites. The namespace read is for those; a plain
import is for everything else, and "it is in a cycle" is not a reason on its
own (RFC 0205).

For a module-eval read, two shapes are sanctioned, and only these:

- **A namespace object extended with `ActiveSupport::Autoload`** (RFC 0151),
  mirroring Rails' `autoload` lists: each constant is seated by its defining
  module with a plain `Namespace.Name = Klass` assignment, which is type-checked
  against the namespace's declared property, and is read where a module-eval
  read needs it (`include(Base, ActiveRecord.Scoping)`). `constSet` is
  written only where the ported body itself calls `const_set` — 18 sites in the
  vendored Rails tree, tabled in the tasks repo's
  `rfcs/0205-namespace-seats-are-plain-javascript/README.md` — and never as the
  seat spelling. The rule is per body, not per count: a ported gem that calls
  `const_set` qualifies the same way (thor's `rake_compat.rb:64` is the one
  such site outside Rails, and is unported). A class's qualified Ruby path is
  a ruby-compat internal (§ "Constant lookup is an import or a registry"),
  not the seat. `constGet` reads these seats at call time. A constant Rails
  `require`s rather than autoloads is seated with no `autoload` call. Ruby's
  top-level `Object` is `TopLevel` in `ruby-compat/src/object.ts`: the
  defining gem seats it (`TopLevel.Trails = Trails`) and a reader names it at
  call time (`TopLevel.Trails!.env`), carrying a guard only where Rails has a
  `defined?`. A `globalThis` seat was rejected because a `declare global` in a
  published `.d.ts` reaches every consumer.
- **A zero-import slot module**: a file with no runtime imports at all (so it
  cannot join any cycle) exporting a mutable binding plus a `_setX()` setter,
  which the defining module calls at the bottom of its own body. Readers import
  the binding from the slot and use it at call time. No instance remains:
  every slot has converged onto a namespace seat. Neither shape is what to
  reach for first — a plain ES import is, and the two above are for a
  module-eval read only.

The per-package inventories of namespace objects, seats and the cycles they
break live in [packages/arel/CLAUDE.md](packages/arel/CLAUDE.md#call-time-constant-resolution-arel),
[packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#call-time-constant-resolution-activesupport-actionview-actionpack)
and [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#call-time-constant-resolution-activerecord).

This is a genuine language shortcoming, not a preference, and it is the one
sanctioned shape for it — do not re-derive a per-cluster justification, and do
not reach for a namespace read or a slot when a plain import would do. Before
writing either, check whether the read runs during module evaluation; if it is
inside a function or method body, it is an ES import, cycle or no cycle.
Verify both directions with a plain-node import of the **built** `dist/**.js`
modules as entry modules; a vitest run enters the funnel module first and masks
the TDZ, so a green suite proves nothing here. Deferring the subclass edges
instead (a slot per `extends` site) does not work: nothing then loads the
subclass modules at all, so their self-registration never runs.

### Constant lookup is an import or a registry (`constantize`, `const_get`)

Ruby finds a class by name at run time: `constantize`, `const_get`,
`const_defined?`, `constants`, `path2class`. trails ports that lookup. The
2026-10-28 ruling against it was reversed by the repo owner on 2026-10-30
(RFC 0213; the heading stays so citations resolve).

- **A name Rails computes, or one application data supplies, is a lookup.**
  `constantize` is `Object.const_get(camel_cased_word)`
  (`vendor/rails/v8.0.2/activesupport/lib/active_support/inflector/methods.rb:289-291`):
  `constGet(Object, word)` walks `TopLevel` by segment and calls the
  receiver's `constMissing` on a miss. `compute_type`
  (`vendor/rails/v8.0.2/activerecord/lib/active_record/inheritance.rb:255-261`)
  ports line for line. A literal argument is typed through ruby-compat's
  `ConstantTable`, and answers `unknown` otherwise.
- **A known name is still an ES import.** A name that is a literal at the call
  site, and that a plain import can reach, is an import (§ "Call-time constant
  resolution"), or a module-private map or `switch` beside the reader.
- **`registerModel`, `registerController`, `registerJob`, `registerChannel` and
  `registerConnection` are retired** under RFC 0213. A constant is seated on its
  namespace (`constSet(TopLevel, "Name", Klass)`), and the walk finds it there.
- **There are no full-path seats.** A nested constant is seated on its owner
  (`constSet(Owner, "Name", Klass)`), and a class only a generated table names
  is read where the walk reaches it.
- **Class-path tables answer class → Ruby name.** That direction is output:
  `rbModName`, `rbInspect` and exception text, and every Rails body that reads a
  class's `name` to build a string. They are ruby-compat internals. The
  generated `constants*.generated.ts` file each package carries is the one
  place outside ruby-compat that calls `defineConstants`. Hand-written code outside
  ruby-compat never calls `defineConstants`, `rbClassPath`,
  `rbConstTableGet` or reads `classpaths`; it reaches a Ruby name only
  through `rbModName` / `rbInspect`.

**A slot or seat read carries no guard**, because the Ruby body it mirrors
carries none: `Arel::Nodes::Node#not` is `Nodes::Not.new self`
(`arel/nodes/node.rb:122`) and raises `NameError` if the constant will not
resolve. So a reader is written `new _Not!(this)`, and an unset slot surfaces as
a plain `TypeError` at the call site — the JS analogue of that `NameError`. A
`throw` explaining that the caller deep-imported the module is invented
surface. The two guarded reads of `ActiveRecord.Base?.` on a standalone
adapter's own path are the one exception, recorded in the activerecord file.

## The pool monitor guards only sections that span an `await` (`ConnectionPool`'s `MonitorMixin`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#the-pool-monitor-guards-only-sections-that-span-an-await-connectionpools-monitormixin); unchanged, heading kept for citations.

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
  method, so `rbObjRespondTo(obj, mid)` and `basicObjRespondTo(obj, mid)` take
  no visibility argument. A Rails override keeps its include-private parameter
  (`isRespondTo(name, includePrivate = false)`) and does not read it, and an
  arm whose only difference is that flag is removed:
  `ActiveModel::AttributeMethods#respond_to?`'s second `super(method, true)`
  (`attribute_methods.rb:528-533`) cannot answer differently from its first.
- A Rails `public_send` that survives § "A dispatch by name is spelled
  directly" ports as `rbFSend`, which raises `NoMethodError` for an undefined
  name and goes to `methodMissing`. `public_method_defined?` is
  `rbModMethodDefined`, `public_instance_method` is `rbModInstanceMethod`, and
  `public_methods` is `rbObjMethods`; `private_methods` and
  `protected_methods` are always empty and are not ported.
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

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#schema-reflection-peeks-at-a-warm-cache-load_schemas-schema_cachecolumns_hash); unchanged, heading kept for citations.

## Adapter facts are prewarmed and peeked (`lookup_cast_type`, `max_identifier_length`, `quote_string`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#adapter-facts-are-prewarmed-and-peeked-lookup_cast_type-max_identifier_length-quote_string); unchanged, heading kept for citations.

## The adapter lock defaults to a monitor, not `NullLock`

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#the-adapter-lock-defaults-to-a-monitor-not-nulllock); unchanged, heading kept for citations.

## Records are not Proxies (`method_missing`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#records-are-not-proxies-method_missing); unchanged, heading kept for citations.

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

- `Type::String#cast_value` returns a primitive. A Ruby `String.new` ports as
  the JS string itself, `""` or the value, with no helper: the value is its
  own copy, and the call gates credit it without a `new` expression.
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
each missing one with a row in `scripts/test-compare/assertion-receipts/<package>.ts`
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

**An ASCII-8BIT String is a `Uint8Array`, end to end.** `String#b`,
`IO#read` and `StringIO#read`'s length arm, a binmode or binary-tagged
stream's whole read, `IO.binread`, `Marshal.dump`, `Zlib::Deflate.deflate` and
a binary-directive `Array#pack` answer one, and `bytesize` is its `length`. An encoding-aware `bytesize` over a one-character-per-byte string
was rejected: without a tag, `"\xD0\xCF".b` and the UTF-8 text `"ÐÏ"` are the
same JS string, so any rule telling them apart is a guess, and the guess
answers 4 for `"café".bytesize` where Ruby answers 5. A call site that reads a
`.b` result as a JS string (interpolation, `===`, a regex) converges at that
site, as Ruby keeps binary and text apart there too. A JS regex cannot match
bytes, so where Ruby scans a binary String with one (`Multipart::Parser`,
`Migration.copy`'s `sub!`), the bytes are read one character per byte for the
scan and written back as bytes. Ruled by the repo owner on 2026-10-21.

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
- **A `self.new` that answers `nil` or `false`.** A JS constructor that returns
  a primitive answers `this` instead, so a Rails `self.new` ported as the
  constructor (RFC 0188) cannot answer `nil`: `DeprecationProxy`'s
  `return object unless object` (`deprecation/proxy_wrappers.rb:6-11`) and
  `TimeZone.new`'s unknown-name `self[name]` (`values/time_zone.rb:216-218`)
  drop that arm. An unknown zone name reaches `create`, which raises
  `TZInfo::InvalidTimezoneIdentifier`. Ruled by the repo owner on 2026-10-14.
- **`initialize` on an allocated receiver.** See § "A revived object copies a
  constructed instance".

- **A non-V8 stack.** `Location` and `Command.FILE_REGEXP` read V8 frames, so on
  an engine with another stack format `excBacktraceLocations` answers no frames
  and `Thor::Command#handle_argument_error?` hands every arity-like
  `ArgumentError` to `handle_argument_error`: `sans_backtrace` is empty, which
  is the usage error, the answer for a CLI user. Ruby-compat's own send frames
  are dropped by the same reader, as `vm_call_opt_send` pushes none.

- Package-specific facts:
  [activerecord](packages/activerecord/CLAUDE.md#a-classmethodsnew-that-runs-after-super-deduplicable)
  (`Deduplicable`, SQLite's DQS setting),
  [activesupport](packages/activesupport/CLAUDE.md#isolationsubprocessrun_in_isolations-child)
  (`Isolation`), [rake](packages/rake/CLAUDE.md#rubys-main-object-rakedsl)
  (`main`), and wasm-vips `Image` deletion in
  [packages/image-processing/CLAUDE.md](packages/image-processing/CLAUDE.md#a-wasm-vips-image-is-freed-by-delete-only).

A test that depends on one of these ports the assertions that do not, and parks
the rest as `it.skip` under a `PERMANENT-SKIP:` line citing this section.

## Node's event loop stands in for Action Cable's nio4r selector (`StreamEventLoop`, `Stream#write`)

Moved to [packages/actioncable/CLAUDE.md](packages/actioncable/CLAUDE.md#nodes-event-loop-stands-in-for-action-cables-nio4r-selector-streameventloop-streamwrite); unchanged, heading kept for citations.

## `$!` is passed explicitly, and a response body is iterated async (`BadRequest#initialize`, `Response#each`)

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#-is-passed-explicitly-and-a-response-body-is-iterated-async-badrequestinitialize-responseeach); unchanged, heading kept for citations.

## Fixtures load from `.ts` modules as well as YAML (`FixtureSet::File`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#fixtures-load-from-ts-modules-as-well-as-yaml-fixturesetfile); unchanged, heading kept for citations.

## DOM testing is HTML5 only (`Rails::Dom::Testing.default_html_version`)

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#dom-testing-is-html5-only-railsdomtestingdefault_html_version); unchanged, heading kept for citations.

## Ruby pattern matching has no port (`assert_pattern`, `deconstruct_keys`)

Ruby's `case`/`in` and rightward `=>` pattern matching
(`vendor/ruby/v3.3.11/compile.c`, `iseq_compile_pattern_each`) are syntax: a
pattern binds and destructures through `deconstruct` / `deconstruct_keys` and
raises `NoMatchingPatternKeyError` on a miss. JS has no pattern syntax, and a
pattern written as data or a predicate is a new mini-language Rails readers
would not recognise. **trails does not port Ruby pattern matching**: Minitest's
`assert_pattern` / `refute_pattern` have no trails counterpart, and the
`deconstruct_keys` members already ported (`Date`, `GlobalID`, `URI::GID`,
ruby-compat's `Hash`) stay as plain methods. A Rails test
whose assertions are patterns (`PatternMatchingTestCases`,
`vendor/rails/v8.0.2/actionview/test/template/test_case_test.rb:490-516`) is
parked as `it.skip` under a `PERMANENT-SKIP:` line citing this section. Ruled by
the repo owner on 2026-10-21.

## A dispatch by name is spelled directly (`send`, `public_send`)

`rbFSend` is the port of `Kernel#send` and `#public_send`
(`rb_f_send`, `vendor/ruby/v3.3.11/vm_eval.c:1330`; `rb_f_public_send`,
`:1350`), and it stays — but they are the last
shape to reach for, not the first. A string-keyed send throws away everything
the call site knew: no TS type checks the receiver or the target, the Ruby name
has to be guessed into a TS spelling (`camelized`, `writerSpelling` and
`RELOPS` inside `sendInternal`, `packages/ruby-compat/src/object.ts`), and a
direct property read becomes a prototype walk plus a table lookup. By
repo-owner ruling on 2026-10-20:

**Write the member call directly.** Wherever the name is known where the call
is written, spell it — `app.call(env)`, with `app` typed. The one exception
is a receiver whose type admits a JS function, such as a Rack app typed
`RackApp` or a block: there `x.call(env)` is `Function.prototype.call`, which
takes `env` as `this`, so Ruby's `x.call(...)` is `rbProcCall(x, ...)`. It
applies a function directly and calls anything else's own `call`, and the
call gates credit it as `call`. Where the type admits no function, write the
member call. An `rbFSend` with a
string literal for a name, or one standing in for a cast the author did not
want to write, is a direct call with the types discarded. This is not a
preference between shapes: it is the answer at nearly every call site in the
repo that reaches for a send today, and "the Rails body says `send`" is not a
reason to keep one where Rails' own name is a literal.

Two fallbacks exist, and both are last resorts:

- **An explicit registry**, where the name genuinely varies at run time but its
  set is closed — a format, a pragma, a config option, an association's writer,
  a visitor's node kind, a Thor instruction. A registry is a declared map from
  the Ruby-visible name to a real, typed function, read at the call site;
  ruby-compat's own `OBJECT_METHOD_TABLE` and `TEMPORAL_METHOD_TABLE`
  (`packages/ruby-compat/src/object.ts`) are that shape. Reach for it only once the
  direct spelling is genuinely impossible, and keep it module-private where
  nothing outside the file reads it — a table is extra surface like any other
  name, and a registry written where a direct call would have done is its own
  invented indirection (§ "Fidelity is the job").
- **`rbFSend`**, where the dispatched name is
  caller-supplied and the set it comes from is open — extended by application
  code, so no table the framework writes can enumerate it. `Object#try`'s
  `public_send(*args, &block)`
  (`vendor/rails/v8.0.2/activesupport/lib/active_support/core_ext/object/try.rb:14-15`)
  takes any name its caller passes. `MimeResponds::Collector#any`'s
  `args.each { |type| send(type, &block) }`
  (`vendor/rails/v8.0.2/actionpack/lib/action_controller/metal/mime_responds.rb:262-264`)
  dispatches a registered Mime symbol, and `Mime::Type.register` appends to
  `SET` at run time
  (`vendor/rails/v8.0.2/actionpack/lib/action_dispatch/http/mime_type.rb:186-193`),
  which is why the collector is a Proxy in the first place (§ "Ruby protocol
  methods with a different JS mechanism"). `Channel::Base#dispatch_action`'s
  `public_send action, data`
  (`vendor/rails/v8.0.2/actioncable/lib/action_cable/channel/base.rb:280-286`)
  dispatches a client-supplied string gated by `action_methods`, which is the
  USER subclass's public instance methods less `Base`'s (`:128-134`) — a set
  the framework cannot see. A gate on a set application code supplies is not a
  table trails can write, so the send IS the ported method, and it stays.

Two corollaries:

- **Do not widen the send machinery's name guessing** to make one new call site
  work. A snake_case Ruby name, an `is…`-spelled predicate, a writer spelling,
  a Ruby operator name — each is a reason to spell that call site directly, not
  to teach `sendInternal` another heuristic for every receiver in the repo.
- **A story does not propose a send.** When filing or sizing work, name the
  direct call in the acceptance criteria. Finding an `rbFSend` next to your
  work is a reason to converge it (§ "A documented deviation is debt, not
  permission"), not to match it.

One gate holds the line. `pnpm parity:api:sends` counts, per non-test file,
the sends whose name argument is a string literal, and fails on any file above
its count at the merge-base with `origin/main` — only-shrink, with no mark file
to seed or tighten, on trails#9129's reasoning that the base tree IS the mark.
It is a floor, not the rule: it is line-based, so a name on a continuation
line is uncounted, as is one whose receiver nests parentheses more than one
deep, and a computed name it never sees is still governed by the order above.

The call gates do not help, which is why the order above has to be a rule.
For the call SET, `extract-ts-api.ts` credits
`rbFSend(recv, "literalName")` as a call to `literalName` itself
(`collectCalls`), so spelling one out changes nothing there. The ARGUMENT
stream does not follow it: `callSiteName` has no send arm, so the site is
recorded under `rbFSend` with the receiver and the name occupying argument
slots — it can never pair with Rails' own `literalName(…)` site, and
converging it can only improve that pairing. A computed name is credited as
Ruby's own `send` / `publicSend`, and both sit in `SKIP_CALLS`
(`scripts/api-compare/lint-calls.ts`), so a send converged onto a direct call
or a registry needs no baseline row and no `@missingRailsCall` receipt.

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

The per-class status of every Rails definer is the table in
[docs/method-missing-definers.md](docs/method-missing-definers.md).

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
- A `Proxy (misses only)` row reaches `method_missing` only for a name the
  object does not already answer, so a builder tag named `constructor`,
  `toString` or `append` is written `xml.tagBang(name)`, Ruby's `tag!`.
- Class-specific rules for a row live in its package's `CLAUDE.md`, under
  "`method_missing` definers in this package" (activerecord, actionpack,
  activestorage, image-processing, mini-magick, trailties).
- A "named method, no trap" row answers only an explicit `methodMissing` call.
  A "nothing" row with a dispatch-dependent Rails test is a gap, filed against
  its package; the rows are decided per class, not ratified.
- A class-level pair `extend`ed onto a class (`dynamic_matchers.rb`, `action_mailer/base.rb`,
  `railtie.rb:216-230`) is a Proxy spliced into the static prototype chain
  directly above `Base` / `Trailtie`: it forwards only a read that missed every
  class below it, and only a name `respond_to_missing?` claims. The name is
  untyped (a static `findBy${string}` index signature breaks subclass
  assignability), so a call site reaches it through a cast, and `in` still
  cannot see it. `Function.prototype.call` answers `call` before the trap can,
  so `Engine` forwards that one name with an explicit `static call`.

## A private generator may stand in for a block (`find_routes`, `match_route`)

A Ruby block ports as a trailing block parameter, marked with ruby-compat's
`block()` where it rides at the end of a `*args` splat and read back with
`rbBlockGivenP`; a public method Rails lets run blockless answers `toEnum`
there, as `enum_for` does. One case has no callback shape: a block whose body
takes a non-local `return` or `next`, or an `await`
(`Journey::Router#serve` over `find_routes`,
`actionpack/lib/action_dispatch/journey/router.rb:33-65`). There the yielding
method is a JS generator and the block body is the caller's `for…of` body.
**Only a TS-`private` or `@internal` method may do this**, so a generator never
reaches public API; `parity:api:blocks` credits a non-public generator's
`yield` as its block and still flags a public one. Ruled by the repo owner on
trails#9053.

The builder gem is the one exception to `block()`: a `.builder` template's
blocks (`xml.p(() => …)`, `tag!`, `declare!`, `XmlEvents`) are plain trailing
functions, read off the end of the argument list by `typeof`, because a tag's
`*args` hold no other function. Ruled by the repo owner on 2026-10-22.

## `inherited` is deferred to own-property memo guards (`ModelSchema.inherited`)

§ "Module mixins" says only `inherited` has no JS equivalent. JS has no hook
that fires when `class Child extends Parent` is evaluated, so wherever Rails'
`inherited` resets or seeds per-class state, trails defers it to the first read
or first write on the subclass: a memo is answered only when it is an own
property of the class being asked (`Object.hasOwn(host,
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

Moved to [packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#classsubclasses-is-seated-on-a-classs-first-own-write-callbacksclassmethodsset_callbacks); unchanged, heading kept for citations.

### `ParamsWrapper::ClassMethods#inherited` runs at a subclass's first `_wrapper_options` read

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#paramswrapperclassmethodsinherited-runs-at-a-subclasss-first-_wrapper_options-read); unchanged, heading kept for citations.

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
`ClassAttribute.redefine`'s `attached_object.is_a?(Module)` arm is unported
for a JS-class receiver only. A plain-object module is an ordinary object with
a real singleton class, so for it the arm is taken
(`rbClassAttachedObject`).

## A revived object copies a constructed instance (`init_with` / `marshal_load`'s `initialize`)

Ruby's `TimeZone#init_with` is `initialize(coder["name"])`
(`activesupport/lib/active_support/values/time_zone.rb:575-577`), and
`TimeWithZone#init_with` / `#marshal_load` call `initialize` on the receiver
Psych or Marshal allocated (`time_with_zone.rb:174-176`, `:533-535`). trails
has no `initialize` methods (§ "A module's `initialize` is inlined into the
constructor"), and a JS constructor cannot run on an object that already
exists. **Such a body is written `Object.assign(this, new Klass(...))`**, or
through the class's Rails constructor (`TimeZone.create`): the instance Ruby's
`initialize` would have built, copied onto the receiver. A coder-aware
allocator in Psych's `revive` was rejected, since Ruby's allocator never sees
the coder. Each compared site carries `@inventedArm assign — PERMANENT`;
`marshalLoad` has no skeleton row, so it carries none. Ruled by the repo owner
on 2026-10-16.

## A record is built with `new Klass` only (`Inheritance::ClassMethods#new`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-record-is-built-with-new-klass-only-inheritanceclassmethodsnew); unchanged, heading kept for citations.

## A create path awaits its block before saving (`create`'s `&block`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-create-path-awaits-its-block-before-saving-creates-block); unchanged, heading kept for citations.

## A job's `perform` and `enqueue` are async (`perform_now` / `perform_later`)

Moved to [packages/activejob/CLAUDE.md](packages/activejob/CLAUDE.md#a-jobs-perform-and-enqueue-are-async-perform_now--perform_later); unchanged, heading kept for citations.

## Thor commands register through an explicit `methodAdded`

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#thor-commands-register-through-an-explicit-methodadded); unchanged, heading kept for citations.

## Thor dispatch is async

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#thor-dispatch-is-async); unchanged, heading kept for citations.

## FileList#to_ary reads a resolved list

Ratified in [packages/rake/CLAUDE.md](packages/rake/CLAUDE.md#filelistto_ary-reads-a-resolved-list).
The one-line rule: `resolve` is async, and `toAry` answers a resolved list
synchronously and raises while it is pending.

## The application loader is Zeitwerk (`Rails.autoloaders`)

Moved to [packages/trailties/CLAUDE.md](packages/trailties/CLAUDE.md#the-application-loader-is-zeitwerk-railsautoloaders).
It is about the application loader only; framework-internal
call-time constant resolution is § "Call-time constant resolution" above.

## `Module#autoload` is a build step (`Zeitwerk::Loader#define_autoload`)

Moved to [packages/zeitwerk/CLAUDE.md](packages/zeitwerk/CLAUDE.md#moduleautoload-is-a-build-step-zeitwerkloaderdefine_autoload); unchanged, heading kept for citations.

## An action's name is its method's name (`AbstractController::Base#action_methods`)

Moved to [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#an-actions-name-is-its-methods-name-abstractcontrollerbaseaction_methods); unchanged, heading kept for citations. actionview's template lookups and trailties' generators follow that
section; the one-line rule is that an action goes by its method's camelCase
name everywhere, and a file or locale key named for an action is kebab-case.

## System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)

Ratified in [packages/actionpack/CLAUDE.md](packages/actionpack/CLAUDE.md#system-testing-runs-on-vitest-systemtestcase-systemtesting).
The one-line rule: by repo-owner ruling, system testing is ported onto Vitest,
Vite and Playwright with no third-party browser-session library, and test code
runs in a Node Vitest worker.

## Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#trilogy-is-out-of-scope-trilogy_adapterrb-adapterstrilogy); unchanged, heading kept for citations. The one-line rule: Trilogy is never ported, its unported-files rows
are permanent, and a Trilogy-only test arm is dropped.

## An adapter file is loaded by an awaited step (`ConnectionAdapters.resolve`'s `require`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#an-adapter-file-is-loaded-by-an-awaited-step-connectionadaptersresolves-require).
The one-line rule: ESM has no synchronous `require`, so
`ConnectionAdapters.load` awaits the adapter's `import()` before `resolve`. The
one other `require` ported that way is `active_support/message_pack`, awaited
at boot ([packages/activesupport/CLAUDE.md](packages/activesupport/CLAUDE.md#active_supportmessage_pack-is-loaded-by-an-awaited-step-at-boot-serializerwithfallbacks-require)).

## A variant's method names are camelCase (`ImageProcessingTransformer`)

Moved to [packages/activestorage/CLAUDE.md](packages/activestorage/CLAUDE.md#a-variants-method-names-are-camelcase-imageprocessingtransformer); unchanged, heading kept for citations.

## A translation lookup is synchronous; the load is an awaited step (`I18n.translate`)

Moved to [packages/i18n/CLAUDE.md](packages/i18n/CLAUDE.md#a-translation-lookup-is-synchronous-the-load-is-an-awaited-step-i18ntranslate); unchanged, heading kept for citations.

## A migration file is loaded by `Kernel#load` (`MigrationProxy#load_migration`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-migration-file-is-loaded-by-kernelload-migrationproxyload_migration).
The one-line rule: `Kernel#load` is ruby-compat's `rbFLoad`, an awaited
`import()` that evaluates the file again and seats its constant-named exports
on `TopLevel`.

## A dumped statement wraps its trailing options in braces (`SchemaDumper`'s `parts.join(", ")`)

Ratified in [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#a-dumped-statement-wraps-its-trailing-options-in-braces-schemadumpers-partsjoin-).
The one-line rule: a dumped TypeScript call needs `{ }` around its options only
when it has any, and that one arm is permanent.

## `ActiveRecord::Promise` is the native promise (`promise.rb`, `Promise::Complete`)

Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#activerecordpromise-is-the-native-promise-promiserb-promisecomplete); unchanged, heading kept for citations. The one-line rule: every `async_*` reader returns a native promise,
`promise.rb` is not ported, and a `Promise.new` / `Promise.wrap` call is
omitted without a receipt.

## Templates are precompiled (`Template#compile`'s `module_eval`)

Moved to [packages/actionview/CLAUDE.md](packages/actionview/CLAUDE.md#templates-are-precompiled-templatecompiles-module_eval); unchanged, heading kept for citations.
