---
title: Getting Started with Trails
description: Build the framework, generate an application, scaffold a resource and serve it.
---

# Getting Started with Trails

This guide takes you from a checkout of the trails repository to a running
application with one resource, `Post`, that you can list, create, edit and
delete in the browser. Along the way it generates a model and its migration,
a controller with its views and routes, and starts the development server.

Every command and output block below is included from the
[README Quickstart](https://github.com/blazetrailsdev/trails#quickstart) when
this site is built. CI runs that Quickstart command by command and diffs each
output block against what the run prints (`scripts/quickstart/run.sh`), so
what you read here is what the current `main` does.

trails is TypeScript, so there is no Ruby to install. You need Node 26 or
later and pnpm, which corepack provides.

## Build the framework

trails is not on the npm registry yet, so an application links against a
local checkout. Clone it, install its dependencies and compile it once:

<!--@include: ../../../../README.md#quickstart-build-->

`$TRAILS` now names the checkout; later steps use it to find the `trails`
executable and the packages.

## Create an application

`trails new` lays out an application the way `rails new` does: `app/` for
models, controllers and views, `config/` for routes, the database and the
environments, and `db/` for migrations and the schema. Templates are `.tse`
files, trails' typed counterpart to ERB.

<!--@include: ../../../../README.md#quickstart-new-->

From here on, run commands from inside `blog/`. `bin/trails` is the
application's own copy of the command line.

## Generate a model, a controller and routes

The scaffold generator writes everything one resource needs: a migration and
a model, a controller with the seven REST actions, its views, a
`resources("posts")` line in `config/routes.ts`, a helper and tests. Running
the migration creates the `posts` table in the development SQLite database
and dumps the result to `db/schema.ts`.

<!--@include: ../../../../README.md#quickstart-scaffold-->

## Talk to the database

The model has no attribute declarations: `title` and `body` are read from the
table when the class first touches it. Queries are async, so every call that
reaches the database is awaited, while building a relation (`where`, `order`,
`limit`) is not.

<!--@include: ../../../../README.md#quickstart-query-->

## Start the server

<!--@include: ../../../../README.md#quickstart-server-->

Visit `/posts`, create a post, edit it and delete it. A validation added to
the model shows up as form errors after a restart; a change to a view shows
up on the next request.

## Where to go next

- [Trails Idioms](./idioms.md) translates the naming, async, options-object
  and block conventions every other guide relies on.
- The [package pages](/packages/) list each package's ratified deviations from
  Rails.
- The [examples](https://github.com/blazetrailsdev/trails/tree/main/examples)
  run the same kind of application on a single server, on AWS Lambda and on
  Cloudflare Workers.
