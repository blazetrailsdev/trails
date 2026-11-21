---
title: The Trails Command Line
description: Creating an application with trails new, and the everyday commands — server, generate, console, runner, destroy, db, notes, routes, test — plus writing your own rake tasks.
---

# The Trails Command Line

> **See also:** [Guides index](./index.md) ·
> [trailties package](/packages/trailties) ·
> [thor package](/packages/thor) ·
> [rake package](/packages/rake)

Most of the time spent building a Trails application outside the editor is
spent at the `trails` command. This guide covers:

- Creating an application with `trails new`, and choosing what it includes.
- Running the server, a console and one-off scripts.
- Generating and destroying code.
- Database, notes, routes, test and housekeeping commands.
- Writing your own tasks.

The command is shipped by `@blazetrails/trailties`. Commands and generators are
built on the [thor](/packages/thor) port and tasks on the
[rake](/packages/rake) port, so both behave as they do in Rails. Option names
are kebab-case on the command line (`--skip-git`) and camelCase in code
(`skipGit`); see
[CLAUDE.md, "Casing is translated, never mirrored"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#fidelity-is-the-job).

## Creating a Trails App

### `trails new`

`trails new` creates an application directory: the `app/`, `config/`, `db/`
and `test/` trees, a `package.json`, and a `pnpm-lock.yaml`. A trails app is a
pnpm project.

```sh
pnpm dlx @blazetrails/trailties new blog
cd blog
```

It installs dependencies when it finishes. From then on, run every command
through the project's own copy, `pnpm trails <command>` (or `bin/trails`).

### Preconfigure a Different Database

SQLite is the default. `--database` (or `-d`) picks another, and writes the
matching `config/database.ts` and driver dependency:

```sh
pnpm dlx @blazetrails/trailties new blog --database postgresql
```

The choices are `sqlite3`, `postgresql`, `mysql` and `mariadb-mysql`.

### Skipping Defaults

A generated app includes every framework. Each has a `--skip-*` flag that
leaves it out: `--skip-action-mailer`, `--skip-action-mailbox`,
`--skip-action-text`, `--skip-active-job`, `--skip-active-storage`,
`--skip-action-cable`, `--skip-test`, `--skip-system-test`, `--skip-git`,
`--skip-docker`, and more; `trails new --help` lists them all. `--api` builds
an API-only application (see
[Using Trails for API-only Applications](./api-app.md)).

JavaScript is served through Vite, so `--javascript` defaults to `vite`. The
importmap and propshaft options Rails offers are not ported; the ruling is
[CLAUDE.md, "importmap-rails and propshaft are out of scope"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails).

## Command Line Basics

`pnpm trails --help` lists every command the application has, including tasks
added by installed packages and by the application itself. Each command also
answers `--help`.

### `trails server`

Starts the application's web server, by default on `localhost:3000`. `-p`
changes the port and `-b` the address it binds to:

```sh
pnpm trails server -p 4000
```

The server serves the Rack app only and does not start Vite. In development,
`bin/dev` runs both from `Procfile.dev`; requests for assets are proxied to the
Vite dev server.

### `trails generate`

Generators write code from templates: a model with its migration and test, a
controller with its views, a whole scaffold. With no arguments `trails
generate` lists every generator; with a generator name and `--help` it shows
that generator's options.

```sh
pnpm trails generate model Article title:string body:text
pnpm trails generate controller Greetings hello
```

A field is `name:type`, and the types are Active Record's column types.
Generator names are kebab-case: `scaffold-controller`, `integration-test`,
`application-record`. `trails g` is short for `trails generate`.

A scaffold generates the model, migration, controller, views, routes and tests
for a resource at once:

```sh
pnpm trails generate scaffold HighScore game:string score:integer
pnpm trails db:migrate
```

### `trails console`

Opens a REPL with the application loaded, so you can query models and call
your own code. Top-level `await` works, since every query is async:

```sh
pnpm trails console
```

`--sandbox` wraps the session in a transaction that is rolled back on exit, so
nothing you change in the console persists. `-e` picks the environment.

#### The `app` and `helper` Objects

Inside the console, `app` is an integration session that can make requests
against the application and build URLs from route helpers, and `helper` gives
access to the view helpers.

### `trails dbconsole`

Opens the command-line client of the configured database (`sqlite3`, `psql` or
`mysql`) with the connection settings filled in. `--database` picks a database
in a multi-database application.

### `trails runner`

Runs a piece of code, or a file, with the application loaded and exits:

```sh
pnpm trails runner "console.log(await Article.count())"
pnpm trails runner script/backfill.ts
```

`-e` chooses the environment, as with the console.

### `trails destroy`

The inverse of `generate`: it removes the files a generator created and undoes
the edits it made, such as an added route. `trails d` is short for it.

```sh
pnpm trails destroy model Article
```

### `trails about`

Prints the versions of trails, Node and the database adapter, the
application's root and environment, and the middleware stack. It is the first
thing to include in a bug report.

### `trails db:`

The database tasks: `db:create`, `db:drop`, `db:migrate`, `db:rollback`,
`db:seed`, `db:setup`, `db:prepare`, `db:reset`, `db:schema:load`,
`db:schema:dump` and the rest. `db:prepare` is the one to run on deploy: it
creates the database if needed and migrates it. The
[Active Record Migrations](./active-record-migrations.md) guide covers them in
depth.

#### Switching to a Different Database Later

`trails db:system:change --to=postgresql` rewrites `config/database.ts`, the
driver dependency and the Docker files for another database. Data is not
moved.

### `trails notes`

Searches the code for comments annotated `FIXME`, `OPTIMIZE` or `TODO` and
prints each with its file and line:

```sh
pnpm trails notes
```

#### Annotations

`--annotations` (or `-a`) narrows the search to the tags you name:

```sh
pnpm trails notes --annotations FIXME HACK
```

#### Tags

Custom tags can be registered for the whole application, so a plain
`trails notes` finds them too, with `config.annotations.registerTags`.

#### Directories

By default notes searches `app`, `config`, `db`, `lib` and `test`.
`config.annotations.registerDirectories` adds more.

#### Extensions

Comments are recognised in `.ts`, `.js`, `.tse`, `.css` and the other
extensions trails knows. `config.annotations.registerExtensions` teaches it a
new file extension and the comment syntax it uses.

### `trails routes`

Prints every route: its name, HTTP verb, path pattern and the controller action
it reaches. `-c` filters by controller and `-g` greps the output.

### `trails test`

Runs the test suite, or the files and directories you name. Tests run on
Vitest; `trails test:system` runs only the system tests.

```sh
pnpm trails test test/models/article.test.ts
```

### `trails tmp:`

`tmp:clear` empties the cache, socket and screenshot directories under `tmp/`;
`tmp:cache:clear`, `tmp:sockets:clear` and `tmp:screenshots:clear` empty one
each. `tmp:create` creates them.

### Miscellaneous

- `trails dev:cache` toggles caching in development.
- `trails initializers` lists the initializers in the order they run.
- `trails middleware` prints the middleware stack.
- `trails stats` counts lines of code and tests per directory.
- `trails secret` prints a new random secret.
- `trails credentials:edit` opens the encrypted credentials file.
- `trails zeitwerk:check` checks the project's file layout against the
  autoloader; see [Autoloading and Reloading](./autoloading-and-reloading-constants.md).
- `trails version` prints the trails version.

### Custom Rake Tasks

An application's own tasks live in `lib/tasks/`, one or more per
`*.rake.ts` file, and `trails --help` lists every task that has a description.
A task file uses the rake DSL:

```ts
import { DSL } from "@blazetrails/rake";

DSL.namespace("reports", () => {
  DSL.desc("Print a daily summary");
  DSL.task("daily", () => {
    console.log("summary");
  });
});
```

The task above runs as `pnpm trails reports:daily`. A task can depend on
others by passing an object instead of a name, `{ daily: ["db:prepare"] }`,
and one that needs the application loaded depends on `environment`.
