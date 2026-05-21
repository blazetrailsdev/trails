# trailties build-out plan

Implementer guide for porting Rails `railties` to `@blazetrails/trailties`.

This doc tells you what to build, in what order, with what dependencies,
and answers the design decisions you would otherwise have to ask about.
Open the PR whose dependencies are met; do not deviate from the answers
below without proposing a plan-doc change first.

Closed PRs and their findings have been folded into the followup sections
below or dropped if subsumed by later work — `git log` is the historical
record. In-flight PRs are not tracked here; check `gh pr list` for
current state.

## Hard rules

0. **All TS-source generator output flows through `@blazetrails/trailties/template-builder`.**
   No raw-string `createFile` for `.ts` files; no `.rb`/`.erb` strings
   anywhere. See `docs/trailties-template-builder.md` for the locked
   Option B design and PR T1 below for the builder PR. Per-generator
   tests must include (a) snapshot, (b) `parseTs` (the
   parse-without-diagnostics helper exported from T1), (c)
   `assertNoRubySource`.
1. **No `node:*` imports** in `packages/trailties/src/` except `bin.ts`.
   Repository rule; enforce locally with
   `! grep -r 'from "node:' packages/trailties/src/ | grep -v bin.ts`.
2. **No `process.*` references** in `packages/trailties/src/` after PR 0.3.
   Enforced by ESLint via `blazetrails/no-process-bypass`. Use the
   `processAdapter` snapshot for `env` / `cwd` / `stdout`.
3. **Trailties code uses async fs only.** `fsAdapter` exposes both
   sync and async surfaces; trailties imports only the async ones
   (`exists`, `mkdtemp`, `readdir`, `readFile`, `writeFile`, …) and
   `await`s every call. The pre-existing sync helpers in
   `generators/base.ts` (`createFile`, `appendToFile`, `insertIntoFile`,
   `fileExists`, `removeFile`) and a handful of command files still
   violate this — scheduled for the 1.12c refactor.
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
- `api:compare` rename map (added in PR 2.1) handles `Railtie` → `Trailtie`
  and the `railties/` → `trailties/` path-segment alias is global; any
  future framework that ships a real `railties/` subdir MUST rename its
  TS dir to `trailties/`.

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
| Ruby `gem` / `gem_group` / `github` / `add_source` template actions                                                                                                                     | trails uses `package.json`, not Gemfile       |
| Ruby `route` / `environment` / `application` template actions                                                                                                                           | trails uses `src/config/*.ts`                 |
| `after_bundle` (renamed `afterInstall`)                                                                                                                                                 | terminology fits package-manager install      |

### Architectural answers

