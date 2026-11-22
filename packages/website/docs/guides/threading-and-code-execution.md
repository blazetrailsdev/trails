---
title: Threading and Code Execution in Trails
description: How Trails runs requests concurrently on Node's event loop, what the Executor and Reloader wrap around application code, and how the load interlock keeps reloading safe.
---

# Threading and Code Execution in Trails

> **See also:** [Guides index](./index.md) ·
> [activesupport package](/packages/activesupport) ·
> [trailties package](/packages/trailties)

A Trails process serves many requests at once. This guide explains how that
works, and what you need to do when your own code runs outside a request:

- What concurrency Trails gives you without any configuration.
- The Executor, which marks the start and end of a unit of application work.
- The Reloader, which swaps in changed code between units of work.
- What the framework itself does at each of those boundaries.
- The load interlock, which keeps a reload from happening while code runs.

## Automatic Concurrency

A Ruby server reaches concurrency with threads, and each thread runs one
request at a time. Node has one JavaScript thread and an event loop, so a
Trails server reaches it differently: while one request waits on the database,
a file or the network, the loop runs another. Every request in the process
shares the same JavaScript heap, and each `await` is a point where another
request may run.

Trails keeps Rails' vocabulary for this. ruby-compat's `Thread` is a unit of
background work that owns its promise, and state Rails keeps per thread is kept
per execution context instead. That is what `IsolatedExecutionState` stores:
each request, job or `Thread` sees its own values, even though they all run on
one JavaScript thread. Two rules follow from it, and both are ruled repo-wide:

