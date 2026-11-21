---
title: The Trails Initialization Process
description: What happens between typing `trails server` and the first request — the bin stub, command dispatch, boot, the application class, initializers and the Rack server.
---

# The Trails Initialization Process

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [trailties package](/packages/trailties) ·
> [Configuring Trails Applications](./configuring.md) ·
> [Autoloading and Reloading](./autoloading-and-reloading-constants.md)

This guide walks through the files and calls that run when a Trails
application starts, using `trails server` as the example. After reading it you
will know:

- How the `trails` command finds your application and picks a command.
- Which files under `config/` run, and in what order.
- How the frameworks are loaded and the initializers run.
- How the Rack server is started with the booted application.

It is a tour of the framework's own code in `@blazetrails/trailties`, not a
guide to configuration; for that, read
[Configuring Trails Applications](./configuring.md).

## Launch!

Starting a server is one command, run from anywhere inside the application:

```sh
pnpm trails server
```

### `bin/trails`

The globally installed `trails` executable first looks for the application.
Starting in the current directory and walking up towards the root, it checks
each directory for `bin/trails`. When it finds one that sets `APP_PATH`, it runs
that file with the same arguments, so every command uses the application's own
copy of the framework. Outside any application it handles `trails new` and
`trails help` itself.

The generated `bin/trails` is short. It records where `config/application.ts`
lives, then hands over to the command dispatcher:

<!-- typecheck:skip -->

```ts
import { join } from "node:path";
import { setAppPath } from "@blazetrails/trailties/app-path";

const APP_PATH = join(import.meta.dirname, "../config/application.ts");
setAppPath(APP_PATH);
await import("@blazetrails/trailties/commands");
```

The block is skipped by the guides type check because it only compiles inside
a generated application.

### `config/boot.ts`

`config/boot.ts` is the place for anything that must run before the framework
loads. In Rails it sets up Bundler and Bootsnap; a Trails application has
neither — packages come from `node_modules` through pnpm — so the generated
file starts out empty, and `config/application.ts` imports it first.

### `trailties/commands`

The `commands` module reads the first argument, expands the short aliases (`s`
for `server`, `g` for `generate`, `c` for `console`, `db` for `dbconsole`, `r`
for `runner`, `t` for `test`) and passes the rest to `invoke`.

### `trailties/command`

`invoke` looks the name up among the registered commands. Each command is a
class built on `@blazetrails/thor`, the port of Thor, so option parsing, help
text and errors look as they do in Rails. If no command matches, the name is
tried as a Rake task, which is how `trails db:migrate` reaches the database
tasks. Dispatch is asynchronous; see the
[trailties package notes](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#thor-dispatch-is-async).

### `commands/server`

`ServerCommand#perform` resolves the environment (from `--environment`,
`TRAILS_ENV` or the default `development`), loads `config/application.ts`,
and builds a `Trails::Server` from the parsed options: host, port, PID file
and whether to log to standard output.

### Rackup: the Server

`Trails::Server` extends `Rackup::Server` from `@blazetrails/rackup`, the port
of the rackup gem. Its options include the rackup file, `config.ru`, which the
server evaluates to get the application it will serve. Before evaluating it,
`Trails::Server` sets up the PID file and the log broadcast.

### `config/application`

`config/application.ts` is where the application class lives. It imports
`config/boot.ts`, loads the frameworks, then declares the class:

```ts
import { Application } from "@blazetrails/trailties";

export class Blog extends Application {
  static {
    Application.register(this, import.meta.dirname);
    this.config.loadDefaults("8.0");
  }
}
```

`Application.register` records the class as the application and its
directory as the root. Configuration set here applies to every environment;
the files in `config/environments/` override it later.

### `Trails::Server#start`

`start` prints the boot banner, traps `INT` so `Ctrl-C` stops the server
cleanly, and calls the parent `start`, which builds the application from
`config.ru` and runs the Node handler.

## Loading Trails

### `config/environment.ts`

`config.ru` imports `config/environment.ts` first. It loads the application
class, wires the autoloaders to Node's `import()`, and runs the initializers:

<!-- typecheck:skip -->

```ts
import { setLoadImporter } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "./application.ts";

Trails.autoloaders.each((loader) => {
  loader.importer = (url) => import(url);
});
setLoadImporter((url) => import(url));

export default await Trails.initialize();
```

The `import(url)` calls must be written in the application so that module
specifiers resolve from the application's directory. The autoloader itself is
Zeitwerk; see
[CLAUDE.md, "The application loader is Zeitwerk"](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#the-application-loader-is-zeitwerk-railsautoloaders).

### `trailties/all`

`config/application.ts` imports `@blazetrails/trailties/all` (or a chosen
subset). Each import registers a framework's trailtie: Active Record, Active
Storage, Action Controller, Action View, Action Mailer, Active Job, Action
Cable, Action Mailbox, Action Text and the test framework. A trailtie is a
framework's hook into the boot: it adds configuration under `config.<name>`
and the initializers that apply it. A framework is loaded by an ES import, not
by a load path; see
[CLAUDE.md, "Core extensions are not installed on native prototypes"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#core-extensions-are-not-installed-on-native-prototypes-configactive_supportbare).

### Back to `config/environment.ts`

`Trails.initialize()` calls `initializeBang` on the application. That method
gathers every initializer, sorts them, and runs them in order, awaiting each
one, then marks the application initialized.

### `trailties/application`

The initializers come from three places, run in this order:

1. **Bootstrap**, which sets up the logger, the cache and the once
   autoloader.
2. **Every trailtie and engine**, in the order they were loaded. The
   application is itself an engine, so this is where its
   `config/environments/<env>.ts` (`load_environment_config`) and its
   `config/initializers/*.ts` files run.
3. **Finisher**, which sets up the main autoloader, builds the middleware
   stack, runs the `toPrepare` callbacks, eager loads when
   `config.eagerLoad` is on, and installs the routes reloader.

An initializer can name another with `before` or `after` to change its place;
the list is sorted with those constraints before it runs. Your own code can
join in with `this.initializer(...)` in the application class or an engine,
and frameworks expose load hooks you can register with `onLoad` from
`@blazetrails/activesupport`; see [Configuring](./configuring.md#load-hooks).

When the last initializer finishes, `Trails.initialize()` resolves with the
application, `config.ru` passes it to `run`, and the server starts accepting
requests.

### Rack: the Handler

Rackup's handler for Node receives each request, builds a Rack environment
from it, calls the application — whose first stop is the middleware stack the
Finisher built — and writes the returned status, headers and body back to the
socket.
