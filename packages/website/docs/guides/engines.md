---
title: Getting Started with Engines
description: Building a mountable Trails engine — generating one, giving it models, controllers and routes, and hooking it into a host application.
---

# Getting Started with Engines

> **See also:** [Guides index](./index.md) ·
> [Configuring Trails Applications](./configuring.md) ·
> [trailties package](/packages/trailties)

An engine is a small application that runs inside another one. It has its own
models, controllers, views and routes, and a host app mounts it at a path. This
guide builds a blogging engine called `Blorgh` and covers:

- What an engine is and how it differs from an application.
- Generating an engine and the files it contains.
- Adding features to it.
- Mounting it in a host application and reaching the host from it.
- Testing it.

## What are Engines?

An application is itself an engine: `Application` extends `Engine`, which
extends `Trailtie`. An engine has everything an app has except the boot
process, which belongs to whichever app loads it.

A _mountable_ engine is _isolated_: its classes live in a namespace of their
own, so its `ArticlesController` cannot clash with the host's. Its routes,
helpers and table names are scoped to that namespace too.

## Generating an Engine

`trails plugin new` generates an engine package:

<!-- typecheck:skip -->

```sh
pnpm trails plugin new blorgh --mountable
```

The package is a pnpm project, published to npm rather than as a gem.

### Inside an Engine

The engine class lives in `lib/blorgh/engine.ts`:

```ts
import { Trails } from "@blazetrails/trailties";

export const Blorgh = { name: "Blorgh" } as { name: string; Engine: typeof Engine };

export class Engine extends Trails.Engine {
  static {
    this.isolateNamespace(Blorgh);
  }
}

Blorgh.Engine = Engine;
```

`isolateNamespace` is what makes the engine mountable. It sets the engine's
name to `blorgh`, prefixes its tables with `blorgh_`, and keeps the host's
helpers out of its views.

The rest of the layout mirrors an application:

- `app/` holds `controllers/blorgh/`, `models/blorgh/`, `views/blorgh/` and
  the other application directories, each namespaced by the engine's name.
- `config/routes.ts` draws the engine's own routes.
- `test/dummy/` is a minimal host app, used to run the engine's tests.

## Providing Engine Functionality

Inside the engine, generators work as they do in an app and put their output
under the namespace:

<!-- typecheck:skip -->

```sh
pnpm trails generate scaffold article title:string text:text
```

This writes `Blorgh.Article` to `app/models/blorgh/article.ts`, a migration
creating `blorgh_articles`, a `Blorgh.ArticlesController`, its views under
`app/views/blorgh/articles/`, and a route.

The engine's routes are drawn on the engine, not the application:

<!-- typecheck:skip -->

```ts
// config/routes.ts
import { Blorgh } from "../lib/blorgh/engine.js";

Blorgh.Engine.instance()
  .routes()
  .draw(function () {
    this.resources("articles");
    this.root("articles#index");
  });
```

Because the engine is isolated, `articles#index` resolves to
`Blorgh.ArticlesController`, and the route helpers (`articlesPath`) are
available only inside the engine.

### Associations and Controllers

An engine model associates with another engine model by its short name, as
inside an app:

```ts
import { Base } from "@blazetrails/activerecord";

export class Comment extends Base {
  static {
    this.belongsTo("article");
  }
}
```

Controllers inherit from the engine's own `ApplicationController`, which the
generator writes as `Blorgh.ApplicationController`.

## Hooking Into an Application

### Mounting the Engine

The host adds the engine as a dependency in its `package.json`, then mounts it
in `config/routes.ts`:

<!-- typecheck:skip -->

```ts
import { Trails } from "@blazetrails/trailties";
import { Blorgh } from "blorgh";

Trails.application.routes().draw(function () {
  this.mount(Blorgh.Engine, { at: "/blog" });
});
```

Every engine route is now served under `/blog`. From the host, the engine's
routes are reached through a proxy named after the engine (`blorgh.articlesPath()`),
and from the engine the host's are reached through the `main_app` mounted helper.

### Engine Setup

Rails copies an engine's migrations into the host with
`railties:install:migrations`. That task is not ported yet, so copy the files
from the engine's `db/migrate/` into the host's by hand and run
`pnpm trails db:migrate`; see the [trailties package page](/packages/trailties).

### Using a Class Provided by the Application

An engine often needs a host model, such as the author of an article. Rather
than naming a host class, the engine reads the class name from a setting on
its namespace object, which the host fills in:

```ts
import { Base } from "@blazetrails/activerecord";

const Blorgh = { name: "Blorgh", authorClass: "User" };

export class Article extends Base {
  static {
    this.belongsTo("author", { className: Blorgh.authorClass });
  }
}
```

The setting is read when `Article` is defined, so the host sets
`Blorgh.authorClass` in an initializer, which runs before the autoloader loads
the engine's models.

### Configuring an Engine

An engine has its own `config`, read and written like the application's. An
initializer declared on the engine runs during the host's boot:

```ts
import { Trails } from "@blazetrails/trailties";

export class Engine extends Trails.Engine {
  static {
    this.initializer("blorgh.setup", () => {
      console.log("Blorgh is loading");
    });
  }
}
```

## Testing an Engine

`test/dummy/` is a full host app with the engine mounted, and the engine's
tests boot it. Run them from the engine's root:

<!-- typecheck:skip -->

```sh
pnpm trails test
```

Tests use Vitest; see the [trailties package page](/packages/trailties).
In a functional test, a request goes through the dummy app, so a route path
names the engine's mount point.

## Improving Engine Functionality

A host changes an engine's behavior without editing it:

- **Overriding views.** A view at the same path in the host, such as
  `app/views/blorgh/articles/index.html.tse`, is found before the engine's.
- **Overriding models and controllers.** The host reopens an engine class in
  an initializer, or includes a concern into it, through the
  [module mixins](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#module-mixins-ruby-include--typescript)
  trails uses for Ruby's `include`.
- **Routes.** The host can mount the engine more than once, at different
  paths, with `as:` naming each mount's route proxy.
- **Assets.** An engine's browser assets are served through the host's Vite
  build, not an asset pipeline; see
  [CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails).
- **Load hooks.** An engine that changes a framework class does so in an
  `onLoad` hook (see [Configuring](./configuring.md#load-hooks)), so it does
  not force the class to load early.
