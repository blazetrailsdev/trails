---
title: Trails on Rack
description: How a trails application is a Rack app, how trails server runs it, and how to inspect, add, swap, move and delete middleware in its stack.
---

# Trails on Rack

> **See also:** [Guides index](./index.md) ·
> [Configuring Trails Applications](./configuring.md) ·
> [rack package](/packages/rack) · [actionpack package](/packages/actionpack) ·
> [trailties package](/packages/trailties)

Rack is the interface between a web server and an application: the server
hands the application a request as an `env` object, and the application
answers a status, headers and a body. A trails application is a Rack
application, and much of what it does to a request happens in a stack of
Rack middleware before the router sees it. This guide covers:

- How a trails app is a Rack app, and how `trails server` runs it.
- Listing the middleware an app runs.
- Adding, swapping, moving and deleting middleware.
- What the default middleware do.

It assumes you know what Rack and middleware are; the
[rack package page](/packages/rack) introduces both.

## Introduction to Rack

A Rack app is an object with a `call(env)` method that answers
`[status, headers, body]`. `@blazetrails/rack` is the port of the Rack gem,
and its types name the three parts:

```ts
import type { RackEnv, RackResponse } from "@blazetrails/rack";

export class HelloWorld {
  async call(_env: RackEnv): Promise<RackResponse> {
    return [200, { "content-type": "text/plain" }, ["Hello, world"]];
  }
}
```

`call` is async in trails, because reading a request body or a database is.

## Trails on Rack

### A Trails Application's Rack Object

The application is the app's Rack object. A new app's `config.ts` plays the
part of Rails' `config.ru`: it boots the app, exports it, and runs the
`server` blocks before a handler binds:

<!-- typecheck:skip -->

```ts
// config.ts
import { Trails } from "@blazetrails/trailties";

import "./config/environment.ts";

export const Config = Trails.application;

await Trails.application.loadServer();
```

