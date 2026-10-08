# trailties — Claude guide

Rules that bind only inside `packages/trailties` (the Rails railties port and the
Thor port under `src/thor/`). The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md), which keeps every heading below as a pointer so
code citations of the form `CLAUDE.md, "Section title"` resolve.

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

- **A Thor-private method is one that is never registered.** Ruby's
  `method_added` fires for a private `def` too and `public_method_defined?`
  drops it. trails has no run-time visibility to read (§ "Method visibility is
  compile-time only"), so `rbModPublicMethodDefined` answers "defined" and the
  registration itself is the mechanism: a TS-`private` / `protected` method is
  not passed to `methodAdded`. `public_command` (`base.rb:606-611`) re-exposes
  the parent's method on the subclass prototype and calls `methodAdded`, as its
  `class_eval "def ..."` fires `method_added`.
- **`no_commands` is ported verbatim** over `NestedContext`
  (`base.rb:530-542`), and a helper is declared the way Ruby declares one. The
  `blazetrails/thor-command-registration` lint rule enforces the public half: every
  public method of a Thor class is either passed to `methodAdded` or declared
  inside `noCommands`, so a forgotten command cannot pass as a helper.
- **`inherited` is deferred.** Its `@no_commands = 0` is the own-property memo
  guard (§ "`inherited` is deferred to own-property memo guards").
  `register_klass_file` runs from `methodAdded`, where Thor also calls it
  (`base.rb:744`), and from `namespace(name)` when a namespace is set
  explicitly, a call Thor's `namespace` does not make and which carries an
  `@inventedArm registerKlassFile — PERMANENT` receipt. The one observable
  difference from Ruby is that a Thor subclass with no command and no explicit
  namespace is absent from `Thor::Base.subclasses`.

The alternatives lose:

- **Scanning the prototype** at first `commands` read cannot interleave with
  `desc`: every method exists before any `static {}` runs, so the pending
  `@usage` / `@desc` would attach to the wrong method, and `Thor::Group`'s
  definition order (`group.rb:263-266`) and `invoke_from_option`'s
  declaration-point command would be lost.
- **`desc(name, usage, description)`**, naming the command, changes a
  Rails-facing arity, and `desc for:` already means "amend an existing command".
- **A decorator per command** (`@desc("zoo", "zoo around") zoo() {}`) replaces
  Thor's DSL with one no Rails generator body is written in.
- **Treating an unregistered public method as an implicit non-command** leaves
  nothing to tell a forgotten command from a helper.
- **A registration step per class** (`MyScript.register()`) for `inherited` is
  invented surface on every Thor class, the same shape § "`inherited` is
  deferred" rejects for models.

`register_klass_file`'s `caller`-file arm feeds only `subclass_files`, whose
one reader is the unported `Thor::Runner`; it is a scoped skip in
`scripts/parity/conventions.ts`.

This is a genuine language shortcoming, ratified repo-wide here. A new Thor
class is not a new decision to argue.

## Thor dispatch is async

Thor runs synchronously end to end: `Thor::Base.start`
(`vendor/thor/v1.3.2/lib/thor/base.rb:582-594`) calls `dispatch`, which builds
the instance and calls `invoke_command`
(`vendor/thor/v1.3.2/lib/thor/invocation.rb:122-129`), which calls
`Command#run` (`vendor/thor/v1.3.2/lib/thor/command.rb:21-38`), which sends
the command method. Every step returns its value in line.

In trails three leaves of that tree need a promise: reading a line
(`$stdin.gets` behind `LineEditor#readline`), the file actions (the async
`getFs()` adapter, which the website's in-memory fs needs), and shell-outs
(`system`). A command body that awaits one returns a promise, and everything
above it follows. **The settled cascade is:**

`LineEditor#readline` → `ask` / `yes?` / `no?` / `file_collision` →
`CreateFile#force_on_collision?` → `on_conflict_behavior` → `invoke!` →
`action` → every `Thor::Actions` method → every command body → `Command#run` →
`invoke_command` / `invoke_all` / `invoke` / `invoke_with_padding` →
`dispatch` → `start`.

Three rules bound it:

- **`invoke_all` awaits each command in order.** Ruby's
  `self.class.all_commands.map { |_, command| invoke_command(command) }`
  (`invocation.rb:133-135`) is sequential, so the port is a `for` loop that
  awaits each `invokeCommand` before the next and collects the results. A
  `Promise.all` over the map would run a generator's steps concurrently.
- **Block-scoped state restores when the block's promise settles.** `inside`,
  `with_padding`, `mute`, `indent`, `with_output_buffer` and `FileUtils.cd` are
  `set; yield; ensure restore` in Ruby. Their ports go through `rbEnsure`, which
  defers the restore to the promise's settle, so `invoke_with_padding`
  (`invocation.rb:138-140`) holds its padding for the whole awaited invocation.
- **Constructors stay synchronous.** `Thor::Base#initialize`
  (`base.rb:53-113`) and the `Invocation`, `Shell` and `Actions` initializers
  that wrap it do no I/O, and a JS constructor cannot await.

The alternatives lose:

- **Keeping the synchronous `fs` path** breaks the website's generators, which
  run over an in-memory fs reachable only through the async adapter.
- **A synchronous stdin read** blocks the event loop under a running `run`, and
  no browser adapter can serve one.
- **A synchronous `invoke_all` that drops the promises** runs a generator's
  steps interleaved, and loses each step's exception.

This is a genuine language shortcoming, ratified repo-wide here: JS has no
synchronous await. A Thor method on the cascade returning a promise where Thor
returns a value is the designed shape, and a new command is not a new decision
to argue.

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
