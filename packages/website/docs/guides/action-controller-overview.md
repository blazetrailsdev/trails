---
title: Action Controller Overview
description: How a Trails controller receives a request, reads its parameters, keeps state in cookies and the session, runs callbacks, and builds a response.
---

# Action Controller Overview

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [Action Controller Advanced Topics](./action-controller-advanced-topics.md) ·
> [actionpack package](/packages/actionpack)

This guide follows a request from the router into a controller and back out
as a response. After reading it you will know:

- What a controller is for and where it sits in a request.
- How to define one and expose actions on it.
- How request parameters arrive, and how to filter them before they reach a
  model.
- How to store small pieces of state in cookies and in the session.
- How to run code before, after, and around an action.
- What the `request` and `response` objects carry.

## Introduction

A controller is the piece of the application that turns an incoming HTTP
request into an outgoing response. The router decides _which_ controller and
action handle a given path; the controller then does the work for that one
request: it reads the parameters, asks models for data, and either renders a
template or redirects somewhere else.

Keeping that coordination in the controller lets models stay focused on data
and views stay focused on presentation. In Trails the controller classes come
from `@blazetrails/actionpack`, under the `ActionController` namespace, exactly
as they are laid out in Rails.

## Creating a Controller

A controller is a class that extends `ActionController.Base`. By convention it
is named after the resource it manages, in the plural, with a `Controller`
suffix, and it lives in `app/controllers/` in a file named in kebab-case
(`posts-controller.ts`).

Each public instance method is an _action_: the router can send a request to
it. When an action finishes without rendering or redirecting, the controller
renders the template that matches the controller and action names.

```ts
import { ActionController } from "@blazetrails/actionpack";

export class PostsController extends ActionController.Base {
  index() {
    // Nothing rendered explicitly: app/views/posts/index renders.
  }

  show() {
    return this.render({ plain: `post ${String(this.params.fetch("id", null))}` });
  }
}
```

An action is named after its method, in camelCase, everywhere it is mentioned;
the file and locale key named after an action use kebab-case. That rule is in
the [actionpack package notes](/packages/actionpack).

Most applications define one `ApplicationController` that every other
controller extends, and put shared behaviour (authentication, error handling)
there:

```ts
import { ActionController } from "@blazetrails/actionpack";

export class ApplicationController extends ActionController.Base {}

export class CommentsController extends ApplicationController {
  create() {
    return this.redirectTo("/comments", { notice: "Comment added" });
  }
}
```

`redirectTo` returns a promise; return or `await` it so the redirect is part of
the action's result. See [Trails Idioms](./idioms.md) for why so much of the
request cycle is async.

## Parameters

A request can carry data in two places: the query string of the URL, and the
body of a `POST`/`PATCH`/`PUT` request (form fields or JSON). The router adds a
third source, the dynamic segments of the matched route (`/posts/:id`).
Action Controller merges all three into one `params` object on the controller,
so an action does not care where a value came from.

`params` is an `ActionController.Parameters`. Keys are strings and read the
same whether the route named them or a form did:

```ts
import { ActionController } from "@blazetrails/actionpack";

class SearchController extends ActionController.Base {
  index() {
    const query = this.params.fetch("q", "");
    return this.render({ plain: `searching for ${String(query)}` });
  }
}
```

Nested form fields (`post[title]`, `post[tags][]`) arrive as nested hashes and
arrays. A JSON body is parsed into the same shape, and when the params wrapper
is enabled the JSON keys are also nested under the controller's resource name,
so a form post and a JSON post look alike to the action.

## Strong Parameters

Passing `params` straight into a model would let a caller set any attribute,
including ones they should not touch. Strong parameters make the action list
what it accepts. `require` insists that a key is present and raises
`ActionController.ParameterMissing` (a 400 response) when it is not; `permit`
keeps only the named keys; `expect` does both in one call.

```ts
import { ActionController } from "@blazetrails/actionpack";

const params = new ActionController.Parameters({
  post: { title: "Hello", body: "World", admin: true },
});

const postParams = params.require("post") as ActionController.Parameters;
const allowed = postParams.permit("title", "body");

allowed.isPermitted(); // true — and `admin` is gone
```

