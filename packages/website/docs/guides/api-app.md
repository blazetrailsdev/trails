---
title: Using Trails for API-only Applications
description: Building a JSON API with Trails — generating an API-only app, what the lighter controller and middleware stack leave out, and how to add pieces back.
---

# Using Trails for API-only Applications

> **See also:** [Guides index](./index.md) ·
> [Action Controller Overview](./action-controller-overview.md) ·
> [actionpack package](/packages/actionpack) · [trailties package](/packages/trailties)

Many apps never render an HTML page. They answer a single-page front end, a
mobile client or other services, and speak JSON. Trails can build such an app
with a trimmed stack: no cookies, sessions, flash or views by default, and a
controller base class that carries only what an API needs. This guide covers:

- What an API-only app is, and what it keeps from a full Trails app.
- Generating a new API app, or switching an existing one over.
- Which middleware an API app runs, and how to change the list.
- Which controller modules `ActionController.API` includes, and adding more.

## What is an API Application?

Here an API application is a server whose clients are programs rather than
browsers. Requests and responses are JSON, authentication comes in a header
instead of a session cookie, and the front end, if there is one, is a separate
project that calls the server over HTTP.

## Why Use Trails for JSON APIs?

Leaving out views does not leave out much of the framework. An API app still
gets, among other things:

- The middleware that every app needs: request ids, remote IP resolution,
  exception pages in development, reloading, `HEAD` handling and conditional
  `GET` with ETags.
- Routing with resources, nesting, constraints and URL generation.
- Strong parameters, with JSON bodies parsed into `params` and, through the
  params wrapper, nested under the resource name.
- `render({ json })`, `head`, `redirectTo`, `rescueFrom`, callbacks, rate
  limiting and the instrumentation events described in
  [Active Support Instrumentation](./active-support-instrumentation.md).
- Active Record, Active Job, Action Mailer and the rest, unchanged.

## The Basic Configuration

### Creating a New Application

Pass `--api` to the app generator:

```sh
trails new my_api --api
```

That does three things. `config/application.ts` sets `config.apiOnly = true`,
which drops the browser-oriented middleware (see below).
`ApplicationController` extends `ActionController.API` instead of
`ActionController.Base`. And the generators are told to skip views, helpers
and assets.

### Generating a New Resource

With `apiOnly` set, `trails generate scaffold` writes the model, migration,
routes and a controller whose actions render JSON, with no templates:

```sh
trails generate scaffold Post title:string
```

A generated controller looks like this:

```ts
import { ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.API {
  async index() {
    const posts = await Post.all().toArray();
    return this.render({ json: posts });
  }

  async show() {
    const post = await Post.find(this.params.get("id"));
    return this.render({ json: post });
  }
}
```

### Changing an Existing Application

An existing app becomes API-only in two steps. Set the flag in
`config/application.ts`:

```ts
import { Application } from "@blazetrails/trailties";

class MyApi extends Application {
  static {
    this.config.apiOnly = true;
  }
}
```

Then change `ApplicationController` to inherit from `ActionController.API`:

```ts
import { ActionController } from "@blazetrails/actionpack";

export class ApplicationController extends ActionController.API {}
```

Controllers that still need browser features can keep extending
`ActionController.Base`; the two base classes live side by side.

## Choosing Middleware

With `apiOnly` on, the default stack skips the middleware a browser client
needs and a program does not: `MethodOverride`, `Cookies`, the session store,
`Flash`, the content security and permissions policy headers, and
`TempfileReaper`. Everything else in a full app's stack stays. The full list
is built by trailties' default middleware stack; `trails middleware` prints
the one your app runs.

### Using Rack::Cache

A full Rails app inserts `Rack::Cache` when `config.action_dispatch.rack_cache`
is set. trails does not insert it yet; see the
[trailties package page](/packages/trailties). Conditional `GET` with ETags,
`isStale` and `freshWhen` works without it.

### Using Rack::Sendfile

`ActionDispatch::Sendfile` is in the stack whatever the mode. When a front-end
server such as nginx serves files itself, name the header it reads:

```ts
import { Application } from "@blazetrails/trailties";

class MyApi extends Application {
  static {
    this.config.actionDispatch.xSendfileHeader = "X-Accel-Redirect";
  }
}
```

`sendFile` in a controller then sets that header and an empty body, and the
front-end server streams the file.

### Using ActionDispatch::Request

An API app reads JSON bodies like form bodies. A request whose
`Content-Type` is `application/json` has its body parsed into `params`, so a
controller reads `this.params.require("post")` for both. Other formats are
registered with `ActionDispatch.Request.parameterParsers`, a map from MIME type
to a parser function.

### Using Session Middlewares

Sessions are left out of an API app. To add cookie sessions back, put
`Cookies` and a session store into the stack in that order, since the store
reads the cookie jar:

```ts
import { Cookies, Session } from "@blazetrails/actionpack";
import { Application } from "@blazetrails/trailties";

class MyApi extends Application {
  static {
    this.config.middleware.use(Cookies);
    this.config.middleware.use(Session.CookieStore, { key: "_my_api_session" });
  }
}
```

A controller that reads `session` or `cookies` must also include the matching
controller module (below).

### Other Middleware

Any Rack middleware can be added with `config.middleware.use`, or placed
relative to another with `insertBefore` and `insertAfter`. A typical addition
is a CORS layer in front of everything else.

### Removing Middleware

`config.middleware.delete` takes a middleware class out of the default stack:

```ts
import { Cookies, Session } from "@blazetrails/actionpack";
import { Application } from "@blazetrails/trailties";

class MyApi extends Application {
  static {
    this.config.middleware.delete(Cookies);
  }
}
```

The middleware operations are recorded and replayed when the stack is built,
so they work in any order relative to `apiOnly`.

## Choosing Controller Modules

`ActionController.API` is `ActionController.Metal` with a list of modules
mixed in. The list is `ActionController.API.MODULES`: rendering and the JSON
renderers, URL generation, redirects, conditional `GET`, implicit `head`
rendering, strong parameters, rate limiting, caching, data streaming
(`sendFile` / `sendData`), default headers, logging, callbacks, `rescueFrom`,
instrumentation and the params wrapper.

`ActionController.Base` adds the modules a browser needs on top of that:
cookies, flash, sessions, CSRF protection, template rendering with layouts,
helpers, `respondTo`, HTTP basic, digest and token authentication, streaming
and content security policy.

To compare the two lists in your own app:

```ts
import { ActionController } from "@blazetrails/actionpack";

const apiModules = ActionController.API.MODULES;
const withoutCaching = ActionController.API.withoutModules("Caching");
console.log(apiModules.length, withoutCaching.length);
```

`withoutModules` returns the list minus the named modules, which is how a
custom `Metal` subclass starts from the API set and drops what it does not
use.

### Adding Other Modules

A module from `ActionController.Base`'s list can be mixed into an API
controller. trails spells Ruby's `include` as the `include()` function, as
described in the root `CLAUDE.md` section
["Module mixins"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#module-mixins-ruby-include--typescript).
Common additions are the cookies module, for reading a signed cookie; the
token half of HTTP authentication, for `authenticateOrRequestWithHttpToken`;
and `MimeResponds`, for `respondTo` when one action answers more than JSON.
Include them on `ApplicationController` so every API controller sees them.
