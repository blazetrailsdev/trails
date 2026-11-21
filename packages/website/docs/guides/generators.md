---
title: Creating and Customizing Trails Generators & Templates
description: Writing your own trails generators on Thor, generator options and lookup, overriding the built-in templates and generators, application templates, and testing generators.
---

# Creating and Customizing Trails Generators & Templates

> **See also:** [Guides index](./index.md) ·
> [The Trails Command Line](./command-line.md) ·
> [trailties package](/packages/trailties) · [thor package](/packages/thor)

`trails generate` writes the boilerplate of an app: models, migrations,
controllers, scaffolds. The same machinery is open to you. This guide covers:

- Listing the generators an app has.
- Writing a generator, by hand and with the generator generator.
- Generator options and how a name is resolved to a generator.
- Overriding the built-in templates and generators.
- Application templates, the helper methods generators share, and testing.

Generators are built on `@blazetrails/thor`, the port of the Thor gem, as
Rails' are.

## First Contact

Run `trails generate` with no arguments to list every generator, grouped by
where it comes from:

<!-- typecheck:skip -->

```sh
pnpm trails generate
```

Add `--help` after a generator's name for its arguments and options:

<!-- typecheck:skip -->

```sh
pnpm trails generate model --help
```

## Creating Your First Generator

A generator is a class extending `Base` from
`@blazetrails/trailties/generators`. Each public method it registers runs in
order when the generator is invoked. This one writes an initializer:

```ts
import { Base } from "@blazetrails/trailties/generators";

export class InitializerGenerator extends Base {
  static {
    this.methodAdded("createInitializerFile");
  }

  async createInitializerFile(): Promise<void> {
    await this.createFile(
      "config/initializers/initializer.ts",
      "// Add initialization content here\n",
    );
  }
}
```

Save it as `lib/generators/initializer-generator.ts` and run it with
`pnpm trails generate initializer`.

The `methodAdded` call is the one thing a Ruby reader will not expect. Thor
registers a method as a command the moment Ruby defines it; JavaScript has no
hook for that, so the class body registers each step itself. That rule, and
what it means for helper methods, is in
[packages/trailties/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#thor-commands-register-through-an-explicit-methodadded).
Each step that writes a file is async, so it is an `async` method that awaits
the action.

`createFile` is one of Thor's actions. Others include `copyFile`, `template`,
`directory`, `appendToFile`, `injectIntoFile` and `gsubFile`; the
[thor package](/packages/thor) page lists them.

A static `desc` gives the generator the description `--help` shows. Without
one, a `USAGE` file beside the generator is read instead.

## Creating Generators with Generators

`trails generate generator` writes the skeleton for a new generator:

<!-- typecheck:skip -->

```sh
pnpm trails generate generator initializer
```

It creates `lib/generators/initializer/initializer-generator.ts`, a `USAGE`
file and an empty `templates/` directory. The generated class extends
`NamedBase`, so it takes a name argument, and sets its source root to the
`templates/` directory beside it:

```ts
import { NamedBase } from "@blazetrails/trailties/generators";
import { File } from "@blazetrails/ruby-compat";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class InitializerGenerator extends NamedBase {
  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("copyInitializerFile");
  }

  async copyInitializerFile(): Promise<void> {
    await this.copyFile("initializer.ts", `config/initializers/${this.fileName}.ts`);
  }
}
```

`NamedBase` derives the names a generator usually needs from its argument:
`fileName`, `className()`, `pluralName()`, `tableName()` and their relatives.
`pnpm trails generate initializer core-extensions` copies
`templates/initializer.ts` to `config/initializers/core-extensions.ts`.

A file ending in `.tt` is a template: `template` renders it with TSE before
writing, and `this` inside it is the generator, so
`<%= this.className() %>` writes the class name.

## Generator Command Line Options

`classOption` declares an option every invocation accepts:

```ts
import { NamedBase, type GeneratorOptions } from "@blazetrails/trailties/generators";

export class InitializerGenerator extends NamedBase {
  declare options: GeneratorOptions & { scope?: string };

  static {
    this.classOption("scope", { type: "string", default: "app", desc: "Where to put it" });
    this.methodAdded("createInitializerFile");
  }

  async createInitializerFile(): Promise<void> {
    await this.createFile(`config/initializers/${this.options.scope}-${this.fileName}.ts`, "");
  }
}
```

Options are camelCase in code and kebab-case on the command line
(`--skip-routes`), per the
[casing rule](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#fidelity-is-the-job).
Every generator also accepts the runtime options `--force`, `--pretend`,
`--quiet` and `--skip`.

## Generator Resolution

`trails generate initializer` looks for a file ending in `-generator.ts` (or
`.js`) under a `generators/` or `trails/generators/` directory, in the app's
`lib/`, in each engine and in each installed package. A namespaced name such
as `active-record:model` maps to directories:
`generators/active-record/model/model-generator.ts`.

The first match wins, so a generator in the app shadows a framework one of
the same name.

## Overriding Rails Generator Templates

Most built-in generators render their files from templates, and look in the
app's `lib/templates/` before their own. To change what the scaffold
controller writes, copy its template to the matching path and edit it:

<!-- typecheck:skip -->

```sh
lib/templates/trails/scaffold-controller/controller.ts.tt
```

The directory is the generator's namespace, kebab-case
(`trails/scaffold-controller`); the file name is the template's own. Add other
search directories with `config.generators().templates`.

## Overriding Rails Generators

`config.generators()` sets defaults for every generator. Its methods name a
_hook_ (`orm`, `testFramework`, `templateEngine`, `helper`, `stylesheets`)
and the generator that fills it:

<!-- typecheck:skip -->

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.generators((g) => {
      g.orm("active-record");
      g.testFramework("test-unit", { fixture: false });
      g.helper(false);
    });
  }
}
```

The hook methods are answered by `methodMissing`, so they are untyped — hence
the skip. `apiOnly`, `templates`, `fallbacks` and `hiddenNamespaces` are
ordinary typed properties.

Setting a hook to `false` turns it off: with `helper(false)`, the scaffold no
longer writes a helper. Pointing a hook at your own generator, such as
`templateEngine("my-engine")`, makes every generator that invokes the hook
call yours.

### Generators Fallbacks

A generator you write for a hook does not have to implement every namespace
the framework asks for. `fallbacks` maps a missing namespace to one to use in
its place:

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.generators().fallbacks["my-test"] = "test-unit";
  }
}
```

