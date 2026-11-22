---
title: Trails Routing from the Outside In
description: How the trails router maps URLs to controller actions, how resources, namespaces, nesting and constraints build routes, and how to inspect and test them.
---

# Trails Routing from the Outside In

> **See also:** [Guides index](./index.md) ·
> [Action Controller Overview](./action-controller-overview.md) ·
> [Trails on Rack](./rails-on-rack.md) ·
> [actionpack package](/packages/actionpack)

The router reads a request's verb and path and picks the controller action
that answers it. It also works the other way: from a route's name it builds
the path and URL helpers your views and controllers call. This guide covers:

- How routes in `config/routes.ts` map to actions.
- Resourceful routes, singular resources, namespaces and nesting.
- Non-resourceful routes: segments, defaults, names and constraints.
- Customizing resourceful routes.
- Inspecting routes and testing them.

## The Purpose of the Trails Router

### Routing Incoming URLs to Code

A route pairs a verb and a path pattern with a `controller#action` target.
When `GET /patients/17` arrives, a route like this one sends it to
`PatientsController`'s `show` action with `{ id: "17" }` in `params`:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.get("/patients/:id", { to: "patients#show" });
});
```

Routes are matched in the order they are drawn, and the first match wins.

### Generating Paths and URLs from Code

Give a route a name with `as`, and the router defines `patientPath` and
`patientUrl` helpers for it:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.get("/patients/:id", { to: "patients#show", as: "patient" });
});
```

`patientPath({ id: 17 })` answers `"/patients/17"`, and `patientUrl` adds the
protocol and host. Helper names are camelCase, as ruled in
[`CLAUDE.md` § "Fidelity is the job"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#fidelity-is-the-job).

### Configuring the Trails Router

An app's routes live in `config/routes.ts`. The block passed to `draw` runs
with the router's mapper as `this`, so it must be a `function`, not an arrow
function. Every nested block (`resources`, `namespace`, `scope`) works the
same way.

## Resource Routing: the Trails Default

### Resources on the Web

`resources` declares the seven conventional routes for a collection in one
line:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("photos");
});
```

### CRUD, Verbs, and Actions

That one call draws:

| Verb        | Path               | Action    | Helper          |
| ----------- | ------------------ | --------- | --------------- |
| GET         | `/photos`          | `index`   | `photosPath`    |
| GET         | `/photos/new`      | `new`     | `newPhotoPath`  |
| POST        | `/photos`          | `create`  | `photosPath`    |
| GET         | `/photos/:id`      | `show`    | `photoPath`     |
| GET         | `/photos/:id/edit` | `edit`    | `editPhotoPath` |
| PATCH / PUT | `/photos/:id`      | `update`  | `photoPath`     |
| DELETE      | `/photos/:id`      | `destroy` | `photoPath`     |

An action is the controller method of the same name, as ruled in
[packages/actionpack/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/actionpack/CLAUDE.md#an-actions-name-is-its-methods-name-abstractcontrollerbaseaction_methods).

### Path and URL Helpers

Each named route has a `…Path` helper (a relative path) and a `…Url` helper
(an absolute URL). Helpers for a member route take the record or its id.

### Defining Multiple Resources at the Same Time

`resources` takes several names: `this.resources("photos", "books", "videos")`.

### Singular Resources

`resource` declares a resource a client looks up without an id, such as the
signed-in user's profile. It has no `index` action, and its paths carry no
`:id`:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resource("geocoder");
});
```

A singular resource still maps to a plural controller, `GeocodersController`.

### Controller Namespaces and Routing

`namespace` prefixes the path, the helper names and the controller module:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.namespace("admin", function () {
    this.resources("articles");
  });
});
```

`GET /admin/articles` reaches `Admin.ArticlesController#index`, through
`adminArticlesPath`.

#### Using Module

`scope({ module: "admin" }, …)` keeps the path and helpers unprefixed and only
looks the controller up under `Admin`.

#### Using Scope

`scope("/admin", …)` prefixes the path only, and leaves controllers and
helpers alone:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.scope("/admin", function () {
    this.resources("articles");
  });
});
```

### Nested Resources

A resource that belongs to another nests inside it:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("magazines", function () {
    this.resources("ads");
  });
});
```

`GET /magazines/3/ads` reaches `AdsController#index` with `magazineId` in
`params`, and the helpers become `magazineAdsPath` and `magazineAdPath`.

#### Limits to Nesting

Nest at most one level deep. Deeper nesting builds long URLs and helpers that
need every ancestor's id.

#### Shallow Nesting

`shallow` nests only the collection actions (`index`, `new`, `create`), and
draws the member actions at the top level, where the record's own id is
enough:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("articles", { shallow: true }, function () {
    this.resources("comments");
  });
});
```

### Routing Concerns

A concern names a group of routes to reuse in several resources:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.concern("commentable", null, function () {
    this.resources("comments");
  });

  this.resources("messages", { concerns: "commentable" });
  this.resources("articles", { concerns: ["commentable"] });
});
```

### Creating Paths and URLs from Objects

`urlFor` and `linkTo` take a record, or an array of records for a nested
route, and pick the helper from the model's name: `[magazine, ad]` resolves
to `magazineAdPath(magazine, ad)`.

