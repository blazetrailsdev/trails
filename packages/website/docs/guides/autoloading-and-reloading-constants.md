---
title: Autoloading and Reloading
description: How a Trails application finds its classes by file path, reloads them in development, and eager loads them in production, through the Zeitwerk port.
---

# Autoloading and Reloading

> **See also:** [Guides index](./index.md) ·
> [zeitwerk package](/packages/zeitwerk) ·
> [trailties package](/packages/trailties)

A Trails application does not list its models, controllers and jobs anywhere.
The loader works them out from where the files sit: `app/models/admin/user.ts`
is `Admin::User`, and it is loaded the first time the application needs it. In
development the loader can also throw those classes away and load them again
after you edit a file. This guide covers:

- How file paths map to constant names.
- Which directories are autoloaded, and how to add or exclude one.
- Reloading in development, and what it does to objects you are still holding.
- Eager loading in production.
- Single table inheritance, custom inflections and custom namespaces.
- Checking that a project's layout is one the loader accepts.

## Introduction

The loader is a port of the Zeitwerk gem. Rails 7 made Zeitwerk its only
loader, and trails uses it the same way: two loaders, `main` and `once`,
reachable as `Trails.autoloaders.main` and `Trails.autoloaders.once`.

One thing differs at the root. Ruby can bind a constant name to a file and run
the `require` synchronously the moment the name is first read. JavaScript has
no hook on an unresolved name and no synchronous `import()`, so a trails loader
does its `import()` ahead of the read: `Trails.initialize()` awaits each
loader's eager load during boot, and a production build can record the whole
directory walk ahead of time. The ruling and its consequences are in
[CLAUDE.md, "`Module#autoload` is a build step"](https://github.com/blazetrailsdev/trails/blob/main/packages/zeitwerk/CLAUDE.md#moduleautoload-is-a-build-step-zeitwerkloaderdefine_autoload)
and
[CLAUDE.md, "The application loader is Zeitwerk"](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#the-application-loader-is-zeitwerk-railsautoloaders).
From the application's side the effect is small: write a class in the file its
name calls for, export it by that name, and reference it.

## Project Structure

Every directory under `app/` is a _root directory_: the path below it names the
constant, and the root itself contributes nothing to the name.

```text
app/models/user.ts                   -> User
app/models/admin/user.ts             -> Admin::User
app/controllers/admin/users-controller.ts -> Admin::UsersController
app/jobs/vcard-api-import-job.ts     -> VcardApiImportJob
```

File names are kebab-case and the constant is camelized from them; the loader
reads `-` as `_` before it camelizes. Each file exports its constant **by
name**:

```ts
import { Base } from "@blazetrails/activerecord";

export class User extends Base {}
```

A default export, two classes in one file, or a class under a different name
fail at boot with Zeitwerk's "expected file … to define constant …" error. A
subdirectory with no file of its own, such as `app/models/admin/`, becomes an
empty namespace module that the loader creates for you.

## `config.autoloadPaths`

`config.autoloadPaths` lists extra root directories. Most applications never
touch it: every `app/*` directory is already a root, including ones you add
yourself, such as `app/services` or `app/presenters`. To autoload something
outside `app/`, push its path in `config/application.ts`:

```ts
import { Application } from "@blazetrails/trailties";

export class Blog extends Application {
  static {
    Application.register(this, import.meta.dirname);
    this.config.autoloadPaths.push("extras");
  }
}
```

Roots are read once, when the loaders are set up. Changing the list from an
initializer or at run time has no effect.

## `config.autoloadLib(ignore:)`

`lib/` is not autoloaded by default, because it often holds things that are not
classes: rake tasks, templates, assets. A newly generated application turns it
on with a list of subdirectories to leave alone:

```ts
import { Application } from "@blazetrails/trailties";

export class Blog extends Application {
  static {
    Application.register(this, import.meta.dirname);
    this.config.autoloadLib({ ignore: ["assets", "tasks"] });
  }
}
```

That adds `lib` to both the autoload and eager load paths and tells the main
loader to skip each ignored subdirectory. Add any other `lib` directory that
has no `.ts` files, or whose code must not be reloaded, to the list.

## `config.autoloadOncePaths`

Some code is loaded once and must not be reloaded: a class an initializer
hands to a framework that keeps a reference to it, for example. Put such
directories in `config.autoloadOncePaths`. They are managed by the `once`
loader, autoloaded and eager loaded like the others, and never unloaded.

## `config.autoloadLibOnce(ignore:)`

The once counterpart of `autoloadLib`: `lib/` goes on the once loader's
paths instead of the main loader's. Use one or the other, not both.

## Reloading

In development the generated `config/environments/development.ts` sets
`config.enableReloading = true` (`config.cache_classes = false` in older Rails
terms). When a watched file changes, the next request unloads every constant
the main loader defined and sets them up again from disk, so an edited model is
picked up without restarting the server. The once loader is left alone.

To run code after each reload, such as re-registering something that held an
old class, use `config.toPrepare`, which runs on boot and again after every
reload in development:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.toPrepare(() => {
    // re-read anything that cached a reloadable class
  });
});
```

### Reloading and Stale Objects

Reloading replaces classes; it does not reach into objects that already exist.
An object you stored in a module-level variable, a once-loaded class, or a
framework setting still points at the _old_ class after a reload, and the old
class is no longer the one `User` names. Comparisons such as
`record instanceof User` then fail in a confusing way.

The rule that follows: code that is loaded once must not keep a reference to a
reloadable class. Look the class up when you need it, or reset the reference in
a `toPrepare` block.

## Autoloading When the Application Boots

Reading a reloadable constant while the application boots, from an
initializer for example, gives you whatever was loaded at that moment, and a
reload later throws that copy away. There are three common cases:

1. **Boot needs reloadable code on every reload.** Do the work in a
   `toPrepare` block, as above. It runs at boot and after each reload.
2. **Boot needs code that stays cached.** Move the code to a once directory
   (`config.autoloadOncePaths` or `autoloadLibOnce`). Classes the once loader
   manages are safe to hold from an initializer.
3. **Configuring an engine with an application class.** Pass the class _name_
   as a string and let the engine resolve it when it needs the class, rather
   than handing over the class object itself.

## Eager Loading

In production the generated environment sets `config.eagerLoad = true`, and
boot loads every file under the eager load paths before the first request, so
nothing is loaded lazily while serving traffic and a broken file fails the
deploy instead of a request.

Under the hood each loader runs an awaited eager load during setup whatever
`config.eagerLoad` says, because a trails lookup is synchronous and a load is
not. `config.eagerLoad` keeps its Rails meaning for the eager load initializer.
A path you exclude with `loader.doNotEagerLoad(...)` is not loaded at boot, and
reading a constant under it raises `NameError` until
`await loader.loadFile(path)` has run.

`trails build` records the result of the directory walk in
`.trails/autoload/`, so a production process sets up from that manifest and
does not walk the file system at all.

## Single Table Inheritance

STI needs the subclasses to be loaded before the base class can find them.
With eager loading on, they already are. In development, where loading is
lazy, preload them after each reload:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.toPrepare(async () => {
    await Trails.autoloaders.main.eagerLoadDir(`${Trails.root()}/app/models/shapes`);
  });
});
```

