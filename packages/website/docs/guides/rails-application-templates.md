---
title: Trails Application Templates
description: Applying a template to a new or existing app, and the generator actions a template calls to add packages, configuration, files, routes and commands.
---

# Trails Application Templates

> **See also:** [Guides index](./index.md) ·
> [Creating and Customizing Trails Generators & Templates](./generators.md) ·
> [trailties package](/packages/trailties) · [thor package](/packages/thor)

An application template is a TypeScript file that changes an app as it is
generated: it adds packages, writes initializers, draws routes and runs
generators. Keep the steps you take on every new app in one template, and
each new app starts from them. This guide covers:

- Applying a template to a new app and to an existing one.
- The actions a template calls, one by one.
- Asking the person running it questions, and running work at the end.

## Usage

Pass a template to `trails new` with `-m` (or `--template`). It may be a
path or a URL:

<!-- typecheck:skip -->

```sh
pnpm trails new blog -m ~/template.ts
pnpm trails new blog -m https://example.com/template.ts
```

`app:template` applies one to an app that already exists:

<!-- typecheck:skip -->

```sh
pnpm trails app:template LOCATION=~/template.ts
```

## Template API

A template runs with the app generator as `this`. Its default export is a
function, and every action below is a method on that generator. Generators
are built on `@blazetrails/thor`, so Thor's file actions (`createFile`,
`copyFile`, `injectIntoFile`, `gsubFile` and the rest) are there too.

<!-- typecheck:skip -->

```ts
// template.ts
export default async function (this: AppGenerator) {
  await this.generate("scaffold", "person", "name:string");
  await this.route('root("people#index")');
  await this.trailsCommand("db:migrate");

  this.afterBundle(async () => {
    await this.git("init");
    await this.git({ add: "." });
    await this.git({ commit: "-a -m 'Initial commit'" });
  });
}
```

The sections below take the actions in turn.

### gem(...args)

A trails app's dependencies live in `package.json`, so `gem` adds a package
to it. The mapping from a Gemfile to `package.json` is ruled in
[packages/trailties/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#a-gemfile-is-a-packagejson-gemfileentry-bundle-install-gemspec).

<!-- typecheck:skip -->

```ts
await this.gem("@blazetrails/turbo");
await this.gem("date-fns", "^4.1.0");
```

The packages are installed after the template finishes.

### gemGroup(...names, block)

Wraps the `gem` calls in its block in a group. A `development` or `test`
group adds them as development dependencies:

<!-- typecheck:skip -->

```ts
await this.gemGroup("development", "test", async () => {
  await this.gem("@playwright/test");
});
```

### addSource(source, options, block)

Adds a package source. In a trails app that is a registry entry for the
package manager.

### environment / application(data, options, block)

Adds a line inside the `Application` class in `config/application.ts`.
`{ env: "development" }` writes to that environment's file under
`config/environments/` instead. A block may stand in for `data`:

<!-- typecheck:skip -->

```ts
await this.environment('this.config.actionMailer.defaultUrlOptions = { host: "localhost:3000" };', {
  env: "development",
});
```

### vendor / lib / file / initializer(filename, data, block)

Each writes a file: `vendor` under `vendor/`, `lib` under `lib/`,
`initializer` under `config/initializers/`, and `file` (Thor's `createFile`)
at the path given. The content is `data` or the block's return value:

<!-- typecheck:skip -->

```ts
await this.initializer(
  "bloatlol.ts",
  () => `
export const bloatlol = "Not much bloat";
`,
);
```

### rakefile(filename, data, block)

Writes a Rake task file under `lib/tasks/`. Tasks are written with the
`@blazetrails/rake` DSL:

<!-- typecheck:skip -->

```ts
await this.rakefile(
  "bootstrap.rake.ts",
  () => `
namespace("boot", () => {
  task("strap", () => {
    sh("echo strapping");
  });
});
`,
);
```

### generate(what, ...args)

Runs a generator with the arguments given:

<!-- typecheck:skip -->

```ts
await this.generate("scaffold", "person", "name:string", "address:text", "age:integer");
```

### run(command)

Runs a shell command, as `run("rm README.md")`.

### trailsCommand(command, options)

Runs a `trails` command or task in the app. `{ env: "production" }` sets
`TRAILS_ENV`, `{ abortOnFailure: true }` stops the template when the command
fails, and `{ sudo: true }` runs it under `sudo`:

<!-- typecheck:skip -->

```ts
await this.trailsCommand("db:migrate", { env: "production" });
```

### route(routingCode)

Adds a line to `config/routes.ts`:

<!-- typecheck:skip -->

```ts
await this.route('root("person#index")');
```

### inside(dir)

Runs its block with `dir` as the current directory:

<!-- typecheck:skip -->

```ts
await this.inside("vendor", {}, async () => {
  await this.run("ln -s ~/my-trails trails");
});
```

### ask(question)

Prompts the person running the template and answers what they typed:

<!-- typecheck:skip -->

```ts
const libName = await this.ask("What would you like to call the shiny library?");
await this.lib(`${libName}.ts`, "export class Shiny {}\n");
```

### isYes(question) or isNo(question)

Ask a yes-or-no question and answer a boolean. `isNo` answers true where the
person says no:

<!-- typecheck:skip -->

```ts
if (await this.isYes("Freeze trails?")) await this.trailsCommand("app:update");
```

Predicates are spelled `isX`, by the casing rule in
[docs/ruby-ts-conventions.md](https://github.com/blazetrailsdev/trails/blob/main/docs/ruby-ts-conventions.md).

### git(command)

Runs `git`. A string is one subcommand; in an object each key is a
subcommand and its value the arguments:

<!-- typecheck:skip -->

```ts
await this.git("init");
await this.git({ add: "." });
await this.git({ commit: "-a -m 'Initial commit'" });
```

### afterBundle(block)

Registers a block to run after the packages are installed and the binstubs
written. Commit to git there, so the commit holds every generated file.

## Advanced Usage

A template is loaded with `import()` and its default export is called with
the generator, so it may import other modules beside it and split a long
template into several files. `copyFile` and `template` resolve a relative
source through the generator's `sourcePaths()`; an absolute path built from
`import.meta.dirname` copies a file kept next to the template.