An array of scalars is permitted with an empty array, and a nested hash with
the list of its own permitted keys:

```ts
import { ActionController } from "@blazetrails/actionpack";

const params = new ActionController.Parameters({
  post: { title: "Hi", tags: ["a", "b"], author: { name: "Ada", role: "admin" } },
});

(params.require("post") as ActionController.Parameters).permit(
  "title",
  { tags: [] },
  { author: ["name"] },
);
```

Inside a controller the usual shape is a private method that both `create` and
`update` call, so the permitted list lives in one place.

## Cookies

A cookie is a small value the browser stores and sends back on every request
to the same site. `this.cookies` is the request's cookie jar: read a cookie by
name, write one by assigning to it, and remove one with `delete`.

The jar has three chained jars for values that need protection:

- `cookies.permanent` sets an expiry twenty years out.
- `cookies.signed` signs the value, so the browser can read it but cannot
  change it without detection.
- `cookies.encrypted` encrypts it, so the browser can neither read nor change
  it.

Signed and encrypted cookies use keys derived from the application's
`secret_key_base`, so a value written by one deployment is readable by the
next as long as that secret is unchanged.

## Session

The session keeps state across requests for one visitor: who is signed in,
what is in a cart. By default it is stored in an encrypted cookie, so it needs
no server-side storage but must stay small (a cookie holds about 4 KB). Larger
or more sensitive state belongs in a database-backed store, with only an id in
the cookie.

`this.session` reads and writes values by key. `resetSession()` discards the
whole session and is the right call on sign-out, so nothing from the previous
visitor carries over.

The **flash** is a part of the session that lives for exactly one more
request. An action sets `flash.notice` or `flash.alert` and redirects; the
next page displays it, and it is gone afterwards. `redirectTo` takes `notice`
and `alert` options as a shorthand for that pattern, as in the
`CommentsController` example above.

## Controller Callbacks

Callbacks run code before, after, or around an action. A `beforeAction` that
renders or redirects stops the request: the action itself never runs. That
makes it the natural place for authentication and for loading the record that
several actions share.

Callbacks are declared in a `static` block, by method name (written as a
`":name"` string, the Trails spelling of a Ruby symbol) or as a function that
receives the controller:

```ts
import { ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.Base {
  static {
    this.beforeAction(":requireLogin");
    this.beforeAction(":setPost", { only: ["show", "edit", "update"] });
    this.afterAction((controller) => {
      controller.response.setHeader("X-Served-By", "posts");
    });
    this.aroundAction(":timeAction", { except: "index" });
  }

  requireLogin(): void {}
  setPost(): void {}
  timeAction(): void {}
}

class PublicPostsController extends PostsController {
  static {
    this.skipBeforeAction(":requireLogin");
  }
}
```

`only` and `except` limit a callback to some actions. `skipBeforeAction` (and
its `after`/`around` siblings) remove an inherited callback in a subclass, so
an `ApplicationController` can require login everywhere and a handful of
public controllers can opt out.

An `afterAction` runs only when the action completed; an `aroundAction`
receives a block and must call it for the action to run at all.

## The Request and Response Objects

Every controller has a `request` describing what arrived and a `response` it
is building.

The request exposes the HTTP method, the full URL and its parts (`host`,
`path`, `queryString`), the remote IP, the parsed `Accept` and `Content-Type`
headers, and the raw headers themselves. `request.queryParameters`,
`request.requestParameters` and `request.pathParameters` hold the three
sources that `params` merges, if an action ever needs to tell them apart.

The response is mostly managed for you: rendering sets its body and content
type, redirecting sets its status and `Location`. An action or callback can
still set a status or a header directly:

```ts
import { ActionController } from "@blazetrails/actionpack";

class HealthController extends ActionController.Base {
  show() {
    this.response.setHeader("Cache-Control", "no-store");
    return this.head("ok");
  }
}
```

`head` sends a response with headers and no body, which suits API endpoints
and health checks.

## Where to go next

- [Action Controller Advanced Topics](./action-controller-advanced-topics.md)
  covers forgery protection, HTTP authentication, file downloads, log
  filtering, and error handling.
- [actionpack](/packages/actionpack) lists each deviation from Rails the
  package carries.
