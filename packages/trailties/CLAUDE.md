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
- **The other block kinds stay synchronous.** `console`, `runner`, `generators`
  and `rake_tasks` blocks have no async caller yet; widening them is its own
  decision when one appears.

`trails server` calls `app.loadServer()` itself, after `log_to_stdout` and
before it binds, which is where Rails reaches it through `config.ru`
(`server_command.rb:32-41`). `trails server` never evaluates `config.ts`, so
the generated `config.ts`'s own `loadServer()` runs only under another rackup
host, and each path runs the blocks exactly once. When
`port-server-command-onto-rails-command-base` builds the app from `config.ts`,
the direct call in `commands/server.ts` goes, or blocks run twice.

This is a genuine language shortcoming, ratified here: JS has no synchronous
await. A server-block runner returning a promise is the designed shape.

## Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)

RFC 0213 reversed the original ruling: Zeitwerk is vendored and ported, and
`Trails.autoloaders` holds `main` and `once` (`railties/lib/rails/autoloaders.rb`).
Each setup initializer is followed by an awaited `eagerLoad`.

The eager directory scan in `trailties/src/application/finisher.ts`
(`loadAppClasses` / `collectAppClasses`) still runs beside the loaders until
`trailties-app-scan-retires` deletes it and rewrites this section.

**`app/views` is not an autoload root.** Rails' `app` glob
(`railties/lib/rails/engine/configuration.rb:76-78`) reaches it because `.erb` is
not `.rb`; a template built `--in-place` leaves a `.js` module that Zeitwerk's
`ruby?` would read as code. So the `app` path excludes `views` and
`views/concerns`, as it excludes `assets`. Decided in review on trails#9603, not a repo-owner ruling.

**A scanned app class registers through its package's `registerX`.** Every
framework base an app subclasses has one, beside the base class:
`registerModel` (`activerecord/src/associations.ts`), `registerController`
(`actionpack/src/action-controller/base.ts`), `registerJob`
(`activejob/src/base.ts`), `registerChannel`
(`actioncable/src/channel/base.ts`) and `registerConnection`
(`actioncable/src/connection/base.ts`). Each takes `(klass)`, `(name, klass)`
or `(klasses[])`, checks the base with `rbClassInheritedP` and raises
`ArgumentError` on a mismatch, and seats the class under `klass.name` plus
`rbModName`. A directory prefix goes through `(name, klass)`. A new scanned
directory (mailers, an engine's `app/` dirs) adds a `registerX` in the package
that owns the base, tagged `@noRailsEquivalent PERMANENT` citing this section,
and never a bare `registerConstant` or a `mod[camelize(filename)]` lookup in the
finisher. Ruled by the repo owner on 2026-10-26 (trails#9319). The last
exception, `loadControllers`' file-name selection and its `controllerConstants`
map, converged under `load-controllers-shares-collect-constants`. A reader
reaches a registered class by asking its `registerX` registry, not through
`constantize`; route dispatch's `controller_class_for` `constantize` is debt
under root CLAUDE.md § "Constant lookup is an import or a registry"
(2026-10-28).

As a consequence:

- The finisher's `eager_load!` initializer runs only its portable arms. The three
  Zeitwerk calls carry `@missingRailsCall … — CONVERGEABLE` receipts.
- `Trails.autoloaders` now runs beside this scan, each setup initializer
  followed by an awaited `eagerLoad` (RFC 0213), and its `on_load` calls
  `registerX`; `trailties-app-scan-retires` deletes the scan and rewrites this
  section.
- There is no class-unload re-eager-load, or `autoload_lib` line emitted by
  `trails new`.

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

This is a genuine runtime difference, ruled by the repo owner on 2026-10-23
(trails#9280). `findRoot` carries `@inventedArm loop` / `if — PERMANENT`
against this section.

## `Rails::Command::Base.inherited` runs at a subclass's first `methodAdded`

`Base.inherited` adds a named subclass not ending in `Base` to
`Rails::Command.subclasses`
(`vendor/rails/v8.0.2/railties/lib/rails/command/base.rb:59-65`). JS has no hook
at `extends` (CLAUDE.md § "`inherited` is deferred to own-property memo guards"),
so `Base.methodAdded` seats the class the first time it adds a command, with
`inherited`'s guard. A subclass with no command is never seated, which loses
nothing: `find_by_namespace` needs a command to dispatch.
