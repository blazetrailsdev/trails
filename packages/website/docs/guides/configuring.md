---
title: Configuring Trails Applications
description: Where a Trails app's configuration lives, the order it runs in, and the settings each framework reads.
---

# Configuring Trails Applications

> **See also:** [Guides index](./index.md) ·
> [Getting Started with Engines](./engines.md) ·
> [trailties package](/packages/trailties)

A trails application is configured in TypeScript. Every file that Rails keeps
as Ruby under `config/` has a `.ts` counterpart in a generated app, and each
one writes to the same `config` object. This guide covers:

- The files that hold configuration and the order they load in.
- Settings for the application itself and for each framework.
- Initializers, load hooks and initialization events.
- Database pool settings.
- Configuration of your own, under `config.x` and `configFor`.

## Locations for Initialization Code

Four places run configuration code, in this order:

1. `config/application.ts`, the application class.
2. `config/environments/<env>.ts`, one file per environment, which overrides
   the application class for that environment.
3. `config/initializers/*.ts`, run once the frameworks are loaded.
4. `afterInitialize` blocks, run last, once everything else is set.

A setting made in an environment file wins over one in the application class,
because the environment file runs later.

## Running Code Before Trails

Code that must run before the framework loads goes at the top of
`config/application.ts`, ahead of the `Application` subclass. The generated
file imports `./boot.ts` first, which sets up the package resolution, and then
requires the packages listed in `package.json` for the current groups.

## Configuring Trails Components

The application class's static block is where most settings live. `config`
is the application's `Configuration`, and every framework reads its own
namespace from it:

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.loadDefaults("8.0");
    this.config.timeZone = "Central Time (US & Canada)";
    this.config.eagerLoadPaths.push("extras");
  }
}
```

Setting names are camelCase where Rails spells them in snake_case:
`config.time_zone` is `config.timeZone`, `config.active_record` is
`config.activeRecord`. Values that are symbols in Ruby, such as a log level or
a week day, are strings that keep their colon (`":monday"`); see the
[trailties package page](/packages/trailties) for the full list.

### Versioned Default Values

`config.loadDefaults(version)` turns on the defaults of a given framework
version and of every version before it. A generated app calls it with the
version that generated it, so upgrading trails never changes a running app's
behavior until you raise the number.

### General Settings

These live directly on `config`:

| Setting                         | What it controls                                              |
| ------------------------------- | ------------------------------------------------------------- |
| `eagerLoad`                     | Load every application file at boot rather than on first use. |
| `enableReloading`               | Reload application code when it changes, for development.     |
| `considerAllRequestsLocal`      | Show full error pages to every request.                       |
| `timeZone`                      | The default zone for times read from and written to the app.  |
| `beginningOfWeek`               | The first day of the week for date calculations.              |
| `logLevel`, `logTags`, `logger` | How and how much the app logs (see the debugging guide).      |
| `filterParameters`              | Parameter names to redact from logs and error pages.          |
| `hosts`                         | The hosts a request may name, guarding against DNS rebinding. |
| `forceSsl`, `assumeSsl`         | Redirect to HTTPS, or treat every request as already secure.  |
| `apiOnly`                       | Build a smaller middleware stack (see the API-only guide).    |
| `secretKeyBase`                 | The secret behind signed and encrypted cookies and verifiers. |
| `requireMasterKey`              | Refuse to boot without a key for encrypted credentials.       |
| `publicFileServer`              | Whether and how files under `public/` are served.             |
| `serverTiming`                  | Add a `Server-Timing` header to each response.                |

### Configuring Middleware

`config.middleware` records changes to the default stack, which are replayed
when the stack is built:

```ts
import { Cookies } from "@blazetrails/actionpack";
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.middleware.delete(Cookies);
  }
}
```

`use`, `insertBefore`, `insertAfter`, `swap` and `delete` are available.
`trails middleware` prints the stack your app runs.

### Configuring Generators

`config.generators()` sets the defaults `trails generate` uses:

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.generators().apiOnly = true;
  }
}
```

### Framework Settings

Each framework adds its own namespace once its trailtie is imported:
`config.activeRecord`, `config.actionController`, `config.actionDispatch`,
`config.actionMailer`, `config.activeJob`, `config.activeStorage` and the rest.
Importing the trailtie module also gives the namespace its type:

```ts
import "@blazetrails/trailties/trailties/active-record";
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.activeRecord.verboseQueryLogs = true;
  this.config.activeRecord.queryLogTagsEnabled = true;
});
```

Each framework's guide lists its own settings: see
[Action Mailer Basics](./action-mailer-basics.md#action-mailer-configuration),
[Active Storage Overview](./active-storage-overview.md) and
[Active Job Basics](./active-job-basics.md).

## Trails Environment Settings

The environment is read from `TRAILS_ENV`, and falls back to `development`.
`Trails.env` answers it, with a predicate per name:

```ts
import { Trails } from "@blazetrails/trailties";

if (Trails.env.isProduction()) {
  console.log("running in production");
}
```

`TRAILS_RELATIVE_URL_ROOT` sets `config.relativeUrlRoot`, for an app served
under a sub-path. `TRAILS_MASTER_KEY` supplies the credentials key where the
key file is absent.

## Using Initializer Files

Each file under `config/initializers/` runs once, after the frameworks are
loaded and before the app serves its first request. Files run in alphabetical
order, so a numeric prefix orders them when one depends on another.

```ts
// config/initializers/inflections.ts
import { inflections } from "@blazetrails/activesupport";

inflections("en", (inflect) => {
  inflect.irregular("person", "people");
});
```

An initializer can also be declared on a trailtie or engine with
`initializer(name, block)`, which lets other initializers order themselves
with `before` and `after`.

## Load Hooks

A framework's base class is loaded lazily. Code that changes it should not
import it eagerly but register a load hook, which runs when the class first
loads, or at once if it already has:

```ts
import { onLoad } from "@blazetrails/activesupport";

onLoad("active_record", (base) => {
  console.log("Active Record loaded", base);
});
```

Hook names keep their Rails spelling (`active_record`, `action_controller`,
`action_view`), since gems and plugins already register under them.

## Initialization Events

A trailtie's `config` offers four callbacks, which fire in this order:

- `beforeConfiguration`, as the application class is defined.
- `beforeInitialize`, ahead of the initialization process.
- `toPrepare`, after the initializers and before each code reload.
- `afterInitialize`, once the app is fully initialized.

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.afterInitialize((app) => {
      console.log(`${app.name()} is ready`);
    });
  }
}
```

The initializers trails runs, in order, are printed by `trails initializers`.

## Database Pooling

Each connection pool holds up to `pool` connections, set per database in
`config/database.ts`. A request or job checks out one connection and returns
it when done, so the pool should be at least as large as the server's
concurrency. A checkout that waits longer than `checkoutTimeout` seconds
raises `ActiveRecord.ConnectionTimeoutError`. Because one Node process serves
many requests concurrently, size the pool by how many queries may be in flight
at once, not by a thread count; see the
[activerecord package page](/packages/activerecord).

## Custom Configuration

`config.x` holds settings of your own. Each name you read under it is a nested
options object, so no declaration is needed:

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.x.payment.retries = 3;
    this.config.x.superDebugger = true;
  }
}
```

For settings that differ by environment, `configFor` reads a file under
`config/`, picks the current environment's section and merges in any `shared`
section:

<!-- typecheck:skip -->

```ts
const payment = await Trails.application.configFor("payment");
payment.retries;
```

## Search Engines Indexing

A generated app writes `public/robots.txt`. Edit it to tell crawlers which
paths to skip; it is a static file and needs no configuration.
