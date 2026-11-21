---
title: Layouts and Rendering in Trails
description: How a controller action produces its response — implicit rendering, render's options, redirectTo, head, layouts, yield, contentFor and nested layouts.
---

# Layouts and Rendering in Trails

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [Action View Overview](./action-view-overview.md) ·
> [Action Controller Overview](./action-controller-overview.md) ·
> [actionview package](/packages/actionview) · [actionpack package](/packages/actionpack)

This guide follows a request from the end of a controller action to the HTML
the browser receives. After reading it you will know:

- What an action renders when it does not say.
- How to use `render`, `redirectTo` and `head`, and the options each takes.
- How layouts are chosen, and how a layout and a view pass content to each other.
- How to nest one layout inside another.

## Overview: How the Pieces Fit Together

The controller handles the request: it reads params, talks to models and sets
the values the view will need. It then hands off to Action View, which renders
a template, wraps it in a layout and fills in any partials. This guide is about
that hand-off. Partials themselves are covered in
[Action View Overview](./action-view-overview.md#partials).

## Creating Responses

An action has three ways to finish: render a template (or some other body),
redirect the browser, or send only headers.

### Rendering by Default: Convention Over Configuration in Action

An action that does nothing renders the template named after it:

```ts
import { ActionController } from "@blazetrails/actionpack";

class BooksController extends ActionController.Base {
  index() {
    // renders app/views/books/index.html.tse
  }
}
```

Template file names are kebab-case, so an action `bulkEdit` renders
`bulk-edit.html.tse`; the rule is in the
[actionpack package notes](https://github.com/blazetrailsdev/trails/blob/main/packages/actionpack/CLAUDE.md#an-actions-name-is-its-methods-name-abstractcontrollerbaseaction_methods).
Values the action sets on `this` are what the template reads as `this.books`.

### Using `render`

`render` renders explicitly. Call it at most once per action — a second call
raises `AbstractController.DoubleRenderError`. It returns a promise, so return
or `await` it.

#### Rendering an Action's View

Pass another action's name to render its template without running that
action's code. This is the usual shape for a failed form submission:

```ts
import { ActionController } from "@blazetrails/actionpack";

class BooksController extends ActionController.Base {
  update() {
    const saved = false;
    if (!saved) return this.render({ action: "edit", status: 422 });
    return this.redirectTo("/books");
  }
}
```

#### Rendering an Action's Template from Another Controller

`template` takes a path relative to `app/views/`:

```ts
import { ActionController } from "@blazetrails/actionpack";

class AdminProductsController extends ActionController.Base {
  show() {
    return this.render({ template: "products/show" });
  }
}
```

#### Using `render` with `:inline`

`inline` renders a template given as a string. Trails compiles every template
ahead of time, so an inline source has to be compiled at the call; see
[actionview's notes on precompiled templates](https://github.com/blazetrailsdev/trails/blob/main/packages/actionview/CLAUDE.md#templates-are-precompiled-templatecompiles-module_eval).
Prefer a template file.

#### Rendering Text, HTML, JSON, XML and a Raw Body

Each of these skips the template lookup and sends the value as the body, with
the matching content type:

```ts
import { ActionController } from "@blazetrails/actionpack";

class StatusController extends ActionController.Base {
  text() {
    return this.render({ plain: "OK" });
  }
  html() {
    return this.render({ html: "<strong>OK</strong>" });
  }
  json() {
    return this.render({ json: { status: "ok" } });
  }
  raw() {
    return this.render({ body: "raw", contentType: "text/plain" });
  }
}
```

`plain`, `json` and `body` render without a layout unless you pass `layout`.
A string passed to `html` is escaped unless it is marked HTML-safe.

#### Options for `render`

- `contentType` sets the `Content-Type` header.
- `layout` names the layout for this render, or `false` for none.
- `location` sets the `Location` header.
- `status` takes a number (`404`) or a status name (`"not_found"`).
- `formats` picks the format to look the template up in (`["json"]`).
- `variants` picks a template variant, such as `phone` in
  `show.html+phone.tse`.

#### Finding Layouts

Without any configuration, a controller uses
`app/views/layouts/<controller>.html.tse`, or, failing that, the layout of its
parent controller — so `layouts/application.html.tse` covers every controller
that inherits from `ApplicationController`.

The `layout` class method overrides that. It takes a name, `false`, or a
method name with a leading colon to decide per request:

```ts
import { ActionController } from "@blazetrails/actionpack";

class ProductsController extends ActionController.Base {
  static {
    this.layout("inventory");
  }
}

class CheckoutController extends ActionController.Base {
  static {
    this.layout(":productsLayout");
  }

  productsLayout(): string {
    return "checkout";
  }
}
```

A second argument restricts it to some actions:
`this.layout("product", { except: ["index", "rss"] })`. The setting is
inherited: a subclass keeps its parent's layout until it declares its own, and
`this.layout(null)` restores the lookup by controller name.

#### Avoiding Double Render Errors

An early `render` does not end the action. Return it, so the code after it
never runs a second `render`:

```ts
import { ActionController } from "@blazetrails/actionpack";

class BooksController extends ActionController.Base {
  show() {
    const special = this.params.fetch("special", null) != null;
    if (special) return this.render({ action: "special-show" });
    return this.render({ action: "regular-show" });
  }
}
```

### Using `redirectTo`

`redirectTo` answers with a `302 Found` pointing at another URL; the browser
then makes a new request there. Unlike `render`, the next action runs and
builds its own state.

```ts
import { ActionController } from "@blazetrails/actionpack";

class PhotosController extends ActionController.Base {
  destroy() {
    return this.redirectTo("/photos", { status: 303, notice: "Photo removed" });
  }
  back() {
    return this.redirectBackOrTo("/photos");
  }
}
```

`status` changes the code — `303 See Other` is the right answer after a
`DELETE` — and `notice` / `alert` set the flash. `redirectBackOrTo` sends the
browser to the `Referer`, or to the fallback when there is none.

### Using `head` to Build Header-Only Responses

`head` sends a status and headers with an empty body:

```ts
import { ActionController } from "@blazetrails/actionpack";

class PingController extends ActionController.Base {
  show() {
    return this.head("no_content");
  }
}
```

## Structuring Layouts

A layout can use three tools: asset tags, `yield` and `contentFor`, and
partials.

### Asset Tag Helpers

`stylesheetLinkTag`, `javascriptIncludeTag`, `imageTag`, `faviconLinkTag`,
`autoDiscoveryLinkTag`, `videoTag` and `audioTag` write the matching HTML tags.
They know nothing about where assets come from: Trails serves JavaScript and
CSS through Vite, with tags from `@blazetrails/vite-trails`; see
[CLAUDE.md, "importmap-rails and propshaft are out of scope"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails).

### Understanding `yield`

Inside a layout, `yield()` marks where the view's output goes:

```erb
<html>
  <head>
    <title><%= yield("title") %></title>
  </head>
  <body>
    <%= yield() %>
  </body>
</html>
```

A named `yield("title")` reads a region the view supplied with `contentFor`.

### Using the `contentFor` Method

A view hands content to a named region of its layout:

```erb
<% contentFor("title", "All books") %>
<h1>Books</h1>
```

`contentFor` with a trailing function captures a larger fragment —
`<% contentFor("sidebar", () => { %> ... <% }) %>` — and calling it twice
appends. `isContentFor("sidebar")` tells a layout whether the view filled the
region, so it can fall back to a default. `provide` fills a region the
same way; it differs from `contentFor` only when the response is streamed.

### Using Partials

Layouts render partials like any template — `<%= render("shared/menu") %>`
for a navigation bar shared across layouts. Locals, collections and partial
layouts are covered in
[Action View Overview](./action-view-overview.md#partials).

### Using Nested Layouts

One layout can extend another. A section of the site renders its own regions,
then hands off to the application layout:

```erb
<% contentFor("stylesheets", () => { %>
  <%= stylesheetLinkTag("news") %>
<% }) %>
<% contentFor("content", () => { %>
  <div id="news-menu"><%= yield() %></div>
<% }) %>
<%= render({ template: "layouts/application" }) %>
```

Here `layouts/news.html.tse` captures its markup into regions, then renders
`layouts/application`. The application layout writes
`<%= isContentFor("content") ? yield("content") : yield() %>`, so it shows the
news layout's wrapper when one was provided and the plain view otherwise.