`eagerLoadDir` loads every file below that directory. If the hierarchy lives in
a collapsed directory (one that does not add a namespace) or across several
directories, `eagerLoadNamespace` with the base class loads every constant the
loader knows under it.

## Customizing Inflections

The loader camelizes each file name with its own inflector, not with
Active Support's inflections. A name it gets wrong, typically an acronym, is
overridden by basename. The key is the file name with dashes turned into
underscores and no extension:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.autoloaders.main.inflector.inflect({ vcard_api: "VCardAPI" });
```

### Where Should Inflection Customization Go?

Inflections must be set before the loaders walk their directories, so put them
in an initializer such as `config/initializers/autoloading.ts`. Setting them on
`main` only affects the main loader; call `Trails.autoloaders.each` to apply
the same overrides to both.

## Custom Namespaces

A root directory normally maps to the top level. A loader can also be told
that a directory's files belong under an existing namespace: pass the
namespace object as `pushDir`'s `namespace` option. The namespace has to
exist before the loader is set up, so define it in the initializer that adds
the directory.

## Autoloading and Engines

An engine's `app/` directories are roots of the application's `main` loader
too; engines do not get loaders of their own. An engine shipped as an npm
package uses its package root as its root directory. Engines that need to
refer to application classes should take them by name, as in the third boot
case above.

## Testing

### Manual Testing

`trails zeitwerk:check` eager loads the whole project and reports every file
whose path and exported constant do not agree:

```sh
pnpm trails zeitwerk:check
```

### Automated Testing

Run the same check in CI by setting `config.eagerLoad = true` in the test
environment when `CI` is set, so a test run loads every file, or by running
`trails zeitwerk:check` as its own step.

## Troubleshooting

To see what the loaders are doing, turn on their logging:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.autoloaders.logBang();
```

Each loader then prints the constants it autoloads, loads and unloads. Setting
`Trails.autoloaders.logger` to a function sends the same lines somewhere else.

## `Trails.autoloaders`

`Trails.autoloaders` is the `Autoloaders` object for the application. It holds
the two loaders, `main` and `once`, yields each in turn from `each`, and
answers `isZeitwerkEnabled()` with `true`, since there is no other mode. The
`main` loader's tag is `trails.main` and the `once` loader's is `trails.once`.
