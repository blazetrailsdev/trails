# trailties — Claude guide

Rules that bind only inside `packages/trailties` (the Rails railties port) and
`packages/thor` (the Thor port, `@blazetrails/thor`, whose rules stay here). The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md), which keeps every heading below as a pointer so
code citations of the form `CLAUDE.md, "Section title"` resolve. The
alternatives tried for each decision are in
[docs/claude-md-decision-history.md](../../docs/claude-md-decision-history.md).

## Thor commands register through an explicit `methodAdded`

Thor registers a command whenever the VM fires `method_added` for a public
`def` (`vendor/thor/v1.3.2/lib/thor/base.rb:729-745`). `Thor.create_command`
(`vendor/thor/v1.3.2/lib/thor.rb:560-583`) consumes the pending `@usage` /
`@desc` / `@method_options` the preceding `desc` / `method_option` calls set,
and clears them. `inherited` (`base.rb:721-725`) registers every subclass in
`Thor::Base.subclasses` the moment it is defined.

JS has no hook when a method is defined, and none when a class is. A class's
`static {}` block runs after every prototype method exists. **The settled shape
is that the class body fires the hook itself, where Ruby's `def` would be:**

```ts
class MyScript extends Thor {
  static {
    this.desc("zoo", "zoo around");
    this.methodAdded("zoo");
    this.noCommands(() => this.methodAdded("helper"));
  }
  zoo() {}
  helper() {}
}
```

`methodAdded` is Thor's own `method_added`, ported line for line, so
`create_command` still consumes the pending `desc` state in declaration order.
Three consequences follow, and they are ratified here:

