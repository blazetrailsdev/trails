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
   Option B design. Per-generator tests must include (a) snapshot, (b)
   `parseTs`, (c) `assertNoRubySource`.
1. **No `node:*` imports** in `packages/trailties/src/` except `bin.ts`.
   Known exceptions pending cleanup: `commands/destroy.ts`,
   `generators/base.ts`, `source-annotation-extractor.ts` — scheduled
   for the async-fs rollout (see "Code quality" section).
2. **No `process.*` references** in `packages/trailties/src/` after PR 0.3.
   Enforced by ESLint via `blazetrails/no-process-bypass`. Use the
   `processAdapter` snapshot for `env` / `cwd` / `stdout`.
3. **Trailties code uses async fs only** (target state). Known sync
   callers: `generators/base.ts` (`createFile`, `appendToFile`,
   `insertIntoFile`, `fileExists`, `removeFile`), `commands/destroy.ts`,
   `commands/console.ts`, `source-annotation-extractor.ts`. Cleanup
   tracked under "Async-fs rollout" in the code quality section.
4. **No new third-party runtime deps in trailties.**
5. **PR size ceiling: 500 LOC** (CLAUDE.md). Splits use the `<base>` / `<base>b` pattern.
6. **Test names match Rails verbatim** where Rails has tests (CLAUDE.md).
7. **Every PR description** lists Rails source files referenced and which
   methods/initializers were intentionally skipped.

## Decisions already made

Implementers do not relitigate these. Propose a plan-doc change if you
think one is wrong.

### Naming

- Package: `trailties`. Base class: `Trailtie`. Per-framework files:
  `<package>/src/trailtie.ts`. Engine collection: `engine/trailties.ts`.
- `api:compare` rename map handles `Railtie` → `Trailtie` and the
  `railties/` → `trailties/` path-segment alias is global.

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

| Question                         | Answer                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Templates: EJS or `.tse`?        | `.tse` (codebase convention). `api:compare`'s `.erb` → `.tse` mapping handles paths.                    |
| `Trailtie` subclass registration | Explicit: `Trailtie.register(MyTrailtie)`. No `inherited` hook. Same for `Application.register(klass)`. |
| `config_for` config format       | TS/JS modules via dynamic `import()`. No YAML.                                                          |
| `processAdapter` `env` mutation  | Snapshot values are read-only by convention. `setEnv` is the only supported mutation path.              |
| Application root-flag file       | `config.ts`. `Application.findRoot` walks parents looking for it.                                       |
| `Engine` namespacing replacement | Explicit `tableNamePrefix` config option.                                                               |

### Decisions still open

| #   | Question                                                                                                                          | Decide before |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 5   | Convert remaining sync `readdir`/`readFile`/`writeFile` callers to async; promote optional `FsAdapter` async surface to required? | PR 1.12c      |
| 6   | Should `Engine#paths()` THROW (Rails-faithful) when `calledFrom` is unset? (Currently returns `Root(null)` per 2.2a/b deviation.) | PR 2.5c       |

**Resolved:** #8 (`--package-manager` flag, #2483), #9 (`--sqlite-driver` flag with `better-sqlite3` default, #2483).

---

## Boot chain completeness — current state

`api:compare` scores for the files that make up the app boot sequence.
**Target: 100% on every row before calling the boot chain "done".**

