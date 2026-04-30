# trailties build-out plan

Implementer guide for porting Rails `railties` to `@blazetrails/trailties`.

This doc tells you what to build, in what order, with what dependencies,
and answers the design decisions you would otherwise have to ask about.
Open the PR whose dependencies are met; do not deviate from the answers
below without proposing a plan-doc change first.

## Repo state at plan start

- Existing trailties: CLI shell only — `commands/`, `generators/`,
  `server/`, `database.ts`, `migration-loader.ts`, `schema-source.ts`.
- `pnpm tsx scripts/api-compare/compare.ts --package trailties` baseline:
  **2/1076 methods (0.2%)** public-only (2/1560 with privates), **1/134 files**.
  (`pnpm api:compare` is a chained script — args don't reach `compare.ts`.)
- Existing matches: one method in `generators/actions.ts`, one in
  `generators/base.ts`. Everything else is greenfield.
- Actionpack: `MiddlewareStack` exists and is solid. `mount` for engines
  is **missing** (Phase 1.5 prerequisite).
- Activesupport: `Concern`, `Configurable`, `Callbacks`, `Notifications`,
  `BacktraceCleaner`, `EventedFileUpdateChecker`, `EncryptedConfiguration`,
  `EncryptedFile`, `EnvironmentInquirer`, `fsAdapter`, `osAdapter`,
  `childProcessAdapter`, `cryptoAdapter` all exist.

## Hard rules

1. **No `node:*` imports** in `packages/trailties/src/` except `bin.ts`.
   Repository rule; enforce locally with
   `! grep -r 'from "node:' packages/trailties/src/ | grep -v bin.ts`.
2. **No `process.*` references** in `packages/trailties/src/` after PR 0.3.
   Enforced by ESLint via `blazetrails/no-process-bypass`.
3. **Trailties code uses async fs only.** `fsAdapter` exposes both
   sync and async surfaces; trailties imports only the async ones
   (`exists`, `mkdtemp`, etc.) and `await`s every call.
4. **No new third-party runtime deps in trailties.** `commander` and
   `vite` (behind `./vite` export only) are the only non-workspace deps.
5. **PR size ceiling: 300 LOC** (CLAUDE.md). Splits are pre-planned per PR
   below using the `<base>` / `<base>b` pattern.
6. **Test names match Rails verbatim** where Rails has tests (CLAUDE.md).
7. **Every PR description** lists Rails source files referenced and which
   methods/initializers were intentionally skipped.

## Decisions already made

Implementers do not relitigate these. Propose a plan-doc change if you
think one is wrong.

### Naming

- Package: `trailties`. Base class: `Trailtie`. Per-framework files:
  `<package>/src/trailtie.ts`. Engine collection: `engine/trailties.ts`.
- Rails source paths in this doc keep upstream Ruby names — they point at
  real files in the Rails repo.
- `api:compare` rename map handles the conversion (PR 2.1 wires it).

### What we are NOT building

| Skipped                                                                                                                                                                                 | Why                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Zeitwerk-equivalent autoloader, `zeitwerk_checker.rb`                                                                                                                                   | ESM solves it                                 |
| Eager loading (`:eager_load!`, `Paths.eager_load`, `eager_load_paths`, `:set_eager_load_paths`)                                                                                         | Bundlers + user-owned index files             |
| YAML config, `yaml` dep                                                                                                                                                                 | TS/JS config modules                          |
| `bin/rails test` + entire `test_unit/` subsystem                                                                                                                                        | Vitest + other test libs; separate plan       |
| `Engine#isolate_namespace`                                                                                                                                                              | Replaced by explicit `tableNamePrefix` config |
| `Rails::Plugin` builder + `generators/rails/plugin/*`                                                                                                                                   | Rails-internal back-compat                    |
| `Rails::Secrets` / `Rails.application.secrets`                                                                                                                                          | Pre-credentials Rails back-compat             |
| `:set_load_path`, `:set_autoload_paths`, `:initialize_dependency_mechanism`, `:load_environment_hook`, `:ensure_autoload_once_paths_as_subset_of_autoload_paths`, `_all_autoload_paths` | Autoload/eager-load-only / pre-Rails-4        |
| `Rails::Command` framework rewrite                                                                                                                                                      | `commander` is sufficient                     |
| `MailersController` + `generators/erb/mailer/*` + `generators/test_unit/mailer/*`                                                                                                       | Blocked on `actionmailer` package             |
| `generators/erb/*` (other than mailer)                                                                                                                                                  | Defer to a render-engine PR                   |

### Architectural answers

| Question                                                 | Answer                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Templates: ERB or EJS?                                   | EJS. `api:compare`'s `.erb` → `.ejs` mapping handles paths.                                                                                                       |
| `Trailtie` subclass registration                         | Explicit: `Trailtie.register(MyTrailtie)`. No `inherited` hook.                                                                                                   |
| `config_for` config format                               | TS/JS modules via dynamic `import()`. No YAML.                                                                                                                    |
| Glob pattern dialect                                     | Node/picomatch-style: `**`, `*`, `?`, `[...]`, `{a,b}`, `!`. Not Ruby parity.                                                                                     |
| `processAdapter` `env` mutation                          | Snapshot values are read-only by convention (typed `Readonly`, null-prototype object). `setEnv` is the only supported mutation path; rare.                        |
| `processAdapter` exports use `Proxy`?                    | No. Plain copied snapshot objects on `registerProcessAdapter`; no runtime `Object.freeze`.                                                                        |
| `WriteStream` `isTTY`/`columns`/`rows`                   | Snapshot at register time. No resize event.                                                                                                                       |
| Test runner integration                                  | Out of scope — Vitest, separate plan.                                                                                                                             |
| User code STI subclass / `Concern.included` registration | User app maintains a central index file (e.g. `app/models/index.ts`). Future tooling in `trails-tsc` will auto-manage these.                                      |
| `Engine` namespacing replacement                         | Explicit `tableNamePrefix` config option. Module/helper namespacing handled by where the user imports from.                                                       |
| `Rails.logger` before init                               | Returns a no-op default logger.                                                                                                                                   |
| Activesupport `Trailtie` file location                   | Likely **inside trailties** (`packages/trailties/src/trailties/active-support.ts`) to avoid inverting the trailties → activesupport dependency. PR 2.7a confirms. |

### Per-PR universal acceptance

Every PR must pass:

- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint` clean
  (lint includes `blazetrails/no-process-bypass` for rule 2).
- Rails-mirrored tests added where Rails has tests; verbatim names.
- PR description lists Rails sources kept/skipped per rule 7.

### Decisions still open

These are the only open items. Each is scoped to a specific PR.

| #   | Question                                                                                                                               | Decide before |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | If `activesupport`'s `Concern` doesn't support class-side property assignment, do we factor a static-state helper or change `Concern`? | PR 1.2 spike  |
| 2   | Where does the activesupport `Trailtie` live (in trailties subdir vs activesupport itself)?                                            | PR 2.7a       |
| 3   | What does `Rails.version` return — trailties `package.json` version or tracked Rails upstream version?                                 | PR 2.6        |
| 4   | Does activesupport already have a no-op logger primitive, or do we add one?                                                            | PR 2.3        |

---

## Phase 1 — Leaves

PR 1.1 and 1.2 land first; the rest can land in parallel.

### PR 1.1 — `Paths` (~250 LOC)

**Blocks:** PR 2.2, generators that walk paths.
**Blocked by:** PR 0.2.

**New files:**

- `packages/trailties/src/paths.ts`
- `packages/trailties/src/paths.test.ts`

**Rails source:** `railties/lib/rails/paths.rb` — `Paths::Root`, `Paths::Path`, `add`, `load_paths`, `existent`, `existent_directories`, `glob:`, `with:`, `expanded`. **Skip** `eager_load!`, `autoload_paths`, `autoload_once`.

**Surface:**

```ts
export class Root {
  add(path: string, options?: PathOptions): Path;
  get(path: string): Path | undefined;
  all_paths(): Path[];
  load_paths(): Promise<string[]>;
}
export class Path {
  to(path: string, options?: PathOptions): Path;
  existent(): Promise<string[]>;
  existent_directories(): Promise<string[]>;
  expanded(): Promise<string[]>;
  // flags: load_path?, glob
}
```

### PR 1.2 — `Initializable` (~200 LOC)

**Blocks:** PR 2.1.
**Blocked by:** none (independent of PR 1.1).

**New files:**

- `packages/trailties/src/initializable.ts`
- `packages/trailties/src/initializable.test.ts`

**Rails source:** `railties/lib/rails/initializable.rb` — `Initializer`, `Collection`, `tsort_each_node`, `tsort_each_child`, `run_initializers`, class-level `initializer` macro, `initializers`, inheritance merging.

In-tree topo sort (Kahn's). Inheritance merge uses activesupport's `Concern`.

**First commit:** spike — verify `Concern` supports class-side property
assignment via `Object.defineProperty` on the subclass. If not, factor a
static-state helper before main work. Resolves open question #1.

### PR 1.3 — Rails `BacktraceCleaner` silencer set (~80 LOC)

**Blocked by:** none.

**New files:**

- `packages/trailties/src/backtrace-cleaner.ts`
- `packages/trailties/src/backtrace-cleaner.test.ts`

**Rails source:** `railties/lib/rails/backtrace_cleaner.rb` — `APP_DIRS_PATTERN`, `RENDER_TEMPLATE_PATTERN`, `EMPTY_RE`, gem-path filter. Builds on activesupport's existing `BacktraceCleaner`.

### PR 1.4 — `SourceAnnotationExtractor` + `rails notes` (~200 LOC)

**Blocked by:** PR 0.2.

**New files:**

- `packages/trailties/src/source-annotation-extractor.ts`
- `packages/trailties/src/source-annotation-extractor.test.ts`
- `packages/trailties/src/commands/notes.ts`
- `packages/trailties/src/commands/notes.test.ts`

**Files changed:** `packages/trailties/src/cli.ts` (register `notes`).

**Rails source:** `railties/lib/rails/source_annotation_extractor.rb`, `railties/lib/rails/tasks/annotations.rake`.

### PR 1.5 — `CodeStatistics` + `rails stats` (~250 LOC)

**Blocked by:** PR 0.2.

**New files:**

- `packages/trailties/src/code-statistics.ts`
- `packages/trailties/src/code-statistics-calculator.ts`
- `packages/trailties/src/code-statistics.test.ts`
- `packages/trailties/src/commands/stats.ts`
- `packages/trailties/src/commands/stats.test.ts`

**Files changed:** `packages/trailties/src/cli.ts` (register `stats`).

**Rails source:** `railties/lib/rails/code_statistics.rb`, `railties/lib/rails/code_statistics_calculator.rb`, `railties/lib/rails/tasks/statistics.rake`.

TS regex equivalents for the Ruby method/class patterns: `function` decls, arrow assignments, `class X { method() {} }`, `get`/`set` accessors.

### PR 1.6 — `Credentials` + `Encrypted` commands (~250 LOC)

**Blocked by:** none.

**New files:**

- `packages/trailties/src/commands/credentials.ts`
- `packages/trailties/src/commands/credentials.test.ts`
- `packages/trailties/src/commands/encrypted.ts`
- `packages/trailties/src/commands/encrypted.test.ts`

**Files changed:** `packages/trailties/src/cli.ts`.

**Rails source:** `railties/lib/rails/application.rb#credentials`, `#encrypted`; `railties/lib/rails/commands/credentials/credentials_command.rb`; `railties/lib/rails/commands/encrypted/encrypted_command.rb`. **Skip** `Rails::Secrets`.

Wraps activesupport's `EncryptedFile` and `EncryptedConfiguration`. `credentials:edit` shells out to `$EDITOR` via `childProcessAdapter`; in browser hosts the no-op spawn rejects with a clear message.

### PR 1.7 — `Info` and `InfoController` (~200 LOC)

**Blocked by:** actionpack `ActionController::Base` (already exists).

**New files:**

- `packages/trailties/src/info.ts`
- `packages/trailties/src/info.test.ts`
- `packages/trailties/src/info-controller.ts`
- `packages/trailties/src/info-controller.test.ts`
- `packages/trailties/src/templates/rails/info/properties.ejs`
- `packages/trailties/src/templates/rails/info/routes.ejs`

**Rails source:** `railties/lib/rails/info.rb`, `railties/lib/rails/info_controller.rb`, `railties/lib/rails/templates/rails/info/{properties,routes}.html.erb`.

### PR 1.8 — `HealthController` (~80 LOC)

**Blocked by:** actionpack (already exists).

**New files:**

- `packages/trailties/src/health-controller.ts`
- `packages/trailties/src/health-controller.test.ts`
- `packages/trailties/src/templates/rails/health/index.ejs`

**Rails source:** `railties/lib/rails/health_controller.rb`, `railties/lib/rails/templates/rails/health/index.html.erb`.

### PR 1.8b — `PWAController` (~80 LOC)

**Blocked by:** actionpack (already exists).

**New files:**

- `packages/trailties/src/pwa-controller.ts`
- `packages/trailties/src/pwa-controller.test.ts`

**Rails source:** `railties/lib/rails/pwa_controller.rb`.

### PR 1.9 — `WelcomeController` (~80 LOC)

**Blocked by:** actionpack (already exists).

**New files:**

- `packages/trailties/src/welcome-controller.ts`
- `packages/trailties/src/welcome-controller.test.ts`
- `packages/trailties/src/templates/rails/welcome/index.ejs`

**Rails source:** `railties/lib/rails/welcome_controller.rb`, `railties/lib/rails/templates/rails/welcome/index.html.erb`.

### PR 1.10 — App template DSL (~300 LOC; split if over)

**Blocked by:** none.

**New files:**

- `packages/trailties/src/generators/actions.ts`
- `packages/trailties/src/generators/actions.test.ts`
- `packages/trailties/src/commands/app.ts`
- `packages/trailties/src/commands/app.test.ts`

**Files changed:** `packages/trailties/src/generators/base.ts` (mix in `Actions`); `packages/trailties/src/cli.ts` (register `app`).

**Rails source:** `railties/lib/rails/generators/app_base.rb`, `railties/lib/rails/generators/actions.rb`, `railties/lib/rails/commands/app/app_command.rb`.

**Split if needed:**

- **1.10** — `gem`, `route`, `environment`, `generate` + smoke
- **1.10b** — `git`, `after_bundle`, `rake`, `add_source` + full tests

### PR 1.11 — Rails-specific Rack middleware (~150 LOC)

**Blocked by:** none. Uses `@blazetrails/rack`, not actionpack.

**New files:**

- `packages/trailties/src/rack/logger.ts`
- `packages/trailties/src/rack/logger.test.ts`
- `packages/trailties/src/rack/silence-request.ts`
- `packages/trailties/src/rack/silence-request.test.ts`

**Rails source:** `railties/lib/rails/rack/logger.rb`, `railties/lib/rails/rack/silence_request.rb`.

### PR 1.12 — Generator infrastructure reconciliation (~600 LOC, split)

**Blocked by:** none.

Existing trailties generators were built without the Rails generator base
classes. This PR ports the missing infrastructure and refactors existing
generators to extend it. **Refactor existing, don't keep parallel impls.**

**Rails source:**

- `railties/lib/rails/generators/base.rb` (already partial; reconcile)
- `railties/lib/rails/generators/named_base.rb`
- `railties/lib/rails/generators/migration.rb`
- `railties/lib/rails/generators/app_base.rb`
- `railties/lib/rails/generators/database.rb`
- `railties/lib/rails/generators/active_model.rb`
- `railties/lib/rails/generators/generated_attribute.rb`
- `railties/lib/rails/generators/model_helpers.rb`
- `railties/lib/rails/generators/resource_helpers.rb`
- `railties/lib/rails/generators/actions/create_migration.rb`

**Split:**

- **1.12** (~200) — `Base` reconciliation + `NamedBase` + `GeneratedAttribute`
- **1.12b** (~200) — `Migration` + `actions/create_migration` + `model_helpers` + `resource_helpers` + `active_model`
- **1.12c** (~200) — `app_base` + `database` + refactor existing `app-generator.ts` etc. to extend the new bases

### PR 1.14 — Rails-shipped generator subtypes (~800 LOC, split)

**Blocked by:** PR 1.12 (b for the model/resource set), PR 1.6 (a for credentials/master_key).

**Rails source (kept):** all `railties/lib/rails/generators/rails/*` except `plugin/`.

**Split:**

- **1.14a** — credentials, master_key, encrypted_file, encryption_key_file (depends on PR 1.6)
- **1.14b** — helper, migration, model, resource, resource_route, scaffold_controller, controller (depends on PR 1.12)
- **1.14c** — benchmark, task, script, generator, devcontainer, db/system/change, authentication
- **1.14d** — rewrite `app-generator.ts` to extend `AppBase`

---

## Phase 1.5 — Actionpack prerequisites

### PR 1.5a — `Mapper#mount` (~250 LOC)

**Blocks:** PR 2.2.
**Blocked by:** none.

**Files changed:**

- `packages/actionpack/src/actiondispatch/routing/mapper.ts` — add `mount`
- `packages/actionpack/src/actiondispatch/routing/route-set.ts` — accept mounted apps in dispatch
- `packages/actionpack/src/actiondispatch/routing/mapper.test.ts` — port Rails' `mount` tests verbatim

**Rails source:** `actionpack/lib/action_dispatch/routing/mapper.rb#mount` (`:at`, `:as`, `:via`, anchor handling, default `host`); `actionpack/lib/action_dispatch/journey/router.rb` (anchor: false matching).

**Acceptance:** `mount FooEngine, at: "/foo"` routes `/foo/bar` to `FooEngine` and forwards `request.path = "/bar"` to the engine's app.

---

## Phase 2 — Core composition

### PR 2.1 — `Trailtie` base (~280 LOC)

**Blocks:** PR 2.2, PR 2.7a–e.
**Blocked by:** PR 1.2.

**New files:**

- `packages/trailties/src/trailtie.ts`
- `packages/trailties/src/trailtie/configuration.ts`
- `packages/trailties/src/trailtie/configurable.ts`
- `packages/trailties/src/trailtie.test.ts`

**Files changed (also lands here):**

- `scripts/api-compare/compare.ts` — add `Railtie: "Trailtie"` to `TS_CLASS_RENAMES`
- `scripts/api-compare/conventions.ts` — add path-segment alias table `{ railtie: "trailtie", railties: "trailties" }` applied before kebab-casing, across all framework source roots
- `scripts/api-compare/compare.test.ts` — coverage for the alias

**Rails source:** `railties/lib/rails/railtie.rb`, `railtie/configuration.rb`, `railtie/configurable.rb`.

**Subclass registration:** explicit. Each subclass calls `Trailtie.register(MyTrailtie)` (typically at bottom of its module). No `inherited` hook. The registered list is what `Application#initialize!` walks.

**Acceptance:** `pnpm tsx scripts/api-compare/compare.ts --package trailties` matches `Trailtie` to `Railtie` Rails class via the rename map.

### PR 2.2 — `Engine` (~550 LOC, split)

**Blocks:** PR 2.5.
**Blocked by:** PR 1.1, PR 1.5a, PR 2.1.

**New files:**

- `packages/trailties/src/engine.ts`
- `packages/trailties/src/engine/configuration.ts`
- `packages/trailties/src/engine/trailties.ts`
- `packages/trailties/src/engine/lazy-route-set.ts`
- `packages/trailties/src/engine/updater.ts`
- `packages/trailties/src/engine.test.ts`

**Rails source:** `railties/lib/rails/engine.rb` — `Engine`, `find`, `find_root`, `routes`, `config`, `paths`, `_all_load_paths`, `helpers`. **Skip** `eager_load!`, `eager_load_paths`, `_all_autoload_paths`, `isolate_namespace`. Plus `engine/configuration.rb`, `engine/railties.rb`, `engine/lazy_route_set.rb`, `engine/updater.rb`.

`isolate_namespace` is replaced by an explicit `tableNamePrefix` config option on `EngineConfiguration`.

**Split:**

- **2.2** (~250) — `Engine` shell + `paths` defaults + `find`/`find_root` + `engine/trailties.ts` collection + smoke test
- **2.2b** (~150) — `Configuration` defaults (incl. `tableNamePrefix`) + `_all_load_paths` + route mounting + full Rails-mirrored tests
- **2.2c** (~150) — `lazy_route_set` + `updater`

### PR 2.3 — Bootstrap initializers (~150 LOC)

**Blocks:** PR 2.5.
**Blocked by:** PR 2.1, PR 1.3.

**New files:**

- `packages/trailties/src/application/bootstrap.ts`
- `packages/trailties/src/application/bootstrap.test.ts`

**Rails source:** `railties/lib/rails/application/bootstrap.rb`.

- **Keep:** `:load_environment_config`, `:initialize_logger`, `:initialize_cache`, `:bootstrap_hook`.
- **Skip:** `:set_load_path`, `:set_autoload_paths`, `:initialize_dependency_mechanism`, `:set_eager_load_paths`, `:load_environment_hook`.

**Default null logger:** until `:initialize_logger` runs, `Rails.logger` returns a no-op default logger so pre-init imports don't crash. Resolves open question #4 — confirm activesupport has a suitable null-logger primitive in this PR's first commit; add one if not.

### PR 2.4 — Finisher initializers (~200 LOC)

**Blocks:** PR 2.5.
**Blocked by:** PR 2.1, PR 1.11.

**New files:**

- `packages/trailties/src/application/finisher.ts`
- `packages/trailties/src/application/finisher.test.ts`

**Rails source:** `railties/lib/rails/application/finisher.rb`.

- **Keep:** `:add_generator_templates`, `:add_builtin_route`, `:build_middleware_stack`, `:define_main_app_helper`, `:add_to_prepare_blocks`, `:run_prepare_callbacks`.
- **Skip:** `:eager_load!`, `:ensure_autoload_once_paths_as_subset_of_autoload_paths`.

### PR 2.5 — `Application` shell (~700 LOC, split)

**Blocks:** PR 2.6.
**Blocked by:** PR 2.2, PR 2.3, PR 2.4.

**New files:**

- `packages/trailties/src/application.ts`
- `packages/trailties/src/application/configuration.ts`
- `packages/trailties/src/application/default-middleware-stack.ts`
- `packages/trailties/src/application/routes-reloader.ts`
- `packages/trailties/src/application.test.ts`

**Rails source:** `railties/lib/rails/application.rb` — `Application`, `find_root`, `initialize!`, `routes_reloader`, `key_generator`, `message_verifier`, `credentials`, `config_for`, `to_app`, `helpers_paths`, `console`, `runner`, `generators`, `server`. **Skip** `secrets`, `eager_load!`. Plus `application/configuration.rb`, `application/default_middleware_stack.rb`, `application/routes_reloader.rb`.

`config_for("database")` dynamically `import()`s `config/database.ts` (or `.js`) and reads the key matching `Rails.env`. No YAML.

**Split:**

- **2.5** (~250) — `Application` shell + `find_root` + `initialize!` happy path + smoke test
- **2.5b** (~250) — `Configuration` defaults + `default-middleware-stack` + full Rails-mirrored tests
- **2.5c** (~200) — `routes-reloader` + `config_for` + `credentials` wiring + `key_generator` + `message_verifier`

### PR 2.6 — `Rails` global (~150 LOC)

**Blocks:** PR 2.7a–e.
**Blocked by:** PR 2.5.

**New files:**

- `packages/trailties/src/rails.ts`
- `packages/trailties/src/rails.test.ts`
- `packages/trailties/__fixtures__/hello-world/` — integration test fixture

**Files changed:** `packages/trailties/src/index.ts` — re-export `Rails`, `Application`, `Engine`, `Trailtie`.

**Rails source:** `railties/lib/rails.rb`, `railties/lib/rails/application.rb#Rails.application=`.

`Rails.env` returns activesupport's `EnvironmentInquirer` so `Rails.env.development?` works. **Resolve open question #3 in this PR**: pick `Rails.version` source (trailties `package.json` vs tracked Rails upstream).

**Acceptance integration test:** the fixture defines an `Application` subclass, calls `await Rails.application.initialize()`, and serves a route through `actionpack`. Lives in `application.test.ts`.

### PR 2.7 — Per-framework `Trailtie` wiring

Each is ~50–150 LOC. The path alias from PR 2.1 covers each framework
package; no further `api:compare` changes needed.

**Resolve open question #2 in PR 2.7a** by deciding the activesupport `Trailtie` location. Default position: `packages/trailties/src/trailties/active-support.ts` (in trailties, so the dependency direction stays trailties → activesupport). Adjust 2.7a's "new file" path based on what's decided.

| PR   | Rails source                                                                                | New file                                                                            |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2.7a | `activesupport/lib/active_support/railtie.rb`                                               | TBD per question #2 (default: `packages/trailties/src/trailties/active-support.ts`) |
| 2.7b | `activemodel/lib/active_model/railtie.rb`                                                   | `packages/activemodel/src/trailtie.ts`                                              |
| 2.7c | `activerecord/lib/active_record/railtie.rb`                                                 | `packages/activerecord/src/trailtie.ts`                                             |
| 2.7d | `actionpack/lib/action_controller/railtie.rb` + `actionpack/lib/action_dispatch/railtie.rb` | `packages/actionpack/src/trailtie.ts` (two trailties)                               |
| 2.7e | `actionview/lib/action_view/railtie.rb`                                                     | `packages/actionview/src/trailtie.ts`                                               |

---

## Phase 3 — Deferred (not blocking)

### PR 3.5 — Browser adapters

Browser `processAdapter` + virtual-fs `fsAdapter`, packaged as `@blazetrails/activesupport/browser` subpath export. Demo harness in `packages/website/`.

**New files:**

- `packages/activesupport/src/browser-process-adapter.ts`
- `packages/activesupport/src/browser-fs-adapter.ts`
- `packages/website/src/demo/`

**Files changed:** `packages/activesupport/package.json` — add `./browser` subpath export.

### PR 3.6 — Relocate dev binaries to trailties

`trails-tsc` stays a standalone bin (tooling expects the executable name). The two dump bins fold into `trails` subcommands.

**Files moved:**

- `packages/activerecord/bin/trails-tsc.js` → `packages/trailties/bin/trails-tsc.js`
- `packages/activerecord/bin/trails-schema-dump.js` → `packages/trailties/src/commands/schema.ts` (`trails schema:dump`)
- `packages/activerecord/bin/trails-models-dump.js` → `packages/trailties/src/commands/models.ts` (`trails models:dump`)
- TS sources backing each `bin/*.js`

**Files changed:**

- `packages/activerecord/package.json` — drop the three `bin` entries
- `packages/trailties/package.json` — add `trails-tsc` bin
- `packages/trailties/src/cli.ts` — register `schema:dump`, `models:dump`
- CI workflow invoking `Virtualized DX Type Tests` — update `trails-tsc` invocation path
- Workspace `package.json` `scripts:` calling any of the three bins

### Blocked

- **`MailersController`** — needs `actionmailer` package.

### Skipped indefinitely

- `Rails::Command` framework (`commander` is sufficient).
- `Rails::Plugin` builder.
- `Rails::Secrets`.

---

## Tracking

- Baseline: 2/1076 methods (0.2%), 1/134 files, matching the plan-start
  snapshot at the top of this doc. Update after each PR merges.
- Primary signal:
  `pnpm tsx scripts/api-compare/compare.ts --package trailties` (after
  `pnpm tsx scripts/api-compare/extract-ts-api.ts`). Trailties is
  already wired into api-compare config.
- Final acceptance: PR 2.6's integration test passes — hello-world fixture imports `Rails`, calls `await Rails.application.initialize()`, serves a route through `actionpack`.