`Trails.application.call(env)` sends the request through the middleware
stack and then to the router. Why the server blocks are awaited is ruled in
[packages/trailties/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#server-blocks-are-awaited).

### `trails server`

`trails server` reads `config.ts` and serves it through rackup's Node
handler. It never starts a Vite dev server; in development `bin/dev` runs
both, as ruled in
[`CLAUDE.md` § "importmap-rails and propshaft are out of scope"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails).

<!-- typecheck:skip -->

```sh
pnpm trails server -p 3000
```

### `rackup`

`rackup` serves the same `config.ts` without booting through `trails`:

<!-- typecheck:skip -->

```sh
pnpm rackup config.ts -p 3000
```

### Development and Auto-reloading

The middleware stack is built once, when the app boots. Changes under
`app/` are reloaded on the next request by the `Reloader` middleware, but a
change to the stack itself, or to `config/`, needs a server restart.

## Action Dispatcher Middleware Stack

Most of the stack comes from Action Dispatch. `ActionDispatch::MiddlewareStack`
holds it in order, and a request passes through each middleware, top to
bottom, before it reaches the router.

### Inspecting Middleware Stack

`trails middleware` prints the stack your app runs:

<!-- typecheck:skip -->

```sh
pnpm trails middleware
```

A new app prints something like this, with the app's routes at the end:

<!-- typecheck:skip -->

```sh
use ActionDispatch::HostAuthorization
use Rack::Sendfile
use ActionDispatch::Static
use ActionDispatch::Executor
use ActionDispatch::ServerTiming
use Rack::Runtime
use Rack::MethodOverride
use ActionDispatch::RequestId
use ActionDispatch::RemoteIp
use Trails::Rack::Logger
use ActionDispatch::ShowExceptions
use ActionDispatch::DebugExceptions
use ActionDispatch::ActionableExceptions
use ActionDispatch::Reloader
use ActionDispatch::Callbacks
use ActionDispatch::Cookies
use ActionDispatch::Session::CookieStore
use ActionDispatch::Flash
use ActionDispatch::ContentSecurityPolicy::Middleware
use ActionDispatch::PermissionsPolicy::Middleware
use Rack::Head
use Rack::ConditionalGet
use Rack::ETag
use Rack::TempfileReaper
run Blog::Application.routes
```

### Configuring Middleware Stack

`config.middleware` records changes to the default stack. They are replayed
in order when the stack is built, so they may name middleware that are only
added later in boot. Make them in the application class, or in an
environment's file for one environment only.

#### Adding a Middleware

`use` appends a middleware to the end of the stack. `insertBefore` and
`insertAfter` place it next to one already there, named by class or by
index; `unshift` puts it first. Arguments after the class are passed to its
constructor:

```ts
import { Executor } from "@blazetrails/actionpack";
import { Runtime } from "@blazetrails/rack";
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.middleware.use(Runtime, "X-Blog-Runtime");
    this.config.middleware.insertAfter(Executor, Runtime);
  }
}
```

#### Swapping a Middleware

`swap` replaces a middleware with another in the same position:

```ts
import { ShowExceptions } from "@blazetrails/actionpack";
import { Application } from "@blazetrails/trailties";

class MyShowExceptions extends ShowExceptions {}

class Blog extends Application {
  static {
    this.config.middleware.swap(ShowExceptions, MyShowExceptions);
  }
}
```

#### Moving a Middleware

`moveBefore` (or `move`) and `moveAfter` take a middleware out of its place
and put it next to another:

<!-- typecheck:skip -->

```ts
this.config.middleware.moveBefore(MyShowExceptions, ShowExceptions);
this.config.middleware.moveAfter(MyShowExceptions, ShowExceptions);
```

#### Deleting a Middleware

`delete` removes a middleware:

```ts
import { Lock } from "@blazetrails/rack";
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.middleware.delete(Lock);
  }
}
```

An API-only app (`config.apiOnly`) starts from a smaller stack without the
session, cookie and flash middleware; the [API-only guide](./api-app.md)
lists it.

### Internal Middleware Stack

What each default middleware does, in stack order. Several are added only
when a setting turns them on.

- **`HostAuthorization`** rejects a request whose `Host` is not in
  `config.hosts`.
- **`AssumeSSL`** and **`SSL`** treat requests as HTTPS behind a proxy, and
  force HTTPS, when `assumeSsl` and `forceSsl` are set.
- **`Rack::Sendfile`** hands file bodies to the server through the
  `X-Sendfile` header named by `config.actionDispatch.xSendfileHeader`.
- **`ActionDispatch::Static`** serves files from `public/` when
  `config.publicFileServer` is enabled.
- **`Rack::Lock`** serializes requests when the app is not thread-safe.
- **`ActionDispatch::Executor`** wraps each request in the app's executor,
  so per-request state is reset.
- **`ActionDispatch::ServerTiming`** adds a `Server-Timing` header when
  `config.serverTiming` is set.
- **`Rack::Runtime`** adds an `X-Runtime` header with the request's time.
- **`Rack::MethodOverride`** reads `_method` from a form to allow `PUT`,
  `PATCH` and `DELETE`.
- **`ActionDispatch::RequestId`** gives each request an `X-Request-Id`.
- **`ActionDispatch::RemoteIp`** works out the client's IP address.
- **`Trails::Rack::Logger`** logs the start of each request.
- **`ActionDispatch::ShowExceptions`** renders an error page for an
  exception, and **`DebugExceptions`** logs it and, in development, shows
  the details. **`ActionableExceptions`** lets that page run a fix, such as
  pending migrations.
- **`ActionDispatch::Reloader`** reloads changed code in development.
- **`ActionDispatch::Callbacks`** runs the prepare callbacks before each
  request.
- **`ActionDispatch::Cookies`**, the session store and
  **`ActionDispatch::Flash`** set up cookies, the session and the flash.
- **`ContentSecurityPolicy::Middleware`** and
  **`PermissionsPolicy::Middleware`** add those response headers.
- **`Rack::Head`** empties the body of a `HEAD` response.
- **`Rack::ConditionalGet`** and **`Rack::ETag`** answer `304 Not Modified`
  when the client's copy is fresh.
- **`Rack::TempfileReaper`** removes temporary files a multipart request
  left behind.

## Resources

### Learning Rack

The [rack package page](/packages/rack) covers the trails port: the env
keys, `Rack::Request` and `Rack::Response`, and the middleware it ships.

### Understanding Middlewares

A middleware is a Rack app that holds the next one. Its constructor takes
`app`, and its `call` runs code around `app.call(env)`:

```ts
import type { RackEnv, RackResponse } from "@blazetrails/rack";

interface RackApp {
  call(env: RackEnv): Promise<RackResponse>;
}

export class Timing {
  constructor(private app: RackApp) {}

  async call(env: RackEnv): Promise<RackResponse> {
    const started = performance.now();
    const [status, headers, body] = await this.app.call(env);
    console.log(`${env["PATH_INFO"]} took ${performance.now() - started}ms`);
    return [status, headers, body];
  }
}
```