| File                                      | Score   | Key gaps                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trailtie.ts`                             | **84%** | 4 methods (see PR B1)                                                                                                                                                                                                                                                           |
| `trailtie/configurable.ts`                | **0%**  | `configure`, instance delegation (see PR B1)                                                                                                                                                                                                                                    |
| `trailtie/configuration.ts`               | **86%** | 2 methods (bundle into B1)                                                                                                                                                                                                                                                      |
| `engine/trailties.ts`                     | **33%** | `_all` public accessor, Engine subclass instantiation (see PR B1)                                                                                                                                                                                                               |
| `paths.ts`                                | **43%** | 16 missing: `first`/`last`/`<<`/`concat`/`unshift`/`toAry`/`extensions`/`existentDirectories`/`filesIn`/`autoloadOnce`/`eagerLoad`/`autoloadPaths`/`filterBy`/`absoluteCurrent` (see PR B2)                                                                                     |
| `engine.ts`                               | **39%** | `app`, `call`, `endpoint`, `envConfig`, `helpers`, `loadSeed`, `loadConsole`/`Runner`/`Tasks`/`Generators`/`Server`, `loadConfigInitializer`, `hasMigrations?`, `buildRequest`, `buildMiddleware` (PR B3)                                                                       |
| `application/configuration.ts`            | **73%** | `loadDefaults(version)`, `secretKeyBase`, `sessionStore`, `contentSecurityPolicy`, `permissionsPolicy`, `databaseConfiguration`, `annotations`, `colorizeLogging`, `defaultLogFile` (PR B4)                                                                                     |
| `application/finisher.ts`                 | **40%** | `FinisherHost` interface gaps; `add_generator_templates`, `define_main_app_helper`, `add_to_prepare_blocks`, `run_prepare_callbacks` (PR B5)                                                                                                                                    |
| `application/routes-reloader.ts`          | **59%** | `executeIfUpdated`, `updatedAt?`, `clear!`, `loadPaths`, `finalize!`, `revert`, `updater` (PR B5)                                                                                                                                                                               |
| `application/default-middleware-stack.ts` | **71%** | 2 methods (bundle into B5)                                                                                                                                                                                                                                                      |
| `application.ts`                          | **46%** | `envConfig` (30-key action_dispatch merge), `orderedRailties`, `railtiesInitializers`, `reloadRoutes!`/`reloadRoutesUnlessLoaded`, `messageVerifiers`, `deprecators`, `migrationRailties`, `toApp`, `buildRequest`, `buildMiddleware`, `runTasksBlocks`/etc. (PR B6, may split) |
| `engine/lazy-route-set.ts`                | **87%** | 2 methods (bundle into B3 or B5)                                                                                                                                                                                                                                                |

4 files at 100% omitted (`application/bootstrap.ts`, `engine/configuration.ts`,
`engine/updater.ts`, `initializable.ts`).

---

## Boot chain PRs

### PR B1 — Trailtie surface gaps (~150 LOC)

**Blocked by:** none.

**Source:** `vendor/rails/railties/lib/rails/railtie.rb`,
`vendor/rails/railties/lib/rails/railtie/configurable.rb`.

**Scope:**

- `trailtie.ts` — 4 missing methods. Read `api:compare` output to confirm names before implementing.
- `trailtie/configurable.ts` — `configure(block)` class method (Rails class-level DSL entry), instance delegation for `config` (the `Configurable` module exposes `config` via `method_missing` delegating to `instance.config`). Current file has `sealAgainstInheritance`/`assertNotSealed` (our sealed-subclass guard) but no matching of Rails' `configure` / instance surface — hence 0/2.
- `trailtie/configuration.ts` — 2 missing methods; bundle here.
- `engine/trailties.ts` — `_all` as public accessor; ensure `Trailties` constructor walks both `Trailtie.subclasses()` **and** `Engine.subclasses()` separately (Rails `Railties` includes both); add matching `initialize` semantics. Currently 1/3.

**Rails source methods to read first:**
`Railtie::Configurable#configure`, `Railtie#instance`, `Railties#initialize`.

### PR B2 — `Paths` completion (~150 LOC)

**Blocked by:** none.

**Source:** `vendor/rails/railties/lib/rails/paths.rb`.

**Current:** 12/28 matched. The Rails `Root` and `Path` classes together have
28 public methods; the TS port has the core path resolution but is missing the
collection/array-protocol surface.

**Missing (implement all):**

