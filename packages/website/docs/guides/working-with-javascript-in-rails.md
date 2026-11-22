---
title: Working with JavaScript in Trails
description: How a Trails application bundles and serves JavaScript through Vite, adds npm packages, and uses Turbo and Stimulus for interactive pages without the Rails UJS helpers.
---

# Working with JavaScript in Trails

> **See also:** [Guides index](./index.md) ·
> [vite-assets package](/packages/vite-assets) ·
> [vite-trails package](/packages/vite-trails) ·
> [turbo package](/packages/turbo) ·
> [stimulus package](/packages/stimulus)

This guide covers the browser side of a Trails application:

- How JavaScript reaches the browser, and why Trails uses Vite for it.
- Adding npm packages.
- Turbo, for fast navigation, partial page updates and live updates.
- Doing what the old Rails UJS helpers did, with Turbo and Stimulus.

## Import Maps

A new Rails 8 application serves JavaScript with import maps through
importmap-rails, and its other assets through propshaft. Trails ports neither.
Vite does both jobs, through ports of the `vite_ruby` and `vite_rails` gems:
`@blazetrails/vite-assets` reads `config/vite.json` and resolves entries from
Vite's manifest, and `@blazetrails/vite-trails` renders the tags and proxies to
the Vite dev server in development. The ruling, and everything that follows
from it, is in
[CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails).

So `trails new` has no `--javascript importmap`; the default is `vite`, and the
generator runs `vite:install` for you.

## Adding npm Packages with JavaScript Bundlers

### Installing a Bundler

There is nothing to choose: Vite is the bundler. `vite:install` writes
`config/vite.json`, adds `vite` and `vite-plugin-ruby` to `package.json`, and
creates the entrypoint `app/javascript/entrypoints/application.js`. Every file
under `app/javascript/entrypoints/` is an entry Vite builds.

Trails applications use pnpm, so the generated app is a pnpm project and the
install tasks run `pnpm add`.

### Loading Entrypoints in a Layout

The layout loads an entrypoint by name with the Vite tag helpers:

<!-- typecheck:skip -->

```ts
<%- await context.viteClientTag() %>
<%- await context.viteJavascriptTag("application") %>
```

`viteClientTag` renders the Vite client, which enables hot reload, only while
the dev server is running; in production it renders nothing. In production
`viteJavascriptTag` reads the manifest and renders the digested file, with
`modulepreload` links for its imports. `viteTypescriptTag` and
`viteStylesheetTag` do the same for `.ts` and CSS entries.

### Running the Dev Server

`bin/dev` runs `Procfile.dev`, which starts the Trails server and
`bin/vite dev` side by side. Requests for assets reach the Trails server and
are proxied on to Vite.

```sh
bin/dev
```

### Adding a Package

Add a package with pnpm and import it from an entrypoint, or from any module an
entrypoint imports. Vite resolves it from `node_modules`.

```sh
pnpm add canvas-confetti
```

```js
import confetti from "canvas-confetti";

document.addEventListener("turbo:load", () => confetti());
```

Inside `app/javascript`, the `~/` prefix names the source directory, so
`import "~/controllers"` works from any depth.

### Building for Production

`bin/vite build` writes digested files and a manifest under `public/vite`.
Run it as part of the deploy, before the server starts.

## Choosing Between Import Maps and a JavaScript Bundler

There is no choice to make in Trails: Vite is the only path. In practice it
covers both cases Rails weighs against each other. A plain entrypoint with no
build step beyond what Vite does by default behaves much like an import map in
development, while TypeScript, JSX and CSS frameworks work without adding a
separate bundler. CSS goes through Vite as well; `trails new --css tailwind`
sets it up.

## Turbo

Turbo makes a server-rendered application feel like a single-page one, without
writing JavaScript for each page. `@blazetrails/turbo` is the turbo-rails port:
it adds `@hotwired/turbo-rails` to the app and supplies the server-side
helpers. Install it with:

```sh
bin/trails turbo:install
```

### Turbo Drive

Turbo Drive intercepts link clicks and form submissions, fetches the next page,
and swaps the `<body>` in place, keeping the JavaScript and CSS already loaded.
It is on as soon as Turbo is imported. Opt a link or form out with
`data-turbo="false"`.

### Turbo Frames

A Turbo Frame is a region of the page that navigates on its own. A link inside
a `<turbo-frame>` replaces only that frame with the matching frame from the
response. Frames can also load lazily from a `src`.

<!-- typecheck:skip -->

```ts
<%- await context.turboFrameTag("new_message", { src: "/messages/new" }) %>
```

### Turbo Streams

A Turbo Stream is a small instruction: append, prepend, replace, update or
remove a target element, with some HTML. A controller can answer a form
submission with a stream instead of a whole page, and a model can broadcast
streams to every subscribed page over Action Cable, so a change made by one user
appears on everyone's screen. The `turboStream` tag builder renders them, and
the broadcastable concern sends them; see the [turbo package](/packages/turbo)
for the full list.

## Replacements for Rails/UJS Functionality

Rails UJS once supplied `data-method`, `data-confirm` and remote forms. Trails
never had it; Turbo and Stimulus cover the same ground.

### Method

A link that should issue a `DELETE` or `PATCH` gets `data-turbo-method`. For
anything a crawler might follow, prefer `buttonTo`, which renders a real form.

```html
<a href="/posts/1" data-turbo-method="delete">Delete</a>
```

### Confirmations

`data-turbo-confirm` on a link or form asks the user before Turbo submits it.

```html
<a href="/posts/1" data-turbo-method="delete" data-turbo-confirm="Are you sure?">Delete</a>
```

### Ajax Requests

Forms submit through Turbo already. For a request from your own code, send the
CSRF token that `csrfMetaTags` renders in the layout with the request, so the
server accepts it:

```js
const token = document.querySelector("meta[name=csrf-token]").content;

await fetch("/posts/1/like", {
  method: "POST",
  headers: { "X-CSRF-Token": token },
});
```

### Stimulus

For behavior Turbo does not cover, write a Stimulus controller.
`@blazetrails/stimulus` is the stimulus-rails port: `stimulus:install` adds
`@hotwired/stimulus`, creates `app/javascript/controllers/`, and imports it from
the entrypoint. `controllers/index.js` is a static manifest of every
controller, regenerated by `stimulus:manifest:update` and by the
`stimulus` generator:

```sh
bin/trails generate stimulus clipboard
```

```js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["source"];

  copy() {
    navigator.clipboard.writeText(this.sourceTarget.value);
  }
}
```

Attach it with `data-controller="clipboard"`, and call `copy` from a button
with `data-action="clipboard#copy"`.