- Every promise has an owner. Background work is a `Thread`, never a promise
  left to float; see
  [CLAUDE.md, "Every promise has an owner"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#every-promise-has-an-owner-async-initialize-is-an-awaited-static-new-rfc-0234).
- A block that pushes onto a per-context stack gets its own copy for the
  duration of the block, so two concurrent blocks never see each other's
  entries; see
  [CLAUDE.md, "A thread-local block stack forks per async block"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#a-thread-local-block-stack-forks-per-async-block-isolatedexecutionstatefork).

```ts
import { Thread } from "@blazetrails/ruby-compat";

const worker = new Thread(async () => {
  return 42;
});

const answer = await worker.value();
```

You get this for free from the server, from Active Job workers and from Action
Cable. You need the rest of this guide only when you start work of your own: a
background `Thread`, a script, a custom queue consumer.

## Executor

The Executor brackets a unit of application work. Before the work starts it
runs its `toRun` callbacks; when the work finishes, whether it returned or
raised, it runs its `toComplete` callbacks. The framework hangs its per-request
bookkeeping on those two hooks, so code that runs outside a request should be
wrapped the same way.

### Default Callbacks

Out of the box the Executor's callbacks return database connections to their
pool, clear the query cache, reset per-request state such as
`CurrentAttributes`, and report an unhandled error through
`Trails.error`. None of this happens for code that is not wrapped, which is how
a long-lived script ends up holding a connection forever.

### Wrapping Application Code

Wrap the work in `Trails.application!.executor.wrap`. The block may be async;
`wrap` then returns a promise that settles after the complete callbacks have
run.

```ts
import { Trails } from "@blazetrails/trailties";

await Trails.application!.executor.wrap(async () => {
  // Application code: queries, jobs, mailers.
});
```

A wrap inside a wrap does nothing extra: `wrap` checks whether an execution is
already active and, if so, just calls the block. So a library can wrap
defensively without worrying about where it is called from.

Errors raised inside the block are reported as unhandled with the source
`application.active_support`, then re-raised. Pass `{ source }` to label them
differently.

```ts
import { Trails } from "@blazetrails/trailties";

await Trails.application!.executor.wrap(
  async () => {
    // Consume one message from a queue.
  },
  { source: "queue.consumer" },
);
```

### Adding Your Own Callbacks

A library that keeps per-request state registers a pair of callbacks rather
than asking every caller to clean up:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.executor.toRun(() => {
  // Set up per-execution state.
});

Trails.application!.executor.toComplete(() => {
  // Tear it down again.
});
```

### Concurrency

The Executor is the boundary the framework uses to decide when it is safe to
do something that would surprise running code, such as unloading classes. As
long as every unit of work is wrapped, the framework can wait until no unit is
in flight before it acts.

## Reloader

The Reloader wraps work the same way the Executor does, and in addition checks,
before the work starts, whether application code has changed on disk. If it
has, it unloads the old constants and loads the new ones first. It is only
active where `config.enableReloading` is on, which is the development default.

Use the Reloader instead of the Executor for long-running work that calls
application code repeatedly, so each call sees current code:

```ts
import { Trails } from "@blazetrails/trailties";

await Trails.application!.reloader.wrap(async () => {
  // Calls into app/ code, which is fresh on every wrap.
});
```

`wrap` on the Reloader runs the Executor's callbacks too, since it holds a
reference to it (`reloader.executor`). Never wrap a Reloader inside an
Executor: by the time the inner wrap runs, code is already executing and the
reload cannot happen.

### Callbacks

The Reloader adds three hooks around the reload itself:

- `toPrepare`, which runs before the first unit of work after a reload (and
  once at boot). Use it to rebuild anything derived from application code.
- `beforeClassUnload`, which runs before the old constants are unloaded.
- `afterClassUnload`, which runs after they have been unloaded.

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.reloader.toPrepare(() => {
  // Rebuild a registry that lists classes under app/.
});
```

### Class Unload

Unloading is done by the application loader, which is a port of Zeitwerk; see
the [Autoloading and Reloading](./autoloading-and-reloading-constants.md)
guide for what is reloaded and when, and
[CLAUDE.md, "The application loader is Zeitwerk"](https://github.com/blazetrailsdev/trails/blob/main/packages/trailties/CLAUDE.md#the-application-loader-is-zeitwerk-railsautoloaders)
for how it maps onto ES modules.

### Concurrency

A reload must wait until no unit of work is running, or a request halfway
through would find its classes replaced underneath it. The Reloader acquires
the load interlock exclusively for that moment, described below.

## Framework Behavior

Each framework component plugs into these boundaries rather than inventing its
own:

- **Action Dispatch** inserts the Executor (and, with reloading on, the
  Reloader) as Rack middleware, so every request is wrapped. A streamed
  response completes its wrap when the body has been fully sent.
- **Active Record** checks connections back in and clears the query cache in
  the Executor's complete callback.
- **Active Job** wraps each job it performs in the Reloader.
- **Action Cable** wraps each channel action and each broadcast it delivers.
- **Active Support's `CurrentAttributes`** resets in the Executor's complete
  callback, which is why its values never leak from one request into the next.

### Configuration

`config.enableReloading` decides whether the Reloader does anything beyond
running the Executor. `config.eagerLoad` loads every application file at boot;
production turns it on so no request ever pays for a first load. Both are set
in the generated `config/environments/*.ts` files.

## Load Interlock

The load interlock is a share lock: any number of units of work may hold it in
the shared ("running") mode at once, and unloading needs it in the exclusive
mode. The Executor takes the shared side for the duration of each wrap; the
Reloader takes the exclusive side to unload. So a reload waits for running work
to finish, and new work waits for a reload to finish.

The lock is `ActiveSupport::Dependencies.interlock`, an `Interlock` built on
`ShareLock`, both exported from `@blazetrails/activesupport`. Its methods are
async, because waiting for the lock is waiting on other work in the same
process.

### `permitConcurrentLoads`

Code that is about to wait on something that may itself need to load code, such
as another `Thread` it started, should let go of its share of the lock while it
waits:

<!-- typecheck:skip -->

```ts
await ActiveSupport.Dependencies.interlock.permitConcurrentLoads(async () => {
  await worker.join();
});
```

Without it, the waiting unit and the unit it waits on can each hold what the
other needs.

### Debugging a Stuck Process

A process that stops responding while reloading is almost always waiting on the
interlock: some unit of work took the shared side and never released it. The
usual cause is work that started outside any wrap and then called into code that
waits on the lock, or a promise that was never awaited. Wrap the work, and give
every promise an owner.