| Question                                                 | Answer                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Templates: EJS or `.tse`?                                | `.tse` (codebase convention). `api:compare`'s `.erb` → `.tse` mapping handles paths.                                                                              |
| `Trailtie` subclass registration                         | Explicit: `Trailtie.register(MyTrailtie)`. No `inherited` hook. Same for `Application.register(klass)`.                                                           |
| `config_for` config format                               | TS/JS modules via dynamic `import()`. No YAML.                                                                                                                    |
| Glob pattern dialect                                     | Node/picomatch-style: `**`, `*`, `?`, `[...]`, `{a,b}`, `!`. Not Ruby parity.                                                                                     |
| `processAdapter` `env` mutation                          | Snapshot values are read-only by convention (typed `Readonly`, null-prototype object). `setEnv` is the only supported mutation path; rare.                        |
| `processAdapter` exports use `Proxy`?                    | No. Plain copied snapshot objects on `registerProcessAdapter`; no runtime `Object.freeze`.                                                                        |
| `WriteStream` `isTTY`/`columns`/`rows`                   | Snapshot at register time. No resize event.                                                                                                                       |
| Test runner integration                                  | Out of scope — Vitest, separate plan.                                                                                                                             |
| User code STI subclass / `Concern.included` registration | User app maintains a central index file (e.g. `app/models/index.ts`). Future tooling in `trails-tsc` will auto-manage these.                                      |
| `Engine` namespacing replacement                         | Explicit `tableNamePrefix` config option. Module/helper namespacing handled by where the user imports from.                                                       |
| `Rails.logger` before init                               | `NullLogger` in activesupport (shipped). Wiring into a `Trails` global is PR 2.6.                                                                                 |
| Activesupport `Trailtie` file location                   | Likely **inside trailties** (`packages/trailties/src/trailties/active-support.ts`) to avoid inverting the trailties → activesupport dependency. PR 2.7a confirms. |
| Application root-flag file                               | `config.ts` (trails analog of Rails' `config.ru`). `Application.findRoot` walks parents looking for it. See `app-generator.ts:177`.                               |

### Per-PR universal acceptance

Every PR must pass:

- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint` clean
  (lint includes `blazetrails/no-process-bypass` for rule 2).
- Rails-mirrored tests added where Rails has tests; verbatim names.
- PR description lists Rails sources kept/skipped per rule 7.

### Decisions still open

| #   | Question                                                                                                                                   | Decide before |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 2   | Where does the activesupport `Trailtie` live (in trailties subdir vs activesupport itself)?                                                | PR 2.7a       |
| 3   | What does `Rails.version` return — trailties `package.json` version or tracked Rails upstream version?                                     | PR 2.6        |
| 5   | Convert remaining sync `readdir`/`readFile`/`writeFile` callers to async; promote optional `FsAdapter` async surface to required?          | PR 1.12c      |
| 6   | Should `Engine#paths()` THROW (Rails-faithful) when `calledFrom` is unset? (Currently returns `Root(null)` per 2.2a/b deviation.)          | PR 2.5c       |
| 7   | Migration filename separator: align `MigrationGenerator` to Rails `_` (preferred) or broaden helper regexes to accept `_` and `-`?         | PR 1.12c      |
| 8   | Generated apps' package-manager: `--package-manager <pm>` flag on `trails new` vs runtime detection in generated `bin/setup`?              | PR 1.14d      |
| 9   | Generated apps' SQLite driver: `--sqlite-driver` flag; default stays `better-sqlite3` until `node-sqlite` is in Node LTS. Confirm default. | PR 1.14d      |

---

## Phase 1 — Leaves (open items)

> **Generator output is governed by `docs/trailties-template-builder.md`
> (Option B: typed tagged-template emitters).** Every PR that produces app
> source code must build it through `@blazetrails/trailties/template-builder`'s
> `tsModule` / `tsClass` / `tsImport` / `tsField` / `tsMethod` / `tsBody`
> builder — never raw string templates, never `.rb`/`.erb` content. PR T1
> (below) lands the builder; PRs that emit code are gated on it.

### PR T1 — Typed template emitter infra (~250 LOC) — gate for all generator work

**Blocked by:** none. Lands first.

**Source:** new. See `docs/trailties-template-builder.md` for the full API.

**Node/TS fit:** pure TS. No new runtime deps (hard rule 4).

**Scope:**

- `packages/trailties/src/template-builder/{index,types,refs,emit-module,emit-class,emit-interface,emit-import,emit-method,ts-body}.ts`.
- `Ref` (branded `{ kind: "ref"; name: string; from?: string }`), `type` tagged template, `tsImport` family (named / default / type-only), `tsField`, `tsMethod`, `tsBody` (dedent + ref-carrying tagged template), `tsClass`, `tsInterface`, `tsModule`.
- `tsModule` is the sole record→source resolver. It walks every `Ref` in declarations, dedupes imports, and emits the final file as one string.
- Unit tests cover: import dedup, default+named in same import, type-only, ref propagation through `type` / `tsBody`, dedent behavior, snapshot golden for a hand-built module, **`extends: "ApplicationRecord"` fails to typecheck** (compile-error assertion via `// @ts-expect-error` in a `*.test-d.ts` file, executed by the existing `test:types` pass).

**Acceptance:**

- `ts.createSourceFile` parse + diagnostic helper exported for downstream snapshot tests.
- `assertNoRubySource(text)` helper exported (regex on `/^\s*(class|module|def)\s+\w+($|\s+<)/m`).

### PR T2 — migrate model / migration / resource-route generators (~150 LOC)

**Blocked by:** PR T1.

Smallest existing generators first. Each becomes a thin function over the
builder; snapshot tests capture the canonical emit.

- `packages/trailties/src/generators/rails/model/model-generator.ts`
- `packages/trailties/src/generators/rails/migration/migration-generator.ts`
- `packages/trailties/src/generators/rails/resource-route/resource-route-generator.ts`
- Per-generator `__snapshots__/` covering the matrix of attribute types.
- Per-generator `assertNoRubySource` + `parseTs` checks.

### PR T3 — migrate controller / scaffold generators (~200 LOC)

**Blocked by:** PR T1.

Bigger flat-layout generators. Done together because they share the
controller-template prose. Same snapshot + parse + no-Ruby tests as T2.

- `packages/trailties/src/generators/controller-generator.ts`
- `packages/trailties/src/generators/scaffold-generator.ts`
- Relocate both into `packages/trailties/src/generators/rails/` Rails layout
  in the same PR; the migration to the builder is the natural moment.
- **Factor out** `emitControllerClass(...)` and a `controllerPathHelpers`
  module — consumed by T4 (authentication) and PR 1.14b-cont (helper /
  controller / scaffold_controller). Either factor-out lands here or the
  consumers fall back to T1 primitives.

### PR T4 — AuthenticationGenerator on the builder (~200 LOC)

**Blocked by:** PR T1 (builder). Soft-blocked by PR T3 for the
`emitControllerClass` helper; if T3 ships without factoring, T4 inlines
the controller emit via T1 primitives.

**Source:** `vendor/rails/railties/lib/rails/generators/rails/authentication/`.

- `packages/trailties/src/generators/rails/authentication/authentication-generator.ts`
- Snapshots for all 7 generated files.
- Mandatory `assertNoRubySource` over the full emit set (`app/models/{user,session,current}`, `app/controllers/{sessions,passwords,concerns/authentication}`, `app/mailers/passwords_mailer`, etc.).
- Mailer pieces gated on actionmailer existence — emit a `--skip-mailer` flag honoring the existing pattern.
- Skipped from Rails: `enable_bcrypt` (Ruby Bundler), `add_migrations` (needs `MigrationGenerator.generate` shell-out — open question #8 territory), `hook_for :test_framework`, `hook_for :template_engine, as: :authentication`.

### PR T5 — DevcontainerGenerator (~250 LOC) — supersedes prior PR 1.14c-3 scope

**Blocked by:** PR T1 (builder).

Resolves the YAML carve-out from open question pre-existing in
`trailties-plan.md` PR 1.14c-3 entry: emit a fresh `compose.yaml` per
database config — file extension stays `.yaml` (Compose looks for it),
but the contents are JSON syntax (YAML 1.2 is a strict superset of
JSON; Docker Compose parses it fine). No YAML emitter, no new infra.

- `packages/trailties/src/generators/rails/devcontainer/devcontainer-generator.ts`
- `update_devcontainer_db_host` / `update_devcontainer_db_feature` /
  `edit_compose_yaml` ports emit both `compose.yaml` and
  `devcontainer.json` via `JSON.stringify(..., null, 2)`.
- `update_application_system_test_case` stays a plain string replace.
- **SQLite driver awareness**: when the app was created with
  `--sqlite-driver=node-sqlite`, omit `better-sqlite3` native-build
  features (`libsqlite3-dev`, build-essential) from the devcontainer
  base image. `--sqlite-driver=expo-sqlite` skips devcontainer SQLite
  setup entirely. Default `better-sqlite3` keeps current behavior.

### PR 1.10c — Trails-native template DSL (~150–250 LOC, optional)

**Blocked by:** PR T1 (`assertNoRubySource` helper used by `initializer()`).

**Node/TS fit:** clean — all four operations are file edits via the existing `FsAdapter` async surface and the established marker-insert pattern (`// routes` marker is already wired in `controller-generator.ts:148`, `scaffold-generator.ts:80`, and the new `generators/rails/resource-route/`).

**Dependencies:**

- `FsAdapter` async surface (shipped).
- `AppGenerator` template at `packages/trailties/src/generators/app-generator.ts` already emits a `// config` marker for `application.ts`? No — must be added in this PR before `environment()` can hook in.
- `// initializers` directory convention — `src/config/initializers/` is generated by `AppGenerator`; confirm before shipping.

**Scope:**

- `pkg(name, version?, opts?)` → mutate `package.json` deps (replaces Ruby `gem`). JSON via `JSON.stringify(..., null, 2)`.
- `route(tsCode)` → insert into `src/config/routes.ts` at existing `// routes` marker. Caller-supplied; documented contract: must be valid TS.
- `environment(tsCode, { env })` → insert into `src/config/application.ts` (add `// config` marker to `AppGenerator` template first; this marker addition lands in PR 1.14d-a's `app-generator.ts` builder migration).
- `initializer(filename, content)` → writes to `src/config/initializers/`. Content **must** be produced via the T1 `tsModule` builder; raw-string content fails the `assertNoRubySource` check that ships in T1.

**Open:** call file `trails-actions.ts` (new) or keep on `GeneratorBase` alongside the existing `generate` queue. Recommend a separate file to keep `actions.ts` as the Rails-shape mirror, so `api:compare` stays clean.

### PR 1.12b-2 — `actions/create_migration.rb` port (~80–100 LOC)

**Blocked by:** none. Sibling off main. Split off from 1.12b to stay under the ceiling.

**Node/TS fit:** trivial — `Rails::Generators::Actions::CreateMigration` is 75 LOC of Thor `Thor::Actions::CreateFile` subclass with collision detection by glob. The port is a thin wrapper over async `FsAdapter.readdir` + `writeFile` with the same collision regex (`/^\d+_<basename>(\.[^.]+)?$/`). Honors open question #7 (separator).

**Dependencies:** async `readdir` on `FsAdapter` (shipped).

**Note:** ship together with `migration.rb#migration_template` (~40–60 LOC) — the dispatch is coupled. Best a single ~150 LOC PR that lands both, opened from main.

### PR 1.12c — app_base + database + generator refactor (~250 LOC)

**Blocked by:** PR 1.12b-2.

**Node/TS fit:** `app_base.rb` is 814 LOC in Rails; ours is shaping into ~200 LOC because we skip Gemfile/bundler/RVM/spring-style code. `database.rb` is 287 LOC and ports cleanly via the existing `database.ts` (already 492 LOC for adapter resolution).

**Dependencies:**

- PR 1.12b-2 (`CreateMigration` action — needed for `migration_template`).
- Existing `generators/database.ts` (already shipped — covers `Database` registry).
- `AppGenerator` (already shipped).

**Scope (bundled into one PR at ceiling):**

- **`AppBase` extraction** (~80 LOC): port `source_root`, `base_name`/`generator_name`, `indent`, `wrap_with_namespace`, `namespaced?`, `class_collisions`, `hook_for`. These were dropped from PR 1.12 to fit the ceiling. Sized correctly here.
- **`parseColumns*` consolidation** (~40 LOC): migrate `model-generator.ts` (`parseColumnsDefaultString`), `migration-generator.ts` (`parseColumnsWithModifiers`), `scaffold-generator.ts` (`parseColumns` from `base.ts`) all to `GeneratedAttribute.parse`. Delete dead `parseColumns` / `ColumnType` / `tsType` from `generators/base.ts`.
- **Sync-fs async conversion** (~30 LOC + ripple): `generators/base.ts` `createFile`/`appendToFile`/`insertIntoFile`/`fileExists`/`removeFile` → async. Ripples through every generator subclass — count the ripple in the LOC budget; may force a 1.12c / 1.12c-b split. Also resolves the Copilot concern (PR 2170 #3) about sync `getFs()` in ESM CLI contexts.
- **Migration filename separator** (open question #7): align `MigrationGenerator` to `_` (preferred — behavior change for any pre-1.12c-generated apps), or broaden helper regexes to accept both.
- **Template pipeline + `migration.rb#migration_template`** ERB-driven dispatch (~40–60 LOC).
- **Scaffold-route helpers on NamedBase** (`indexHelper`/`showHelper`/`editHelper`/`newHelper`/`singularRouteName`/`pluralRouteName`) once `resource_helpers` lands, plus Rails-verbatim `test_index_helper*` / `test_scaffold_plural_names_with_model_name_option` (~30 LOC).
- **Re-narrow `AttrOptions`** from `Record<string, unknown>` to a typed shape (`size`/`limit`/`precision`/`scale`/`polymorphic`/`null`/`index`) once more consumers land (~20 LOC).
- **`insertIntoFile` marker-indent fix** (Copilot PR 2178 #3, ~10 LOC): the bare `"// routes"` marker pattern can shift the marker line's indent in three call sites — `controller-generator.ts:148`, `scaffold-generator.ts:80`, `generators/rails/resource-route/`. Either match the full `"  // routes"` marker or make `insertIntoFile` line-aware.

**Proposed split if over ceiling:**

- **1.12c-a**: `AppBase` extraction + `parseColumns` consolidation (~120 LOC).
- **1.12c-b**: sync-fs → async migration alone (~60 LOC + ripple) — high-blast-radius; isolate it.
- **1.12c-c**: template pipeline + `migration_template` + scaffold-route helpers (~120 LOC).

### PR 1.14b-cont — helper / controller / scaffold_controller generators (~250 LOC)

**Blocked by:** PR T1 (builder). Soft-blocked by PR T3 for the
`emitControllerClass` factor-out — if T3 ships it, 1.14b-cont consumes
it; if not, this PR inlines via T1 primitives.

**Source:** `vendor/rails/railties/lib/rails/generators/rails/{helper,controller,scaffold_controller}/`. PR 1.14b deferred these because the trailties side had no canonical "controller template surface."

**Node/TS fit:** straightforward — compose the builder helpers landed in T1 (and reuse T3's if available).

**Dependencies:**

- `paths.controllers` / `paths.helpers` resolution from `Engine#paths()` (shipped in 2.2b).
- Builder primitives `tsClass`/`tsMethod`/`tsBody` (T1).

> **PR 1.14c-2 (authentication) is replaced by PR T4 above.**

> **PR 1.14c-3 (devcontainer) is superseded by PR T5 above.** YAML carve-out
> resolved: `compose.yaml` contents are JSON syntax (Compose accepts it),
> emitted fresh per config. No YAML emitter.

### PR 1.14c-4 — db/system/change generator (~200 LOC)

**Blocked by:** PR T5 (shares devcontainer's `Database` registry usage patterns and compose-emit conventions).

**Source:** `vendor/rails/railties/lib/rails/generators/rails/db/system/change/change_generator.rb`.

**Node/TS fit:** clean — config-file rewriting via builder; database adapter swap in app skeletons.

**Dependencies:** Database registry (shipped); the devcontainer prose helpers factored out in T5.

### PR 1.14d — `AppGenerator` extends `AppBase` (~250–350 LOC, may split)

**Blocked by:** PR 1.12c (`AppBase`). Soft-blocked by PR T3 for shared prose helpers (falls back to T1 primitives if T3 ships without factoring).

**Node/TS fit:** mechanical refactor of existing `packages/trailties/src/generators/app-generator.ts` (~900 LOC of raw-string emit) onto the builder. The bulk of the diff is the raw-string-to-builder migration; size may force a split into:

- **1.14d-a** (~250 LOC): file-by-file migration of `app-generator.ts` to the builder. Snapshot every emitted file. No behavior change.
- **1.14d-b** (~150 LOC): extend `AppBase`; bundle the items below.

**Bundle (in 1.14d-b):**

- `default()` view-template helper on `GeneratedAttribute` + Rails-verbatim `test_default_value_*` tests (~50 LOC).
- **Package-manager parameterization** (open question #8, ~30 LOC): replace hardcoded `pnpm install` / `corepack enable pnpm` in `app-generator.ts:153,237,883-887` and `bin/setup` template strings. Add `--package-manager <pnpm|npm|yarn>` to `trails new`; thread through. These move from inline literals into typed builder slots, which makes the parameterization a one-line change instead of three.
- **SQLite driver parameterization** (open question #9, ~40 LOC). Today `app-generator.ts:919` hardcodes `"better-sqlite3": "^12.6.0"` into the generated `package.json`, and the generated `config/database.ts` never imports a driver explicitly — `trailties/src/database.ts:439` auto-imports `better-sqlite3` at runtime. Add `--sqlite-driver <better-sqlite3|node-sqlite|expo-sqlite>` to `trails new`; thread through:
  - `package.json` builder slot conditionally emits the runtime dep (`better-sqlite3` only; `node-sqlite` is Node-built-in; `expo-sqlite` is the app's responsibility).
  - Generated `src/config/database.ts` emits an explicit `import "@blazetrails/activesupport/sqlite/<driver>"` (or `registerSqliteDriver(...)` for custom paths) so the choice is visible at the call site rather than relying on the runtime auto-import.
  - Default stays `better-sqlite3`. Revisit when `node-sqlite` ships in Node LTS.

**Deferred:** `required?` predicate gated on `belongs_to_required_by_default` (~10 LOC) — wait for AR config port.

---

## Phase 2 — Core composition (open items)

### PR 2.1b — Trailtie configurable + framework block runners (~200 LOC)

**Blocked by:** PR 2.1 (shipped).

**Source:** `vendor/rails/railties/lib/rails/railtie/configurable.rb` (36 LOC), `vendor/rails/railties/lib/rails/railtie/configuration.rb` (114 LOC).

**Node/TS fit:** `Configurable` is `ActiveSupport::Concern` + sealed-class guard. We use the `host = (k) => k as unknown as Host` cast pattern for per-subclass static state (already in `trailtie.ts` + `engine.ts`); a third call site here justifies factoring a shared `_perClassState<K>(key)` helper.

**Dependencies:**

- `activesupport`'s `Concern` (shipped).
- `actionpack`'s `MiddlewareStackProxy` for `Configuration.appMiddleware` — verify shipped before adding (otherwise stub).

**Scope:**

- (a) `Configurable` sealed-class guard. Helper file at `packages/trailties/src/trailtie/configurable.ts` was deleted before 2.1 merge; recreate.
- (b) Framework block runners — `Trailtie.rakeTasks` / `console` / `runner` / `generators` / `server` registration + `run*Blocks` ancestor walk (previously implemented + tested in a 2.1 draft, dropped for size).
- (c) `Configuration` lifecycle hooks (`beforeConfiguration` / `beforeInitialize` / `beforeEagerLoad` / `afterInitialize` / `afterRoutesLoaded`) backed by a class-side hook registry.
- (d) `Configuration.appMiddleware` / `appGenerators` stubs once `actionpack` `MiddlewareStackProxy` lands.
- (e) Factor `_perClassState<K>(key)` helper out of `trailtie.ts` + `engine.ts` (third call site triggers extraction).

### PR 2.5c — `Application` routes-reloader + config_for + credentials wiring (~200 LOC)

**Blocked by:** PR 2.5b (shipped — Configuration defaults + default middleware stack landed in #2177).

**Source:** `vendor/rails/railties/lib/rails/application/routes_reloader.rb` (83 LOC), parts of `application.rb` (config_for, credentials, key_generator, message_verifier).

**Node/TS fit:** `routes_reloader.rb` is a thin wrapper around route file reloading. In trailties, "reload" maps to re-importing the route module via dynamic `import()` with a cache-bust query (`?t=${Date.now()}`) — Vite's HMR handles dev; production no-ops. `config_for` is dynamic `import()` of `config/<name>.ts` reading the env key. Because `Trails` (PR 2.6) is downstream of 2.5c, this PR's `config_for` resolves the env via the `processAdapter` snapshot (`processAdapter.env.TRAILS_ENV ?? processAdapter.env.NODE_ENV ?? "development"`); when 2.6 lands it swaps to `Trails.env`.

**Dependencies:**

- `Application::Configuration` extended via `ApplicationConfiguration` (shipped in 2.5b).
- `EncryptedConfiguration` in activesupport — STILL NOT SHIPPED (12 `it.skip` stubs in `packages/activesupport/src/encrypted-configuration.test.ts`). **This is a real blocker** — either implement `EncryptedConfiguration` as a 2.5c-prereq mini-PR (~150 LOC) or scope it out of 2.5c.
- `MessageVerifier` / `MessageEncryptor` (shipped — `packages/activesupport/src/message-{verifier,encryptor}.ts`).
- `EncryptedFile` (shipped).

**Scope:**

- `routes-reloader.ts` (dynamic-import-based reload).
- `Application#configFor(name)` reading `config/<name>.ts` per `Trails.env`.
- `Application#credentials()` returning `EncryptedConfiguration` instance.
- `keyGenerator()` + `messageVerifier()` using `secretKeyBase` from credentials.
- Re-add `implements BootstrapHost` on `Application` class (dropped in 2.5a — see #2173 findings).
- Splice `Finisher.initializersFor(this)` into `Application#initializers`. Supply host methods Finisher needs: `routes.prepend`, `routes.defineMountedHelper`, `reloader.toPrepare`, `reloader.prepareBang`, `env.isDevelopment`, `ensureGeneratorTemplatesAdded`, `buildMiddlewareStack`, `appendInternalRoute`.
- Restore config fields trimmed from 2.5b: `precompileFilterParameters`, `filterRedirect`, `contentSecurityPolicyNonceGenerator`, `contentSecurityPolicyNonceDirectives`, `domTestingDefaultHtmlVersion`.
- `editEncryptedFile` (in `encrypted-file-editor.ts`) stays constructed directly from CLI flags in 2.5c; wiring through `Trails.application.encrypted(...)` is a small 2.6-followup since `Trails` is downstream.

**Proposed re-ordering:** if `EncryptedConfiguration` is not shipped before 2.5c, split into:

- **2.5c-a (~100 LOC)**: `EncryptedConfiguration` port in activesupport (revives the 12 skipped tests).
- **2.5c-b (~200 LOC)**: routes-reloader + config_for + credentials wiring proper.

### PR 2.6 — `Trails` global (~150 LOC)

> Trails-mapped rename: `Rails` → `Trails`. This PR must add
> `Rails: "Trails"` to `scripts/api-compare/compare.ts` `TS_CLASS_RENAMES`
> (mirroring the `Railtie: "Trailtie"` entry from PR 2.1) and verify
> `test:compare` continues to match Rails test names through the rename.

**Blocks:** PR 2.7a.
**Blocked by:** PR 2.5c.

**Source:** `vendor/rails/railties/lib/rails.rb` (130 LOC).

**Node/TS fit:** Rails uses `module Rails; class << self`. TS has no module-singleton pattern; ship as a frozen object literal `export const Trails = { application, configuration, backtraceCleaner, root, env, error, groups, publicPath, ... }`. Mutation done through explicit setters (`Trails.application = app`); read-only properties via getter.

`Trails.env` returns activesupport's `EnvironmentInquirer` so `Trails.env.development?` works (shipped).

**New files:**

- `packages/trailties/src/rails.ts`
- `packages/trailties/src/rails.test.ts`
- `packages/trailties/__fixtures__/hello-world/` — integration test fixture

**Files changed:**

- `packages/trailties/src/index.ts` — re-export `Trails`, `Application`, `Engine`, `Trailtie`.
- `scripts/api-compare/compare.ts` — add `Rails: "Trails"` to `TS_CLASS_RENAMES`.
- `scripts/api-compare/compare.test.ts` — coverage for the alias.

**Resolve open question #3 in this PR**: pick `Trails.version` source (trailties `package.json` vs tracked Rails upstream).

**Wiring this PR drives:** when `Trails` lands, also rewire (count toward LOC budget or follow-up immediately):

- `BacktraceCleaner.setRoot()` → lazy `Trails.root` read (`~5 LOC`).
- `Rack::Logger` / `SilenceRequest` constructor logger default → `Trails.logger`.
- Welcome template locals (`railsVersion` / `rackVersion` / `runtimeVersion`) → globals.
- `Info.property("Environment")` reads `Trails.env`, not `env.TRAILS_ENV ?? env.NODE_ENV`.
- `LazyRouteSet.setReloadRoutesHook(() => Trails.application?.reloadRoutesUnlessLoaded())` (`~5 LOC`, per #2175 findings).
- `Application._appClass` write-side: confirm `Trails.application` tracks `Application.appClass` reassignment, since `_appClass` is module-scoped mutable state (per #2173 findings).

**Acceptance:**

- Integration test fixture defines an `Application` subclass, calls `await Trails.application.initialize()`, and serves a route through `actionpack`. Lives in `application.test.ts`.
- `pnpm tsx scripts/api-compare/compare.ts --package trailties` matches `Trails` to `Rails` Ruby class via the rename map.
- `pnpm test:compare` continues to match Rails test names through the rename.

### PR 2.7a — Activesupport Trailtie (~50–100 LOC)

**Blocked by:** PR 2.6 + open question #2.

**Source:** `vendor/rails/activesupport/lib/active_support/railtie.rb`.

**Node/TS fit:** would invert the trailties → activesupport dependency if filed in `packages/activesupport/`. Default position: file lives at `packages/trailties/src/trailties/active-support.ts` (in trailties, importing from activesupport). Resolve in this PR.

**Dependencies:** `Trails` global (PR 2.6); `Application::Configuration`'s `activeSupport` slot.

### PR 2.7-followups — Activerecord + Actionpack railtie full wiring

**Blocked by:** various.

PRs 2.7b/2.7c/2.7d/2.7e shipped only the config namespaces + minimal initializer surface. The full Rails `railtie.rb` initializer chains for activerecord and action-controller are followups, each blocked on the named infrastructure:

**activerecord/trailtie.ts followups (per #2181):**

- `active_record.postgresql_time_zone_aware_types`, `active_record.logger`, `active_record.backtrace_cleaner` — wire via existing `activesupport.onLoad` registry (`packages/activesupport/src/lazy-load-hooks.ts` is shipped; just consume it).
- `active_record.set_filter_attributes` — `Base.filterAttributes` exists; needs `Application.config.filterParameters` slot first.
- `active_record.set_signed_id_verifier_secret` — helper exists in `signed-id.ts`; blocked on `Application.secretKeyBase` (PR 2.5c).
- `active_record.clear_active_connections` (after_initialize), `active_record.log_runtime`.
- `active_record.copy_schema_cache_config`, `active_record.sqlite3_adapter_strict_strings_by_default`, `active_record.postgresql_adapter_decode_dates`.
- `active_record_encryption.configuration`, `active_record.query_log_tags_config`.
- `active_record.set_configs` setter-dispatch loop (catch-all copying `config.activeRecord.*` onto `ActiveRecord.*`).
- Convert `initialize_timezone` from direct `Base.timeZoneAwareAttributes = true` to `onLoad("active_record", ...)` once the on_load consumers are wired.

**action-controller/trailtie.ts followups (per #2181):**

- `action_controller.assets_config` — needs `paths["public"]`.
- `action_controller.set_helpers_path` — needs `helpers_paths` (Engine#helpersPaths is shipped at 2.2b but unwired here).
- `action_controller.parameters_config` — blocked on `ActionController::Parameters` port + on_load.
- `action_controller.set_configs`, `compile_config_methods`, `request_forgery_protection`, `query_log_tags`, `test_case`.

**actionview/trailtie.ts followups (per #2165, ~30–60 LOC bundle):**

Wire `action_view.logger`, `action_view.caching`, `action_view.setup_action_pack`, `action_view.collection_caching` + 9 `config.after_initialize` blocks (AssetTagHelper / FormHelper / FormTagHelper / SanitizeHelper / UrlHelper / Template / ContentExfiltrationPreventionHelper) + `rake_tasks { cache_digests.rake }`. Bundle when 3–4 of those helpers gain the required setter surface.

**Cross-package cleanup:**

- Migrate AR + actionpack `trailtie.ts` files from `extends BaseRailtie from "@blazetrails/activesupport"` to `@blazetrails/trailties` `Trailtie`; delete `packages/activesupport/src/railtie.ts`. Blocked on PR 2.7a (~150 LOC).
- Remove activemodel `TrailtieConfig.i18nCustomizeFullMessage` flat slot (`@deprecated`) once internal callers migrate.

---

## Cross-cutting followups from merged PRs

Sized work that doesn't belong to a single open PR. Bundle into the most relevant upcoming PR or open standalone when ceiling allows.

### Activesupport infrastructure

- **GCM in `MessageEncryptor`** (~150 LOC, real). `crypto-adapter.ts` already exposes optional `getAuthTag()` / `setAuthTag()`; `message-encryptor.ts` has a partial `nonceLen` branch (`name.includes("gcm")`). Needs envelope extension to `encrypted--iv--tag`. Then flip `EncryptedFile.CIPHER` to `aes-128-gcm` to match Rails.
- **`ActiveSupport::Messages::Codec` port** (~250 LOC): `Codec.with(default_serializer:)` global flip. Lets "can read encrypted file after changing default_serializer" test exercise real Rails semantics. Some infrastructure (`messages/rotation-configuration`, `serializer-with-fallback`) already exists at `packages/activesupport/src/messages/`.
- **Eager symlink resolution via async factory** (~50 LOC): optional `EncryptedFile.create(opts)` resolves `realpath` before returning — matches Rails' eager semantics.
- **`EncryptedFile.isKey()` cache** memoizes a miss. Worked around in trailties by reading fs directly in `ensureKeyFile`; add `resetKeyCache()` or auto-invalidate on `change`.
- **`EncryptedConfiguration` port** (~150 LOC): 12 `it.skip` stubs in `packages/activesupport/src/encrypted-configuration.test.ts`. Real blocker for PR 2.5c — see that entry.
- **Tighten `nodeFs` typing in fs-adapter** (~30 LOC): extract a shared `NodeFsPromises` type instead of inline ad-hoc shapes in both `tryAutoRegisterNode` branches. Promote optional async methods to required once browser-fs and virtual-fs adapters add them (open question #5).
- **Async `mkdir` on FsAdapter** (~30 LOC): add `mkdir(path, {recursive})` + Node impl; call before `ensureKeyFile` / `file.change` so `credentials edit --environment <env>` doesn't ENOENT on a fresh app. (`mkdirSync` exists; async surface absent.)
- **`stdio: "inherit"` on child-process-adapter** (~20 LOC): extend `SpawnSyncOptions` so vim/nano get a TTY when called via `editEncryptedFile`.
- **`silenceAsync<T>(level, fn)` on Logger / TaggedLogger** (~30 LOC, real — sync `silence()` exists, async variant does not). Required so `SilenceRequest` middleware silences across `await` points.
- **Shellwords-style arg parsing for `git`/`rake`** (deferred per #2170): current `splitArgs()` in `actions.ts` splits on whitespace only. Acceptable for `git :init` / `git add: "."` cases; quoted args (`git('commit -m "msg with spaces"')`) mis-split. Add a `string[]` argv overload or vendor a shellwords parser into activesupport (~40 LOC).
- **ESM-safe sync auto-register** (audit, codebase-wide): Copilot flagged that activesupport's sync `getFs()` / `getPath()` / `getChildProcess()` auto-register only works under CJS via `createRequire`. `generators/base.ts` and several commands use sync getters. Either eager-init in `bin.ts` or convert all callers to the async getter pattern. Pre-existing; same as open question #5.

### Actionpack prerequisites surfaced

- **`ActionController.Base.render` honor `template:` option** (~30–50 LOC). PWA/Welcome call `render({ template: "...", layout: false })` verbatim per Rails source, but current `abstract-controller/rendering.ts` falls through to implicit-render and returns empty 200. Also fix `renderAsync` path. Unblocks PWA/Welcome runtime + any future Rails port using `render template:`.
- **`metal.ts` `controllerPath()`** override semantics: current implementation ignores `_controllerPath`; subclasses must override the static method, not the field. Surprising and undocumented; tighten.
- **`verifyAuthenticityToken` auto-registration as before_action** on `ActionController.Base`: `skipBeforeAction("verifyAuthenticityToken")` calls in PWA/Welcome currently no-op (no entry to remove). The forgery-protection module exists at `packages/actionpack/src/action-controller/metal/request-forgery-protection.ts` but its `skipBeforeAction` call assumes a registered entry — verify the class-eval-time registration on `ActionController.Base`.
- **`request.local?` + `before_action :require_local!`** + `consider_all_requests_local` config (~50 LOC): unlocks unmirrored Rails-verbatim "remote requests forbidden" / "renders an error message when forbidden" / "allows local requests" `InfoController` tests.
- **Wire existing `RoutesInspector`** into `InfoController#matchingRoutes` (`packages/actionpack/src/action-dispatch/routing/inspector.ts` is shipped at 407 LOC). `info-controller.ts` currently no-ops the body. ~30 LOC wire + render-template-on-`query` branch.
- **`ActionDispatch::Request`** is shipped — swap `request.action_dispatch` notification payload from raw env to a Request wrapper (~20 LOC); update `Rack::Logger` tests.
- **Routing camelCase action keys:** Rails route `pwa#service_worker` won't dispatch — needs `pwa#serviceWorker` (per `feedback_camelcase_only`). Document in actionpack routing docs.
- **`define_generate_prefix` should use `name_for_action`-equivalent** (~20 LOC): apply `currentNamePrefix` + normalization so registered helper key matches Rails for nested-scope mounts.
- **`mount({ app, at, ... })` overload** (~40 LOC): support the Rails hash form so plan docs and engine-mounting code can write the idiomatic shape.
- **Port remaining 17 Rails `mapper_test.rb` tests** (~30 LOC): `dispatch/mapper_test.rb` is at 4/21 matched. Cover scope/anchor/via/format behavior tangential to `mount`.
- **Default middleware stack actionpack ctor alignment** (~150–250 LOC, per #2177): audit + fix `HostAuthorization(app, hosts, **kw)`, `Static(app, path, index:, headers:)`, `DebugExceptions(app, format)`, `ShowExceptions(app, exceptionsApp)` to accept Rails-shape positional + kwargs OR `.call`-able exceptions apps. Also drop the `_showExceptionsApp` wrapper in `default-middleware-stack.ts` once `ShowExceptions` accepts `.call`-ables.
- **Deferred middlewares (no actionpack equivalent yet, per #2177):** `Rack::{Sendfile,Cache,Lock,Runtime,Head,ConditionalGet,ETag,TempfileReaper,MethodOverride}`, `ActionDispatch::{Executor,Reloader}` (need `app.executor`/`app.reloader` from 2.5c), `Rails::Rack::{Logger,SilenceRequest}` wire-up, `ActiveRecord::Middleware::{DatabaseSelector,ShardSelector}`, `Flash` middleware class (only `FlashHash` exported), `PermissionsPolicy::Middleware`.

### Actionview / actionmailer / actioncable

- **`Application::Bootstrap`-style `:initialize_logger` upgrade** (~40 LOC): wrap logger in `TaggedLogging` + `BroadcastLogger`. Both already shipped at `packages/activesupport/src/{tagged-logging,broadcast-logger}.ts` — this is wiring only, not infrastructure. Blocked on `Application::Configuration` having `logFormatter` / `broadcastLogLevel`.
- **`config.cacheFormatVersion` in `:initialize_cache`** (~20 LOC): set `ActiveSupport.cacheFormatVersion`. Requires that field on activesupport's cache module.
- **`:initialize_error_reporter` initializer** (~30 LOC): once `ActiveSupport.error` / `Trails.error` exists.
- **`Notifications.instrumenter.buildHandle(name, payload)`** is already shipped (`packages/activesupport/src/notifications/fanout.ts`); `Rack::Logger` can emit Rails-shaped start/finish pairs now (~30 LOC wire-up only).

### Trailties code quality / fidelity

- **Async-fs rollout** — scoped into PR 1.12c (or its 1.12c-b split). Tracked there, not here. Note for the implementer: callers to convert are `migration-loader.ts`, `commands/destroy.ts`, `commands/console.ts`, `source-annotation-extractor.ts`, all of `generators/base.ts`.
- **Port 8 verbatim `Rails::Command::NotesTest` cases** (~120–150 LOC, test-only PR): into `source-annotation-extractor.test.ts`. Dropped from PR 1.4 to fit ceiling. Test names from `vendor/rails/railties/test/commands/notes_test.rb`.
- **`ParserExtractor` port** (unscheduled): AST-based extractor that skips notes inside string literals. Current trails port is regex-only. Likely a `typescript` compiler API pass over `.ts`/`.tsx`.
- **CodeStatistics polish** (small): ~15 LOC golden test of `toString()` exact column widths + alignment; ~10 LOC extend TS method regex to count bare class-method shorthand (with safe exclude list); ~5 LOC render `NaN` ratio like Rails when `code === 0`.
- **`BACKTRACE=1` bypass** (~30 LOC): once a trailties env adapter wrapper exists, restore the `ENV["BACKTRACE"]` bypass in `BacktraceCleaner.clean` / `cleanFrame` (hard rule 2 forbids `process.*`).
- **`.gitignore` append on key generation** (~15 LOC): Rails' `EncryptionKeyFileGenerator#ignore_key_file` appends the key path; `ensureKeyFile` currently writes the key without touching `.gitignore`.
- **`credentials:diff` subcommand** (~80 LOC): Rails enrolls/disenrolls the project in git diff filter and decrypts on `git diff`. Heavy git-plumbing; defer.
- **`Info` properties needing ported deps:** "Rack version", "JavaScript Runtime", "Middleware", "Database adapter", "Database schema version". User code can register via `Info.property(...)` today; pure parity gap.
- **`generate()` typing nit** (~5 LOC): `pendingGenerators ??= []` against an always-present field — drop the `??=` or mark field optional.
- **PathAdapter optional-method sweep:** other CLI commands using `getPath()` may have the same fallback bug `app.ts` fixed; audit.
- **`.ts` template files** for `app:template`: first-class support requires registering a `ts-node`/`tsx` ESM hook at launch.
- **`MigrationGenerator.generate` shell-out** (optional): needed to wire `add_migrations` into PR 1.14c-2 (authentication).
- **`Engine#allLoadPaths(addAutoloadPathsToLoadPath)` single-flag memoization** (per #2174): documented Rails-mirrored quirk — if both `true` and `false` are called in one process, cache returns wrong shape. Worth a JSDoc `@internal` flagging.
- **`Engine#config` cast smell** (per #2174): runtime `instanceof` + cast on `this._config`. Cleaner with a generic `_config<T extends Configuration>` field on `Trailtie`. Bundle into PR 2.1b when factoring `_perClassState`.

---

## Phase 3 — Deferred (not blocking)

### PR 3.5 — Browser adapters

**Node/TS fit:** straightforward — both adapters implement the same interfaces as the Node ones (`ProcessAdapter` / `FsAdapter`), bound to browser surfaces. Virtual-fs needs a per-session in-memory store (Map).

**Dependencies:** decide whether `crypto` / `child_process` adapters need browser variants too; `encryption-key-file-generator` calls `EncryptedFile.generateKey()` → `getCrypto()` sync — browser builds must pre-register webcrypto.

Browser `processAdapter` + virtual-fs `fsAdapter`, packaged as `@blazetrails/activesupport/browser` subpath export. Demo harness in `packages/website/`.

**New files:**

- `packages/activesupport/src/browser-process-adapter.ts`
- `packages/activesupport/src/browser-fs-adapter.ts`
- `packages/website/src/demo/`

**Files changed:** `packages/activesupport/package.json` — add `./browser` subpath export.

### PR 3.5b — Browser SQLite driver (~150 LOC)

**Blocked by:** none structurally — the `sqlite-adapter.ts` driver registry already exists and accepts plug-in drivers (`better-sqlite3`, `node-sqlite`, `expo-sqlite` ship today). Ships alongside or after PR 3.5 since both target the browser surface.

**Source:** new.

**Scope:**

- `packages/activesupport/src/sqlite-drivers/wa-sqlite.ts` (preferred — OPFS-backed, WASM) **or** `sql-js.ts` (simpler, in-memory only). Recommend `wa-sqlite` to match the OPFS persistence story Expo and Node drivers already provide.
- Register the new driver under the `./browser` subpath export added in PR 3.5 so `import "@blazetrails/activesupport/sqlite/wa-sqlite"` works in a browser bundle.
- Mirror the test surface in `sqlite-drivers/better-sqlite3.test.ts` — `run`/`get`/`all`/`iterate`/`columns`/`setReadBigInts`/`prepare`/`close`.

**Dependencies (runtime):** the chosen WASM lib is a peer dep of the consumer app, not of trails. Same pattern as `better-sqlite3`.

**Extends PR 1.14d-b's `--sqlite-driver` flag** to accept `wa-sqlite` as a fourth value (gated on browser-target detection — probably easiest as a separate `trails new --browser` mode rather than free composition).

### PR 3.6 — Relocate dev binaries to trailties

`trails-tsc` stays a standalone bin (tooling expects the executable name). The two dump bins fold into `trails` subcommands.

**Node/TS fit:** mechanical move + command registration. Verify CI workflow paths.

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

- **Primary signal:** `pnpm tsx scripts/api-compare/compare.ts --package trailties` (after `pnpm tsx scripts/api-compare/extract-ts-api.ts`). Tracks Ruby↔TS surface coverage; "misplaced" means tests exist but in the wrong file per Rails layout.
- **Generator regression signal:** `pnpm vitest run packages/trailties/src/generators` — every generator must pass its snapshot + `parseTs` + `assertNoRubySource` triple (per Hard rule 0).
- **Final acceptance:** PR 2.6's integration test passes — hello-world fixture imports `Trails`, calls `await Trails.application.initialize()`, serves a route through `actionpack`.

## Conventions for amending this doc

- When a PR ships, replace its "open" entry with a one-line "shipped (#NNNN)" header and fold any deferred work into the relevant followup section or into the next open PR's scope. Don't accumulate gravestones.
- New cross-cutting work that doesn't belong to a single PR goes under "Cross-cutting followups from merged PRs" with the smallest practical sizing estimate.
- Open questions get added to the table with a "Decide before" target PR; remove rows when the answer locks into "Decisions already made."