### Adding More RESTful Routes

#### Adding Member Routes

`member` adds a route that acts on one record:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.resources("photos", function () {
    this.member(function () {
      this.get("preview");
    });
  });
});
```

`GET /photos/1/preview` reaches `PhotosController#preview`, through
`previewPhotoPath`. A single member route can also be written
`this.get("preview", { on: "member" })`.

#### Adding Collection Routes

`collection` adds a route that acts on the whole set, such as
`GET /photos/search` through `searchPhotosPath`. The one-line form is
`this.get("search", { on: "collection" })`.

#### Adding Routes for Additional New Actions

`this.get("preview", { on: "new" })` adds `GET /photos/new/preview`.

## Non-Resourceful Routes

### Bound Parameters, Dynamic and Static Segments

A path segment that starts with `:` is a parameter; any other segment must
match literally. `this.get("photos/:id/with_user/:userId", { to: "photos#show" })`
puts both `id` and `userId` in `params`.

### The Query String

Query string parameters are merged into `params` as well, so
`/photos/1?userId=2` adds `userId`.

### Defining Default Parameters

`defaults` supplies parameters a path does not carry, such as a format:
`this.get("photos/:id", { to: "photos#show", defaults: { format: "jpg" } })`.

### Naming Routes

`as` names any route, as shown above. `this.get("exit", { to: "sessions#destroy", as: "logout" })`
defines `logoutPath`.

### HTTP Verb Constraints

`get`, `post`, `patch`, `put` and `delete` each match one verb. `match` takes
a `via` list for a route that answers several:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.match("photos", { to: "photos#show", via: ["get", "post"] });
});
```

### Segment Constraints

A regular expression restricts what a segment may hold:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.get("photos/:id", { to: "photos#show", constraints: { id: /[A-Z]\d{5}/ } });
});
```

### Request-Based and Advanced Constraints

A constraint key that is not a segment name is tested against the request,
such as `{ subdomain: "admin" }`. An object with a `matches(request)` method,
or a function of the request, decides a route by any rule:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.constraints({ subdomain: "admin" }, function () {
    this.resources("photos");
  });
});
```

### Wildcard Segments and Format Segments

A segment written `*path` matches the rest of the path, slashes included.
Every route accepts an optional `.:format` suffix unless it passes
`format: false`.

### Redirection

`redirect` answers a route with a 301 to another path, interpolating its
segments:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.routes().draw(function () {
  this.get("/stories/:name", { to: this.redirect("/articles/%{name}") });
});
```

### Routing to Rack Applications

`to` also takes any Rack app, and `mount` serves one under a path prefix,
as an engine is in [Getting Started with Engines](./engines.md).

### Using `root`

`this.root("pages#main")` routes `GET /` and defines `rootPath`. A namespace
may have its own root.

### Direct Routes and Using `resolve`

`direct` defines a URL helper whose body you write, typically for an
external URL. `resolve` tells `urlFor` which route a model maps to when its
name alone would pick the wrong one. Both are called only at the top of
`draw`, not inside a scope.

## Customizing Resourceful Routes

- `controller` picks another controller: `this.resources("photos", { controller: "images" })`.
- `constraints: { id: /[A-Z]\d{5}/ }` restricts the `:id` of every member route.
- `as` renames the helpers: `this.resources("photos", { as: "images" })`.
- `pathNames` renames the `new` and `edit` segments: `{ pathNames: { new: "make", edit: "change" } }`.
- `only` and `except` restrict the routes drawn: `{ only: ["index", "show"] }`.
- `path` changes the URL segment while keeping the controller and helpers, which is how a translated path is written.
- `param` renames the `:id` parameter: `this.resources("videos", { param: "identifier" })`.

A parametric scope, `this.scope(":accountId", function () { … })`, prefixes
every route inside it with a parameter.

## Inspecting Routes

### Listing Existing Routes

`trails routes` prints every route with its helper name, verb, path and
target:

<!-- typecheck:skip -->

```sh
pnpm trails routes
pnpm trails routes --expanded
```

### Searching Routes

`-g` filters by a pattern matched against helper, verb and path; `-c` filters
by controller:

<!-- typecheck:skip -->

```sh
pnpm trails routes -g new_comment
pnpm trails routes -c users
```

### Listing Unused Routes

`trails routes --unused` lists routes whose controller has no matching
action.

## Testing Routes

`IntegrationTest` from `@blazetrails/actionpack/testing` carries the three
routing assertions:

- `assertGenerates(expectedPath, options)` checks that the options build that path.
- `assertRecognizes(expectedOptions, path)` checks that the path routes to those options.
- `assertRouting(path, options)` checks both directions at once.

```ts
import { describe, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";

class RoutesTest extends IntegrationTest {}

describe("RoutesTest", () => {
  it<{ testCase: RoutesTest }>("routes to photos#show", ({ testCase: t }) => {
    t.assertRouting("/photos/1", { controller: "photos", action: "show", id: "1" });
  });
});
```

[Testing Trails Applications](./testing.md) covers how a test case is wired
into Vitest.
