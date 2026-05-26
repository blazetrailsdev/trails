# trailties: commander → Thor port

## Why

Early on, `packages/trailties` was wired up with [`commander`](https://www.npmjs.com/package/commander) so a `trails` binary could exist quickly. Rails uses [Thor](https://github.com/rails/thor) — `Rails::Command::Base` (in `railties/lib/rails/command/base.rb`) is a thin wrapper over `Thor::Group`, and every `bin/rails <command>` resolves to a Thor command class.

Project ethos is Rails-source fidelity (see [CLAUDE.md](../../CLAUDE.md)). `commander` diverges from Thor's surface — different option DSL, different help formatting, different subcommand routing — and `api:compare` will flag every Thor method that doesn't exist on our side. Since nothing depends on trailties' CLI today, there's no back-compat cost to switching.

## Scope

Thor `v1.3.2` (Rails' pinned version per `Gemfile.lock`) is 6,275 LOC in `lib/`, 7,122 LOC in `spec/`, 448 `def`s, 912 specs — comparable to `arel` (~6.5K LOC, ~820 privates), which we ported in full across ~25 PRs over roughly four months. A hand-rolled "minimal shim" would under-cover the surface `Rails::Command::Base` and the generators rely on, and drift would be invisible without grading. So: vendor Thor as a real package and grade it the same way as every other Rails-mirroring package.

Two layers:

1. **`@blazetrails/thor`** — a new package mirroring `rails/thor`. Full port over time, wired into `api:compare` and `test:compare` from day one so coverage is graded continuously. Surface: `Thor`, `Thor.Group`, options DSL (`classOption`, `argument`, `methodOption`), subcommand dispatch, `Thor.Shell` (`say`, `sayStatus`, `ask`, `isYes`), actions (`createFile`, `template`, `insertIntoFile`), and `--help` rendering.

2. **`Rails::Command::Base` port** in `trailties/src/command/base.ts`, mirroring `railties/lib/rails/command/base.rb`. Per-command files (db, generate, server, …) extend it. Already in trailties' api:compare scope via `vendor/sources.ts`.

### Definition of done

Two independent bars, achievable on different timelines:

1. **CLI-functional (Track B done):** every commander importer in `trailties/src/` is gone, `commander` is removed from `trailties/package.json`, and the `trails` binary behaves identically to before. `Rails::Command::Base` and the per-command files needed by `bin/trails` are ported. Thor coverage at this point is whatever Track A has reached — possibly well under 100%.
2. **Parity-complete (Track A done):** `@blazetrails/thor` reaches 100% on `pnpm run api:compare --package thor` and ≥95% on `pnpm run test:compare --package thor`, modulo the carve-out list. This is the same bar arel and activemodel cleared.

Bar (1) unblocks the rest of trails (we get rid of the commander divergence). Bar (2) is the long campaign — useful but not blocking on anything downstream.

### Naming policy (TS vs Ruby namespaces)

In Ruby, `Thor` is itself a top-level class (you write `class MyCli < Thor`), with nested classes `Thor::Command`, `Thor::Base`, `Thor::Group`, `Thor::Error`, `Thor::Actions`, `Thor::Shell::Basic`. The TS pattern that mirrors this shape — and that the rest of the codebase already uses (see `Naming`, `SecurePassword`, `Configurable`, `NumberHelper`) — is **`class X` + `export namespace X`** declaration merging:

```ts
// packages/thor/src/thor.ts
export class Thor {
  /* class-level methods Rails::Command::Base inherits */
}
export namespace Thor {
  export class Base {
    /* ... */
  }
  export class Command {
    /* ... */
  }
  export class Group {
    /* ... */
  }
  export class Error extends globalThis.Error {
    /* ... */
  }
  export namespace Actions {
    export class CreateFile {
      /* ... */
    }
  }
  export namespace Shell {
    export class Basic {
      /* ... */
    }
  }
}
```

Call sites read `Thor.Group`, `Thor.Actions.CreateFile`, `Thor.Error` — direct transliteration of `Thor::Group`, `Thor::Actions::CreateFile`, `Thor::Error`. api:compare's class-name matching works on `Thor.X` exactly the way it works on `ActiveModel.Naming` today.

Rules for trailties consumption:

- Trailties imports Thor names explicitly: `import { Thor } from "@blazetrails/thor"` → `class Base extends Thor.Group`. No re-exports from trailties.
- Rails' own names stay in trailties unprefixed at the package level (`Command`, `Generators.Base`) so the `Rails::*` ↔ trailties mapping in `vendor/sources.ts` stays clean.

### Package layout

```
packages/thor/
  package.json            # @blazetrails/thor — deps: @blazetrails/activesupport, @blazetrails/tse-compiler
  tsconfig.json
  src/
    thor.ts               # class Thor + namespace Thor (re-exports nested)
    base.ts               # Thor.Base — file mirror of lib/thor/base.rb
    command.ts            # Thor.Command — lib/thor/command.rb
    group.ts              # Thor.Group — lib/thor/group.rb
    error.ts              # Thor.Error — lib/thor/error.rb
    invocation.ts         # Thor.Invocation — lib/thor/invocation.rb
    nested-context.ts     # lib/thor/nested_context.rb
    util.ts               # Thor.Util — lib/thor/util.rb
    version.ts            # Thor.VERSION
    parser/
      argument.ts         # lib/thor/parser/argument.rb
      arguments.ts
      option.ts
      options.ts
      index.ts            # lib/thor/parser.rb (re-exports)
    actions.ts            # Thor.Actions module — lib/thor/actions.rb
    actions/
      empty-directory.ts  # lib/thor/actions/empty_directory.rb
      create-file.ts
      create-link.ts
      directory.ts
      file-manipulation.ts
      inject-into-file.ts
    shell.ts              # Thor.Shell — lib/thor/shell.rb
    shell/
      basic.ts            # lib/thor/shell/basic.rb
      color.ts            # lib/thor/shell/color.rb
    index.ts              # public barrel: re-exports class Thor
  README.md
```

Filenames are `snake_case.rb → kebab-case.ts` per the project convention (matches `active_support/hash_with_indifferent_access.rb` → `packages/activesupport/src/hash-with-indifferent-access.ts` — the project flattens Rails' `core_ext/` subdirectory). Carve-outs (`runner.ts`, `rake-compat.ts`, `line-editor/*`, `shell/html.ts`, `shell/lcs-diff.ts`, `shell/{column,table,wrapped}-printer.ts`, `shell/terminal.ts`, `core-ext/hash-with-indifferent-access.ts`) do **not** get TS files — their absence is what api:compare reads via the unported list.

### Known risks

Three places this campaign has historically been hardest in Thor's Ruby world; each needs to be flagged in the relevant Track A PR rather than discovered at review time:

1. **Options DSL → TS literal types.** Thor's `class_option :format, type: :string, enum: %w[html json]` carries no compile-time type — the consumer reads `options[:format]` as `String`. Mirroring this in TS without losing the enum narrowing is the single hardest design call. Likely landing: a `classOption<T extends OptionSchema>(...)` builder that threads the enum into a literal union, with a `this.options` getter typed from the accumulated schema. Plan to spike this in PR 2 before committing the API shape.
2. **`actions/inject_into_file` regex semantics.** Rails' generators rely on exact behavior of `gsub_file`, `insert_into_file`, `before:` / `after:` anchors. The Ruby code uses `String#gsub` with regex anchors that have subtle JS regex differences (lookbehind, multiline mode defaults). Each `inject_into_file` spec needs cross-referenced against Rails generator usage — small per-file variance is the rule, not the exception.
3. **`--help` output is character-exact in many specs.** Thor's spec suite asserts whitespace, line-wrapping, and color codes in help output. The wrapped/column/table printers (currently in carve-outs) drive this. If Rails generator specs we run via test:compare fail because help output drifts, the printers come out of carve-outs and into Track A. Possible scope expansion.

## Carve-outs (unported on day one)

Rails' command + generator code reaches for: `Thor::Group`, `Thor::Actions`, `Thor::Actions::CreateFile`, `Thor::Error`, `Thor::Util.ruby_command`, `Thor::Base.shell`, `Thor::Shell::Basic`. Nothing else. The following pieces are real Thor surface that **Rails doesn't touch** and that we don't need for the trails CLI — mark them as permanently excluded in `scripts/api-compare/unported-files.ts` (see the snippet later in this section) so api:compare / test:compare don't grade them as gaps:

| File(s)                                                                                                                  | Why excluded                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thor/runner.rb`                                                                                                         | Multi-script CLI runner (`thor list`, `thor install <url>`). Rails never instantiates `Thor::Runner` — `bin/rails` is its own entry point. Pure user-of-Thor-as-end-user-tool surface.                                                                                                                |
| `thor/rake_compat.rb`                                                                                                    | Lets a Rakefile use Thor's DSL. Not on Rails::Command path. Autoloaded but never required by Rails.                                                                                                                                                                                                   |
| `thor/line_editor.rb`, `thor/line_editor/basic.rb`, `thor/line_editor/readline.rb`                                       | Readline-based `ask` / `yes?` enhancement. Node has `node:readline` natively. Confirmed by grepping Rails' `railties/lib/rails/command` and `railties/lib/rails/generators` for `.ask` / `.yes?` call sites — zero hits. Safe to defer; if a future Rails generator we port needs prompting, revisit. |
| `thor/shell/html.rb`                                                                                                     | HTML-formatted shell output (for web UIs that embed Thor output). Zero Rails usage.                                                                                                                                                                                                                   |
| `thor/core_ext/hash_with_indifferent_access.rb`                                                                          | Ruby-only ergonomic — TS object indexing already accepts string keys. Used internally by `parser/options.rb` to expose parsed options indifferently; we substitute a plain `Record<string, unknown>` at the parser boundary.                                                                          |
| `thor/shell/lcs_diff.rb`                                                                                                 | Diff display for `actions/inject_into_file` conflict prompts (`Overwrite? [Yndaqh]`). Defer — show a plain "would overwrite" message in v1, port LCS later if generators feel rough.                                                                                                                  |
| `thor/shell/column_printer.rb`, `thor/shell/table_printer.rb`, `thor/shell/wrapped_printer.rb`, `thor/shell/terminal.rb` | Pretty-printing helpers for `say_status` / multi-column command listings. Trim to the minimum `say` / `sayStatus` needed by generators; add the printers back only if a Rails generator's output looks wrong.                                                                                         |

Measured against Thor v1.3.2: carved files total **789 LOC** (excluding the four printer/terminal files, ~227 LOC, which are provisional and re-evaluated after `Shell::Basic` lands) and **70 specs** by name. Thor's "ported scope" shrinks from 6,275 / 912 specs to roughly 5,486 / 842 specs — about 87% of LOC and 92% of specs remain in scope.

Carve-outs land in `scripts/api-compare/unported-files.ts` — **not** in `vendor/sources.ts`. The two files have separate concerns: `vendor/sources.ts` says what to fetch, `unported-files.ts` says what to ignore once fetched. Each carve-out is one entry shaped per that file's existing schema (`pattern`, `testFile`, `package`, `reason`):

```ts
// scripts/api-compare/unported-files.ts — append to UNPORTED_FILES
{
  pattern: "thor/runner.rb",
  testFile: "runner_spec.rb",
  package: "thor",
  reason:
    "Multi-script CLI runner (`thor list`, `thor install <url>`). Rails " +
    "never instantiates Thor::Runner — bin/rails is its own entry point.",
},
{
  pattern: "thor/rake_compat.rb",
  testFile: "rake_compat_spec.rb",
  package: "thor",
  reason: "Rakefile DSL bridge; not on Rails::Command path.",
},
// ... one block per carve-out row in the table above.
```

`package: "thor"` scopes the substring match so a future package with a colliding basename can't accidentally inherit the exclusion. The schema is documented at the top of `scripts/api-compare/unported-files.ts`. Re-evaluate the list annually — every entry should still pass the "does Rails actually reach for this?" test.

## Migration plan

Sized so each PR fits the 300 LOC ceiling and is independently mergeable. Two tracks run in parallel after the bootstrap PRs.

### Bootstrap

1. **PR 1 — vendor Thor + scaffold package.** Add `rails/thor` to `vendor/sources.ts` (pinned ref), scaffold `packages/thor/` with `package.json`, `tsconfig.json`, src tree mirroring `lib/thor/`. Wire into `api:compare` and `test:compare`. No real implementation yet — every method is a stub so the baseline grading report exists. ~250 LOC of scaffolding.
2. **PR 2 — Thor core (parser + base).** `Thor.Base`, `Thor.Command`, option parser. Smallest viable surface to define and dispatch one method-command. Tests ported from `spec/base_spec.rb`, `spec/parser/*_spec.rb` (a slice — full coverage comes incrementally). **Concrete acceptance criterion:** this code compiles, dispatches, and passes its spec slice end-to-end:

   ```ts
   class Hello extends Thor {
     static {
       this.desc("say NAME", "say hello to NAME");
       this.methodOption("loud", { type: "boolean", default: false });
     }
     say(name: string): void {
       const greeting = this.options.loud ? `HELLO ${name.toUpperCase()}` : `hello ${name}`;
       this.shell.say(greeting);
     }
   }
   Hello.start(["say", "world", "--loud"]); // → "HELLO WORLD"
   ```

   If this snippet doesn't work at PR 2 merge, the API shape is wrong and the PR doesn't merge. Forces the options-DSL design call (see Known Risks) into PR 2 rather than letting it drift into Track A.

3. **PR 3 — `Thor::Group` + `Thor::Shell`.** What `Rails::Command::Base` actually extends, plus the IO surface generators use.
4. **PR 4 — `Rails::Command::Base` + pilot command.** Port `command/base.rb` in trailties, migrate `version` off commander as the end-to-end pilot.

### Parallel tracks after PR 4

- **Track A — Thor coverage** (`@blazetrails/thor` toward 100% on api:compare and test:compare). Sized in ~250 LOC PRs the same way as arel/activemodel. **Estimated 15–20 PRs over roughly 3 months at one-engineer-half-time cadence**, anchored to the arel campaign's actual pace (25 PRs / 4 months for a similarly-sized package). Rough breakdown:

  | Cluster                 | PRs | Surface                                                                                         |
  | ----------------------- | --- | ----------------------------------------------------------------------------------------------- |
  | Parser (options + args) | 4   | `Thor.Parser.{Argument,Arguments,Option,Options}`                                               |
  | Group + invocation      | 3   | `Thor.Group`, `Thor.Invocation`, `Thor.NestedContext`                                           |
  | Actions family          | 4   | `Thor.Actions.{EmptyDirectory,CreateFile,CreateLink,Directory,FileManipulation,InjectIntoFile}` |
  | Shell                   | 2   | `Thor.Shell.{Basic,Color}`                                                                      |
  | Help formatting + edges | 2–4 | `--help` rendering, `Util`, error handling                                                      |
  | test:compare backfill   | 2   | Spec gaps grepped from `pnpm run test:compare --package thor`                                   |

  Track B can start after Bootstrap PR 4 and proceed in parallel — it doesn't wait for Track A to hit 100%.

- **Track B — command migrations** (commander → `Rails::Command::Base`). One Rails source file per PR where possible; bundle the tiniest (e.g. `version`, `notes`, `routes`) up to the LOC budget. Each PR deletes its `import { Command } from "commander"`.

Current commander importers (16 files): `cli.ts`, `commands/{app,console,credentials,db,destroy,encrypted,generate,new,notes,routes,server,stats}.ts`, plus a few helpers. Roughly 3–5 Track B PRs depending on bundling.

### Bail-out plan

Track A is a multi-month campaign. If it stalls (rewrite priorities change, contributor capacity disappears, a Thor design call turns out to be wrong), the project does **not** end up with a half-ported library blocking trails users. Concrete fallback states, ordered by severity:

1. **Track A pauses, Track B done.** `bin/trails` works end-to-end on whatever Thor surface has landed. `commander` is gone from trailties. `pnpm run api:compare --package thor` shows a real-but-incomplete score (e.g. 60–70%). This is a fine resting state — no worse than `arel` looked at month 2 of its campaign.
2. **Track A pauses, Track B partially done.** Some commands have migrated, others still import `commander`. Both libraries coexist. Ugly but functional. Don't remove `commander` from `package.json` until the last import is gone — the doc's "cleanup signal" gate prevents accidentally bricking the CLI.
3. **Thor design decision in PR 2 / 3 turns out to be wrong** (e.g. the options DSL spike doesn't produce a clean TS shape). Revert just that PR, re-spike. The bootstrap PRs are deliberately small + sequential so a bad call is one PR to back out, not a whole package.
4. **Project decides not to finish Thor at all.** Mark `@blazetrails/thor` as `compareApi: false` and `compareTests: false` in `vendor/sources.ts` — these flags exist on the `PackageEntry` type for exactly this case (see the type definition at the top of `vendor/sources.ts`; the inline comments reference `rack` / `globalid` as the intended use cases, though neither currently sets them). The package stops grading; the surface that's there stays in use. trailties continues consuming what exists.

None of these states require destructive rollback. The campaign is "uphill but exit-able at any step."

### Cleanup

- Remove `commander` from `trailties/package.json` once the last import is gone. Verify with `grep -rn commander packages/trailties/src` → empty.

## Grading integration (api:compare, test:compare)

**trailties** is already wired in via `vendor/sources.ts` (`name: "trailties", libPath: "railties/lib/rails"`). `Rails::Command::Base` and every `Rails::Command::*Command` already appear in the manifest, and `railties/test/commands/*_test.rb` is already in test:compare scope — they'll fill in as Track B lands.

**Thor** gets a new top-level entry in `vendor/sources.ts`, appended to the existing `sources` array (after the `rack` and `globalid` entries — Thor stands alone like they do, not nested inside the Rails monorepo entry):

```ts
{
  name: "thor",
  origin: {
    type: "git",
    url: "https://github.com/rails/thor.git",
    ref: "v1.3.2", // matches Rails Gemfile.lock — bump in lockstep
  },
  packages: [{ name: "thor", libPath: "lib/thor", testPath: "spec" }],
},
```

Whenever the Rails ref in `vendor/sources.ts` bumps, re-check `Gemfile.lock` and bump Thor's `ref` to match. Drift detection here would be a future CI check.

## Dependencies

Thor's gemspec has **zero runtime gem deps** (dev-only `bundler`). Stdlib reaches:

| Ruby require                                                            | Purpose                                        | TS source (must use)                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pathname`                                                              | path manipulation                              | `getPath()` from `@blazetrails/activesupport/fs-adapter`                                                                                     |
| File I/O (`File.read`, `FileUtils.mkdir_p`, …)                          | `actions/*`                                    | `getFs()` from `@blazetrails/activesupport/fs-adapter`                                                                                       |
| `digest/sha2`                                                           | content hash in `actions/create_file`          | `node:crypto` (no activesupport wrapper today; acceptable as a pure-leaf stdlib import)                                                      |
| `rbconfig`, `$PROGRAM_NAME`, `ARGV`, `STDOUT`/`STDERR`, `Kernel#system` | platform / process                             | `platform()`, `argv`, `stdout`/`stderr`, and `getChildProcess()` from `@blazetrails/activesupport/process-adapter` + `child-process-adapter` |
| `rake` / `rake/dsl_definition`                                          | `Thor::RakeCompat` only                        | unported (see carve-outs above)                                                                                                              |
| `erb`                                                                   | `actions/template`, `actions/inject_into_file` | `@blazetrails/tse-compiler` (see [tse-plan.md](tse-plan.md))                                                                                 |

**Hard rule: `@blazetrails/thor` must not import `node:fs`, `node:fs/promises`, `node:path`, `node:process`, or `node:child_process` directly.** Activesupport's adapter layer is the project's portability seam — it's what lets activerecord run in the browser sandbox, what lets the test suite swap in a memfs, and what `bin/trails` future-proofs against Bun/Deno. Thor is a CLI-only package today, but the same discipline applies: every other Rails-mirroring package routes through these adapters.

Enforcement note: `scripts/api-compare/lint-deps.ts` only checks cross-`@blazetrails/*` workspace imports — it does **not** lint Node builtin imports today. Until an ESLint rule (or a `lint-builtins.ts` companion) is added to the lint surface, this rule is **policy enforced at review time**. A bootstrap-track sub-PR can wire up the lint as soon as a Rails-mirroring package needs it — Thor will be the first.

ERB pipeline is already solved: `@blazetrails/tse-compiler`'s compiler-only entry point (`compileJs(source) → { code, localsSignature, typesAnnotation }`) is exactly the surface `actions/template` needs. Thor's `actions/template` consumes `code` and ignores the `*Annotation` fields (TSE's typecheck artifacts are TS-tooling concerns, not relevant to a generator that wants `eval`-and-write). We use it with a stripped-down `RenderContext` (just `outputBuffer`, no view helpers) — no separate ERB renderer required.

Workspace deps of `@blazetrails/thor`: `@blazetrails/activesupport` (fs / process / child-process adapters, `SafeString`) and `@blazetrails/tse-compiler` (ERB). Nothing else.

## CI

Follow the per-package gate pattern already established for `trailties`, `trails-tsc`, and `tse-compiler` in `.github/workflows/ci.yml`. Concrete diff against the `changes` job and its consumers:

```yaml
# changes.outputs
+     thor_affected: ${{ steps.filter.outputs.thor_affected }}

# inside the filter step
+     # thor_affected gates thor-tests. Thor's workspace deps are
+     # activesupport (fs / process adapters) and tse-compiler (ERB),
+     # so changes in either of them also flip thor_affected.
+     THOR_PKGS_RE='^packages/(thor|activesupport|tse-compiler)/'
-     TRAILTIES_PKGS_RE='^packages/(trailties|actionpack|actionview|activerecord|arel|activemodel|activesupport|globalid|rack|did-you-mean|trails-tsc)/'
+     TRAILTIES_PKGS_RE='^packages/(trailties|thor|actionpack|actionview|activerecord|arel|activemodel|activesupport|globalid|rack|did-you-mean|trails-tsc)/'

# inside force_all_affected()
+     echo "thor_affected=true"         >> "$GITHUB_OUTPUT"

# inside set_gate calls
+     set_gate thor_affected         "$THOR_PKGS_RE"

# new job, modeled on trailties-tests
+ thor-tests:
+   name: Thor Tests
+   needs: changes
+   if: >-
+     needs.changes.outputs.docs_only != 'true' &&
+     needs.changes.outputs.thor_affected == 'true'
+   runs-on: ${{ vars.RUNNER || 'ubuntu-latest' }}
+   timeout-minutes: 15
+   steps:
+     - uses: actions/checkout@v4
+     - uses: ./.github/actions/setup-pnpm
+     - run: pnpm install --frozen-lockfile
+     - run: pnpm --filter @blazetrails/thor test
```

Net effect: a Thor-only PR runs `thor-tests` + `trailties-tests` (since trailties consumes Thor at runtime) and skips activerecord/actionpack/actionview/parity. A non-Thor PR doesn't build or test Thor at all.

## Tracking

- Thor coverage: `pnpm run api:compare --package thor` and `pnpm run test:compare --package thor`.
- Rails::Command coverage: `pnpm run api:compare --package trailties` and `pnpm run test:compare --package trailties` (`commands/*_test.rb`).
- Cleanup signal: `grep -rn "from \"commander\"" packages/trailties/src` → zero, then `commander` removed from `package.json`.