With that, a `my-test:model` lookup that finds nothing runs
`test-unit:model`.

## Application Templates

An application template is a script that customises a new app as it is
generated. Pass it to `trails new` with `-m` (or `--template`), as a path or
a URL:

<!-- typecheck:skip -->

```sh
pnpm trails new blog -m ~/template.ts
```

The template runs with the app generator as `this`, so it can call every
action and helper below. `pnpm trails app:template LOCATION=~/template.ts`
applies one to an existing app.

## Generator Helper Methods

Besides Thor's file actions, a trails generator has the Rails helpers:

- `gem(name)` and `gemGroup` add a dependency to `package.json`. A Gemfile is
  a `package.json` in trails; see
  [packages/trailties/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#a-gemfile-is-a-packagejson-gemfileentry-bundle-install-gemspec).
- `initializer(filename, data)` writes `config/initializers/<filename>`.
- `environment(data)` adds a line to `config/application.ts`, or to one
  environment's file with `{ env: "production" }`.
- `route(routingCode)` inserts into `config/routes.ts`.
- `generate(what, ...args)` runs another generator, and `rake(command)` and
  `trailsCommand(command)` run a task or command.
- `git`, `lib`, `vendor`, `rakefile` and `readme` cover the rest.

## Testing Generators

`TestCase` from `@blazetrails/trailties/generators/test-case` runs a
generator in a scratch directory and asserts on what it wrote. `tests` names
the generator, `destination` the directory, and `runGenerator` runs it with
the arguments given:

<!-- typecheck:skip -->

```ts
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { InitializerGenerator } from "../../lib/generators/initializer/initializer-generator.js";

class InitializerGeneratorTest extends TestCase {
  static {
    this.tests(InitializerGenerator);
    this.destination("tmp/generators");
  }
}

it("generates an initializer", async function (this: InitializerGeneratorTest) {
  await this.runGenerator(["core-extensions"]);
  await this.assertFile("config/initializers/core-extensions.ts");
});
```

`assertFile` also takes a string or a regular expression the file's content
must match; `assertNoFile`, `assertMigration` and `assertInstanceMethod`
cover the other common checks.
