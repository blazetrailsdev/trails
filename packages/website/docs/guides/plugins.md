---
title: The Basics of Creating Trails Plugins
description: Generating a plugin package, testing it against a dummy app, adding an acts-as style class method and instance methods to models, and publishing it to npm.
---

# The Basics of Creating Trails Plugins

> **See also:** [Guides index](./index.md) ·
> [Getting Started with Engines](./engines.md) ·
> [trailties package](/packages/trailties)

A plugin is an npm package that adds behaviour to a trails app. It can be
as small as one function that models opt into, or a whole
[engine](./engines.md) with its own routes and models. This guide covers:

- Generating a plugin and running its tests.
- Why a plugin does not reopen JavaScript's built-in classes.
- Adding an "acts as" class method to models, with its own options.
- Adding instance methods those models gain.
- Shipping generators with a plugin, and publishing it.

The example plugin is `yaffle`. Models that call `actsAsYaffle()` gain a
`squawk` method that writes a message to one of their columns.

## Setup

### Generate a Plugin Package

`trails plugin new` writes the skeleton of a plugin package:

<!-- typecheck:skip -->

```sh
pnpm trails plugin new yaffle
```

The package has a `package.json` (where a Rails plugin has a gemspec), an
entry module at `lib/yaffle.ts`, and a `test/` directory holding a small app
at `test/dummy`. The tests boot that app, so a plugin is tested against a
real application without one of its own. `--full` adds an engine with its
own `app/` tree, and `--mountable` makes it an isolated, mountable engine,
which the [engines guide](./engines.md) covers. `pnpm trails plugin new
--help` lists the other options.

## Testing Your Newly Generated Plugin

From the plugin's directory, run its test suite:

<!-- typecheck:skip -->

```sh
cd yaffle
pnpm test
```

A fresh plugin's suite passes, because there is nothing in it yet. Each step
below starts with a test that fails, then the code that makes it pass.

## Extending Core Classes

A Rails plugin often reopens `String` or `Array` to add a method to every
value. trails does not do this: a core extension is a function the caller
imports, and nothing is installed on a native prototype. The ruling is
[`CLAUDE.md` § "Core extensions are not installed on native prototypes"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#core-extensions-are-not-installed-on-native-prototypes-configactive_supportbare).

So a plugin that wants `toSquawk` on strings exports it:

```ts
// yaffle/lib/yaffle/core-ext.ts
export function toSquawk(str: string): string {
  return `squawk! ${str}`.trim();
}
```

and its test imports it, the way an application would:

<!-- typecheck:skip -->

```ts
// yaffle/test/core-ext.test.ts
import { toSquawk } from "../lib/yaffle/core-ext.js";

it("to squawk prepends the word squawk", () => {
  expect(toSquawk("Hello World")).toBe("squawk! Hello World");
});
```

## Add an "acts_as" Method to Active Record

A common plugin shape is a class method a model calls in its body to switch
the plugin on. In trails that method is a `this`-typed function, assigned as
a static wherever it should be available; the pattern is
[`CLAUDE.md` § "Module mixins"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#module-mixins-ruby-include--typescript).

### Add a Class Method

`actsAsYaffle` records which column `squawk` writes to. The setting is a
class attribute, so each model keeps its own value and a subclass inherits
its parent's:

```ts
// yaffle/lib/yaffle/acts-as-yaffle.ts
import { classAttribute } from "@blazetrails/activesupport";

export interface ActsAsYaffleOptions {
  yaffleTextField?: string;
}

export function actsAsYaffle(this: object, options: ActsAsYaffleOptions = {}): void {
  classAttribute.call(this, "yaffleTextField", {
    default: options.yaffleTextField ?? "lastSquawk",
  });
}
```

Make it available to every model by assigning it on the dummy app's
`ApplicationRecord`, as an application would on its own:

<!-- typecheck:skip -->

```ts
// test/dummy/app/models/application-record.ts
import { Base } from "@blazetrails/activerecord";
import { actsAsYaffle } from "../../../../lib/yaffle/acts-as-yaffle.js";

export class ApplicationRecord extends Base {
  static actsAsYaffle = actsAsYaffle;

  static {
    this.primaryAbstractClass();
  }
}
```

Generate two models in the dummy app to test against, one that keeps the
default column and one that names its own:

<!-- typecheck:skip -->

```sh
cd test/dummy
pnpm trails generate model Hickwall lastSquawk:string
pnpm trails generate model Wickwall lastSquawk:string lastTweet:string
pnpm trails db:migrate
```

<!-- typecheck:skip -->

```ts
// test/dummy/app/models/wickwall.ts
export class Wickwall extends ApplicationRecord {
  static {
    this.actsAsYaffle({ yaffleTextField: "lastTweet" });
  }
}
```

A test then reads `Hickwall.yaffleTextField` as `"lastSquawk"` and
`Wickwall.yaffleTextField` as `"lastTweet"`.

### Add an Instance Method

`squawk` writes `"squawk! "` and its argument to the model's configured
column. It is an instance method, so `actsAsYaffle` installs it on the
model's prototype when the model opts in:

<!-- typecheck:skip -->

```ts
// yaffle/lib/yaffle/acts-as-yaffle.ts
function squawk(this: Base, string: string): void {
  const klass = this.constructor as typeof Base & { yaffleTextField: string };
  this.writeAttribute(klass.yaffleTextField, toSquawk(string));
}

export function actsAsYaffle(this: typeof Base, options: ActsAsYaffleOptions = {}): void {
  classAttribute.call(this, "yaffleTextField", {
    default: options.yaffleTextField ?? "lastSquawk",
  });
  Object.defineProperty(this.prototype, "squawk", { value: squawk, writable: true });
}
```

A record of either model can now `squawk("Hello World")`, and the value lands
in `lastSquawk` or `lastTweet`. Writing through `writeAttribute` keeps dirty
tracking and type casting working, as an assignment to the attribute would.

## Generators

A plugin can ship generators, so an app runs `pnpm trails generate
yaffle:install` to set itself up. A generator in the plugin's
`lib/generators/` is found by the same lookup as an app's own. Writing one
is covered in
[Creating and Customizing Trails Generators & Templates](./generators.md).

## Publishing Your Package

A plugin is published like any npm package. Set `name`, `version` and
`description` in `package.json`, build it, and publish:

<!-- typecheck:skip -->

```sh
pnpm build
pnpm publish
```

To try an unpublished plugin in an app, add it by path instead:

<!-- typecheck:skip -->

```sh
pnpm add ../yaffle
```

## Plugin Documentation

Document what the plugin adds, how to install it, and each option its
methods take in the package's `README.md`, which npm shows on the package's
page. A TSDoc comment on each exported function lets an editor show the same
text where the function is used.