- **A Thor-private method is one that is never registered.** trails has no
  run-time visibility to read (root § "Method visibility is compile-time
  only"), so `rbModPublicMethodDefined` answers "defined" and the registration
  itself is the mechanism: a TS-`private` / `protected` method is not passed to
  `methodAdded`. `public_command` (`base.rb:606-611`) re-exposes the parent's
  method on the subclass prototype and calls `methodAdded`.
- **`no_commands` is ported verbatim** over `NestedContext` (`base.rb:530-542`).
  The `blazetrails/thor-command-registration` lint rule enforces the public
  half: every public method of a Thor class is either passed to `methodAdded`
  or declared inside `noCommands`, so a forgotten command cannot pass as a
  helper.
- **`inherited` is deferred.** Its `@no_commands = 0` is the own-property memo
  guard (root § "`inherited` is deferred to own-property memo guards").
  `register_klass_file` runs from `methodAdded`, where Thor also calls it
  (`base.rb:744`), and from `namespace(name)` when a namespace is set
  explicitly — a call Thor's `namespace` does not make, carrying an
  `@inventedArm registerKlassFile — PERMANENT` receipt. The one observable
  difference from Ruby is that a Thor subclass with no command and no explicit
  namespace is absent from `Thor::Base.subclasses`.

`register_klass_file`'s `caller`-file arm feeds only `subclass_files`, whose
one reader is the unported `Thor::Runner`; it is a scoped skip in
`scripts/parity/conventions.ts`.

This is a genuine language shortcoming, ratified repo-wide here. A new Thor
class is not a new decision to argue.

## Thor dispatch is async

Thor runs synchronously end to end: `Thor::Base.start`
(`vendor/thor/v1.3.2/lib/thor/base.rb:582-594`) → `dispatch` → `invoke_command`
(`vendor/thor/v1.3.2/lib/thor/invocation.rb:122-129`) → `Command#run`
(`vendor/thor/v1.3.2/lib/thor/command.rb:21-38`) → the command method, each
returning its value in line.

In trails three leaves of that tree need a promise: reading a line
(`$stdin.gets` behind `LineEditor#readline`), the file actions (the async
`getFs()` adapter the website's in-memory fs needs), and shell-outs (`system`).
A command body that awaits one returns a promise, and everything above it
follows. **The settled cascade is:**

`LineEditor#readline` → `ask` / `yes?` / `no?` / `file_collision` →
`CreateFile#force_on_collision?` → `on_conflict_behavior` → `invoke!` →
`action` → every `Thor::Actions` method → every command body → `Command#run` →
`invoke_command` / `invoke_all` / `invoke` / `invoke_with_padding` →
`dispatch` → `start`.

Three rules bound it:

- **`invoke_all` awaits each command in order.** Ruby's
  `all_commands.map { |_, command| invoke_command(command) }`
  (`invocation.rb:133-135`) is sequential, so the port is a `for` loop that
  awaits each `invokeCommand` before the next. A `Promise.all` would run a
  generator's steps concurrently.
- **Block-scoped state restores when the block's promise settles.** `inside`,
  `with_padding`, `mute`, `indent`, `with_output_buffer` and `FileUtils.cd` are
  `set; yield; ensure restore` in Ruby. Their ports go through `rbEnsure`, which
  defers the restore to the promise's settle.
- **Constructors stay synchronous.** `Thor::Base#initialize` (`base.rb:53-113`)
  and the `Invocation`, `Shell` and `Actions` initializers do no I/O, and a JS
  constructor cannot await.

This is a genuine language shortcoming, ratified repo-wide here: JS has no
synchronous await. A Thor method on the cascade returning a promise where Thor
returns a value is the designed shape, and a new command is not a new decision
to argue.

## Server blocks are awaited

Rails runs `server` blocks synchronously: `config.ru` calls
`Rails.application.load_server` (`railties/lib/rails/engine.rb:485-488`), which
calls `run_server_blocks`. `Rails::Railtie#run_server_blocks`
(`railtie.rb:288-290`) yields each registered block in turn, and
`Rails::Application#run_server_blocks` (`application.rb:586-589`) runs every
railtie's before its own. A block's I/O blocks the thread, so the server binds
only after every block has returned.

In trails a block that does I/O returns a promise. Dropping it would bind the
server before the block finishes and turn its failure into an unhandled
rejection. **The settled cascade is:**

`Trailtie#runServerBlocks` → `Application#runServerBlocks` →
`Engine#loadServer` → `trails server`.

Two rules bound it:

- **Each block is awaited before the next.** Ruby's `each` is sequential, so
  the port is a `for` loop, never `Promise.all`; railties' blocks settle before
  the application's.
- **`console` blocks are awaited the same way.** ActiveRecord's block
  `require`s `console_sandbox` (`active_record/railtie.rb:63-74`), an awaited
  `import()`, so `Engine#loadConsole` is async and `Console#start` awaits the
  load its constructor started. `runner` and `generators` blocks have no async
  caller yet; widening them is its own decision when one appears.

`trails server` reaches the blocks through `config.ts`, as Rails reaches them
through `config.ru` (`server_command.rb:32-41`): `Server#start` is `super()`,
`Rackup::Server#app` awaits `Builder.parseFile("config.ts")`, and the generated
`config.ts` awaits `loadServer()` before the handler binds. The blocks run
exactly once.

This is a genuine language shortcoming, ratified here: JS has no synchronous
await. A server-block runner returning a promise is the designed shape.

## The application loader is Zeitwerk (`Rails.autoloaders`)

RFC 0213 reversed the "no autoloader" ruling: Zeitwerk is vendored and ported,
and `Trails.autoloaders` holds `main` and `once`
(`railties/lib/rails/autoloaders.rb`). The directory scan is gone.

**Boot order.** Lookup is synchronous and a load is not, so `setup_main_autoloader`
and `setup_once_autoloader` each end with an awaited `eagerLoad`, whatever
`config.eager_load` says. `config.eager_load` keeps its Rails meaning for the
`eager_load!` initializer (`railties/lib/rails/application/finisher.rb:76-90`).
Reading a constant under a `do_not_eager_load` path raises `NameError` until
`await loader.loadFile(path)` runs. For the same reason, `eager_load!`'s
`after_class_unload` hook sits outside Rails' `config.eager_load` guard
(`finisher.rb:83-87`), so a reload eager loads whatever that setting says
(RFC 0213 § "Reload").

**File layout is a contract.** A file's path names its constant, and the file
exports that constant by name: `app/models/admin/user.ts` exports `User`, seated
as `Admin::User`. A default export has no constant name to check, and a file that
does not define its constant raises Zeitwerk's "expected file … to define
constant …". Two classes in one file, or a class under another name, fail at boot.

**`on_load` does what `inherited` did.** The loader seats the constant. The
finisher's `_registerAutoloaded` registers a loaded model with
`DescendantsTracker` and runs `ActionController::Railties::Helpers.inherited`
for a controller, superclass first, since JS has no hook at `extends`. No
own-property guard can stand in: nothing runs on an empty subclass, and
`Helpers.inherited` is async where `_helpers` is a sync read. Ruled by the operator on 2026-11-02.

**`autoload_lib` follows `Application.register`.** It is async (`Loader#ignore`
is) and a `static {}` block cannot await, so `trails new` emits it as a top-level
`await` in `config/application.ts`.

It is about the application loader only: framework-internal call-time constant
resolution is root § "Call-time constant resolution".

## A package-shipped engine's root is its package root (`Engine.find_root`)

Rails' `Engine.find_root` (`vendor/rails/v8.0.2/railties/lib/rails/engine.rb:375-377`)
is `find_root_with_flag "lib", from`: it walks up from `called_from` to the
first directory holding `lib/`, which for a gem is the gem's root. An npm
package has `src/` and `dist/`, never `lib/`, so the walk from an engine's
`dist/` either finds nothing and raises, or, under `node_modules`, climbs into
the host application and takes the application's `lib/` for the engine's root.

**`Engine.findRoot` stops at the nearest ancestor holding `lib/` or
`package.json`**: a `lib/` there is Rails' answer, and a `package.json` with no
`lib/` is the package root. Anything else falls through to Rails'
`findRootWithFlag("lib", from)` and its error. An engine registers with
`Engine.register(this, import.meta.dirname)`, the `called_from` Rails reads off
`caller_locations` (`engine.rb:354-366`). A per-engine `findRoot` override was
rejected because every package-shipped engine would carry the same one.

This is a genuine runtime difference, ruled by the operator on 2026-10-23
(trails#9280). `findRoot` carries `@inventedArm loop` / `if — PERMANENT`
against this section.

## `Rails::Command::Base.inherited` runs at a subclass's first `methodAdded`

`Base.inherited` adds a named subclass not ending in `Base` to
`Rails::Command.subclasses`
(`vendor/rails/v8.0.2/railties/lib/rails/command/base.rb:59-65`). JS has no hook
at `extends` (CLAUDE.md § "`inherited` is deferred to own-property memo guards"),
so `Base.methodAdded` seats the class the first time it adds a command, and
`Base.namespace(name)` seats it when it names its namespace, both with
`inherited`'s guard. That second seat registers a class that defines no command
of its own (`RakeCommand` calls `namespace "rake"`,
`vendor/rails/v8.0.2/railties/lib/rails/commands/rake/rake_command.rb`) and
answers through `printing_commands` / `perform`. A subclass that does neither is
never seated, which loses nothing: `find_by_namespace` has nothing to dispatch.

## `TestUnitReporter` has no `Minitest::StatisticsReporter` superclass (`test_unit/reporter.rb:7`)

`trails test` hands off to Vitest (RFC 0212 open question 1, trails#9567), so
`Rails::TestUnitReporter < Minitest::StatisticsReporter`
(`vendor/rails/v8.0.2/railties/lib/rails/test_unit/reporter.rb:7`) has no
superclass here, and its `super` calls have nothing to reach.
`test-unit/vitest-reporter.ts` is the sole reporter of a `trails test` run. Its
`VitestReporter` stands in for Minitest's reporter calls, and carries the
`@noRailsEquivalent PERMANENT` receipt against this section.

Vitest reports no assertion count or Minitest timing, so the adapter's closing
`N runs, N failures, N errors, N skips` line is `Minitest::SummaryReporter`'s
summary as far as Vitest allows, built from the results it recorded. The
`executable` default is `bin/trails test`, where `reporter.rb:9` says
`bin/trails test`, because generated applications ship `bin/trails`.

## `SourceAnnotationExtractor.enumerate` is async (`begin require "prism"`)

`source_annotation_extractor.rb:3-9` requires Prism at load, rescuing
`LoadError`. ESM has no synchronous `require` for an optional peer, and a
top-level `await` is barred from a package's root import graph
(`scripts/test-deps/yaml-optional-dependency.test.ts`), so `enumerate` awaits
the `typescript` import, the shape of § "An adapter file is loaded by an awaited
step" in the root `CLAUDE.md`.

## `runner` evaluates its code argument (`RunnerCommand#perform`'s `eval`)

`RunnerCommand#perform` evals a code string or stdin at `TOPLEVEL_BINDING`
(`vendor/rails/v8.0.2/railties/lib/rails/commands/runner/runner_command.rb:37,48`).
JS has no such binding, so `evalToplevel` in `commands/runner.ts` builds a
sloppy-mode async function with `with (TopLevel)`, where constants resolve.
Root § "Templates are precompiled" keeps eval out of what serves production; a
CLI command evaluating the string its own operator passed is not that. Ruled by
the operator on 2026-11-02 (trails#9630).

## A `require` in the `Application` class body runs after the class (`add_to_config`)

Ruby's class body is ordinary code, so `add_to_config`
(`vendor/rails/v8.0.2/railties/test/isolation/abstract_unit.rb`) can put a
`require "foo"` there (`test/application/initializers/load_path_test.rb:27-43`),
and it resolves because `Application.inherited` has already run
`add_lib_to_load_path!` (`railties/lib/rails/application.rb`). The generated
`config/application.ts` holds its configuration in a `static {}` block, which
cannot `await`, and `Kernel.require` is an awaited step (root § "An adapter
file is loaded by an awaited step"). So `addToConfig` inserts a string that awaits at
module top level directly after the class, before `autoloadLib` (the
template's first top-level `await`): the same point
in load order, after `Application.register` has put `lib` on `LOAD_PATH`. Such
a string has no `this` and imports what it names with `await import(...)`. A
string that does not await goes into the `static {}` block, as before.

## `method_missing` definers in this package

Class-specific rules under root § "Ruby protocol methods with a different JS
mechanism"; its cross-table rules and
[docs/method-missing-definers.md](../../docs/method-missing-definers.md) apply too.

- `rails/engine/lazy_route_set.rb`'s `method_missing_module` is spliced beneath
  the generated url-helpers module in `LazyRouteSet#generateUrlHelpers`, since
  `include()` copies a module's methods into each includer and a Proxy on the
  module itself would reach no includer. That row is not converged: the reload
  is async, so `respondToMissing` starts it and answers `super`, the in-line
  re-send is unported, and test_help's integration `before_setup` awaits the
  reload — debt tracked by `lazy-route-set-method-missing-resends-in-line`.