- `Path#first`, `Path#last` — delegate to the underlying glob-expanded array.
- `Path#<<(path)` — append to `@paths`; return `self`.
- `Path#concat(paths)` — batch append.
- `Path#unshift(path)` — prepend to `@paths`.
- `Path#toAry` / `Path#to_a` — expand to real filesystem paths (call `existent`).
- `Path#extensions` — unique extensions across globbed files.
- `Path#existentDirectories` — filter globbed results to dirs that exist on fs.
- `Path#filesIn(...)` — glob within this path for the given pattern.
- `Path#autoloadOnce` / `Path#eagerLoad` — flag methods (set the boolean,
  push `self` into the root's `autoloadOncePaths` / `eagerLoadPaths` sets).
- `Path#autoloadPaths` — alias/delegation to root's autoload set filtered to this path.
- `Root#filterBy(constraint)` — yield or return paths matching a condition.
- `Root#absoluteCurrent` — resolve relative path entries against cwd.

**Skip:** `eager_load!` (per "What we are NOT building" table).

### PR B3 — `Engine` completion (~200–250 LOC, may need B3b split)

**Blocked by:** PR B2 (`Paths` surface needed for `envConfig`/`helpers` method bodies).

**Source:** `vendor/rails/railties/lib/rails/engine.rb`.

**Current:** 14/36 matched.

**Scope:**

- `engine/lazy-route-set.ts` — 2 missing methods; bundle here.
- `Engine#app` — builds and memoizes the middleware stack:
  `defaultMiddlewareStack.buildStack; config.middleware.mergeInto(stack); stack.build`.
- `Engine#call(env)` — `buildRequest(env)` then `app.call(request.env)`.
  The `call` surface is what makes an Engine rack-mountable.
- `Engine#endpoint` — returns `config.middleware.isEmpty? ? routes : app`.
  (Class-level `endpoint` already exists for `config.action_controller.perform_caching`
  wiring; this is the instance-level one.)
- `Engine#envConfig` — merges `paths["public"].first` into the env hash;
  Rails adds `action_dispatch.asset_path`, `action_dispatch.routes` and a
  handful more from engine-level config. Read the Rails method carefully —
  it is simpler than `Application#envConfig`.
- `Engine#helpers` — aggregates `ActionController::Base.helpers` +
  `helperModulesFrom(helpersPaths)`. Skip the module-eval parts; return
  the module list.
- `Engine#loadSeed` — reads `db/seeds` path and evals/imports it.
- `Engine#loadConsole(binding?)`, `#loadRunner(runner)`, `#loadTasks`,
  `#loadGenerators`, `#loadServer(server)` — each calls the corresponding
  railtie method. Implement as no-op stubs with `@internal` JSDoc unless
  a real consumer exists in the package.
- `Engine#loadConfigInitializer(initializer)` — loads a single initializer
  from the initializers path. Reads the file and calls `eval`/`import`.
- `Engine#hasMigrations?` — checks `paths["db/migrate"].existentDirectories`.
- `Engine#buildRequest(env)` — `ActionDispatch::Request.new(env)`.
- `Engine#buildMiddleware` — wrapper over `ActionDispatch::MiddlewareStack.new`.
- `Engine#eagerLoad!` — skip (per table), add `@internal` placeholder.

**Split trigger:** if B3 > 280 LOC after writing stubs, move `loadConsole`/
`loadRunner`/`loadTasks`/`loadGenerators`/`loadServer`/`loadSeed` into PR B3b.

### PR B4 — `Application::Configuration` completion (~200–250 LOC, likely needs B4b split)

**Blocked by:** none (can parallel with B3).

**Source:** `vendor/rails/railties/lib/rails/application/configuration.rb`.

**Current:** 87/120 matched (73%).

**Key missing pieces:**

- `loadDefaults(version)` — the large `case target_version` dispatch from
  5.0 → 8.0+. Each case sets per-framework defaults by writing onto
  `config.activeRecord.*`, `config.actionController.*`, etc. Implement the
  8.0 case fully; stub older versions with a comment pointing at the Rails
  source. This is the most LOC-heavy item; may need to be B4b on its own.
- `secretKeyBase` getter — reads `ENV["SECRET_KEY_BASE"]` via `processAdapter.env`,
  falls back to `credentials.secretKeyBase`. Setter stores on the instance.
- `sessionStore` / `sessionStore?` — getter/setter pair; `sessionStore?` returns
  whether a non-default store is configured.
- `contentSecurityPolicy` — DSL block setter analogous to `config.action_dispatch.content_security_policy`.
- `permissionsPolicy` — same pattern as CSP.
- `databaseConfiguration` — reads the database config module (`config_for(:database)`).
- `annotations` — `SourceAnnotationExtractor::Annotations` config block.
- `colorizeLogging` / `colorizeLogging=` — flag for `ActiveSupport::LogSubscriber`.
- `defaultLogFile` — path to `log/<env>.log`.
- `paths()` override — Rails `Application::Configuration#paths` adds
  `app/mailers`, `app/javascript`, `public`, `public/javascripts`,
  `public/stylesheets`, `tmp`, `log/<env>.log` beyond what Engine adds.
  The TS port only adds `public`; add the rest.

**Split:** if `loadDefaults` alone hits ~150 LOC, move it into B4b.

### PR B5 — `Application::Finisher` + `RoutesReloader` gaps (~200 LOC)

**Blocked by:** B3 (`RoutesReloader` depends on `Engine#routes` surface,
`Finisher` depends on middleware stack being buildable).

**Source:** `vendor/rails/railties/lib/rails/application/finisher.rb`,
`vendor/rails/railties/lib/rails/application/routes_reloader.rb`.

**Finisher current:** 2/5 matched. Missing:

- `FinisherHost` interface — `add_generator_templates`, `define_main_app_helper`,
  `add_to_prepare_blocks`, `run_prepare_callbacks` initializers. The api:compare
  gap is likely that these initializers exist in the TS file but the host
  interface type exported from the module doesn't declare them, so they
  don't match the Ruby public surface.

**RoutesReloader current:** 10/17 matched. Missing:

- `executeIfUpdated` — calls `updater.execute_if_updated`.
- `updatedAt?` — delegates to `updater.updated?`.
- `clear!` — calls `routeSets.each(&:clear!)`.
- `loadPaths` — returns the concatenated path entries.
- `finalize!` — freezes route sets.
- `revert` — rolls back to the snapshot route state.
- `updater` — constructs a `FileUpdateChecker` over `paths`. Because
  `FileUpdateChecker` is not ported (Zeitwerk-territory), stub `updater`
  as a no-op object that always reports `updated? = true` and note it as
  a known deviation in the PR description.

**DefaultMiddlewareStack current:** 5/7 matched — 2 methods. Bundle here.

### PR B6 — `Application` completion (~250 LOC, may need B6b)

**Blocked by:** B3 (engine middleware), B4 (`secretKeyBase`, `sessionStore`,
`databaseConfiguration`), B5 (finisher + routes-reloader hooks).

**Source:** `vendor/rails/railties/lib/rails/application.rb`.

**Current:** 28/61 matched (46%).

**Key missing pieces:**

- `envConfig` — the large method that merges ~30 `action_dispatch.*` Rack
  env keys: `parameter_filter`, `secret_key_base`, `key_generator`,
  `http_auth_salt`, `signed_cookie_salt`, `encrypted_cookie_salt`,
  `encrypted_signed_cookie_salt`, `authenticated_encrypted_cookie_salt`,
  `action_dispatch.show_exceptions`, CSP config, cookie config, etc.
  Read `vendor/rails/railties/lib/rails/application.rb#env_config` in full.
- `orderedRailties` — respects `config.railtiesOrder`; partitions the
  registered railtie list around the `Trails::Application` sentinel.
- `railtiesInitializers` — calls `orderedRailties.flatMap(&:initializers)`.
- `reloadRoutes!` — calls `routesReloader.reload!`.
- `reloadRoutesUnlessLoaded` — calls `routesReloader.reloadUnlessLoaded`.
- `messageVerifiers` — `ActiveSupport::MessageVerifiers` instance memoized
  on the application; keyed by purpose string.
- `deprecators` — `ActiveSupport::Deprecation::Deprecators` proxy over
  all registered framework deprecators. Read `vendor/rails/activesupport/lib/active_support/deprecation/deprecators.rb`.
- `migrationRailties` — railtie list filtered to those with migrations.
- `toApp` — builds and returns the rack app (`endpoint`). Called by Rack.
- `buildRequest(env)`, `buildMiddleware` — same shape as Engine, but
  Application-scoped.
- `runTasksBlocks(app)`, `runConsoleBlocks(app)`, `runRunnerBlocks(app)`,
  `runGeneratorBlocks(app)` — iterate registered `toRun` blocks. Stub if
  no real consumer yet.
- `create(initializer?)` — class method; instantiates and `register`s the
  app instance, optionally calls the block.

**Split trigger:** if `envConfig` + `orderedRailties` + `deprecators` > 200 LOC,
move `runTasksBlocks`/`runConsoleBlocks`/etc. and `create` into B6b.

---

## Framework railtie wiring followups

These are NOT boot-chain blockers but are required for full initializer
fidelity. Do after B1–B6.

### Activerecord trailtie followups

- `active_record.postgresql_time_zone_aware_types`, `active_record.logger`,
  `active_record.backtrace_cleaner` — wire via `activesupport.onLoad`.
- `active_record.set_filter_attributes` — needs `Application.config.filterParameters` slot (B4).
- `active_record.set_signed_id_verifier_secret` — blocked on `Application.secretKeyBase` (B4).
- `active_record.clear_active_connections`, `active_record.log_runtime`.
- `active_record.copy_schema_cache_config`, `active_record.sqlite3_adapter_strict_strings_by_default`.
- `active_record_encryption.configuration`, `active_record.query_log_tags_config`.
- `active_record.set_configs` setter-dispatch loop.

### Action-controller trailtie followups

- `action_controller.assets_config` — needs `paths["public"]` (B2/B3).
- `action_controller.set_helpers_path` — needs `helpers_paths` (B3).
- `action_controller.parameters_config` — blocked on `ActionController::Parameters` port.
- `action_controller.set_configs`, `compile_config_methods`, `request_forgery_protection`.

### Actionview trailtie followups

Wire `action_view.logger`, `action_view.caching`, `action_view.setup_action_pack`,
`action_view.collection_caching` + 9 `config.after_initialize` blocks. Bundle
when 3–4 target helpers gain the required setter surface.

### Cross-package trailtie migration

- Migrate AR + actionpack `trailtie.ts` files from `extends BaseRailtie from
"@blazetrails/activesupport"` to `@blazetrails/trailties` `Trailtie`;
  delete `packages/activesupport/src/railtie.ts`. Blocked on B1.

---

## Activesupport wiring followups (needed for full boot)

- **Bootstrap `:initialize_logger` upgrade** — wrap logger in `TaggedLogging`
  \+ `BroadcastLogger`. Both shipped; wiring only. Blocked on B4
  (`logFormatter` / `broadcastLogLevel` in `Application::Configuration`).
- **`:initialize_cache` `cacheFormatVersion`** — set `ActiveSupport.cacheFormatVersion`.
  Requires the field on activesupport's cache module (~20 LOC).
- **`:initialize_error_reporter` initializer** — once `ActiveSupport.error` /
  `Trails.error` exists (~30 LOC).
- **GCM in `MessageEncryptor`** (~150 LOC): flip `EncryptedFile.CIPHER` to
  `aes-128-gcm`. `crypto-adapter.ts` already exposes optional `getAuthTag()`.
- **`ActiveSupport::Messages::Codec` port** (~250 LOC): `Codec.with(default_serializer:)`
  global flip. Some infrastructure already exists at `packages/activesupport/src/messages/`.

---

## Actionpack prerequisites

These block the middleware stack from functioning correctly (needed for B3/B6).

- **`ActionController.Base.render` honor `template:` option** (~30–50 LOC):
  PWA/Welcome use `render({ template: "...", layout: false })` but current
  `abstract-controller/rendering.ts` returns empty 200.
- **Default middleware stack ctor alignment** (~150–250 LOC, per #2177):
  `HostAuthorization`, `Static`, `DebugExceptions`, `ShowExceptions` need
  Rails-shape positional + kwargs. Required for `Application#app` to return
  a callable stack.
- **Deferred middlewares** (no actionpack equivalent yet): `Rack::{Sendfile,
Cache,Lock,Runtime,Head,ConditionalGet,ETag,TempfileReaper,MethodOverride}`,
  `ActionDispatch::{Executor,Reloader}`, `Flash` middleware,
  `PermissionsPolicy::Middleware`.

---

## Generators (deprioritized)

Template-builder infra and all generator migrations are lower priority than
the boot chain. Do not open generator PRs while B1–B6 are in flight.

### Still open

- **PR 1.10c** — Trails-native template DSL: `pkg`, `route`, `environment`, `initializer` DSL actions on `GeneratorBase` (~150–250 LOC). Blocked by T1.

---

## Code quality / fidelity followups

Non-blocking; bundle into boot-chain PRs when ceiling permits.

- **Port 8 verbatim `Rails::Command::NotesTest` cases** (~120–150 LOC, test-only):
  into `source-annotation-extractor.test.ts`.
- **`BACKTRACE=1` bypass** (~30 LOC): once a trailties env adapter wrapper
  exists, restore `BacktraceCleaner.clean` / `cleanFrame`.
- **`.gitignore` append on key generation** (~15 LOC): `ensureKeyFile` should
  append the key path.
- **Async-fs rollout** (~50 LOC): callers to convert: `migration-loader.ts`,
  `commands/destroy.ts`, `commands/console.ts`, `source-annotation-extractor.ts`,
  all of `generators/base.ts`.
- **CodeStatistics polish** (~30 LOC): golden test of `toString()` column widths;
  extend TS method regex for bare class-method shorthand.
- **`Info` properties needing ported deps:** "Rack version", "JavaScript Runtime",
  "Middleware", "Database adapter", "Database schema version".
- **`Engine#allLoadPaths(addAutoloadPathsToLoadPath)` single-flag memoization**:
  documented Rails-mirrored quirk — add `@internal` JSDoc.

---

## Tracking

- **Primary signal:** `bash scripts/api-compare/run.sh --package trailties`.
  Target: all boot-chain files at 100%.
- **Final acceptance:** integration test passes — hello-world fixture imports
  `Trails`, calls `await Trails.application.initialize()`, serves a route
  through `actionpack`.

## Conventions for amending this doc

- When a PR ships, replace its "open" entry with a one-line "shipped (#NNNN)"
  header and fold any deferred work into the relevant followup section.
  Don't accumulate gravestones.
- New cross-cutting work goes under the relevant followup section with the
  smallest practical sizing estimate.
- Open questions get added to the table with a "Decide before" target PR;
  remove rows when the answer locks into "Decisions already made."
