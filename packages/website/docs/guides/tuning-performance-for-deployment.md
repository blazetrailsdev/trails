---
title: Tuning Performance for Deployment
description: Choosing how a Trails application is served, what to optimize a deployment for, the process and connection settings that matter, and how to measure the result.
---

# Tuning Performance for Deployment

> **See also:** [Guides index](./index.md) ·
> [trailties package](/packages/trailties) ·
> [activerecord package](/packages/activerecord) ·
> [rackup package](/packages/rackup)

The generated production configuration is a reasonable starting point, but the
right settings depend on your traffic, your hardware and what your requests
spend their time on. This guide covers:

- How a Trails application is served, and how that differs from a Ruby server.
- What to aim for: throughput, latency or memory.
- The handful of settings that change the answer.
- How to check that a change helped.

## Choosing an Application Server

A Rails application usually runs under Puma, which forks worker processes and
runs a pool of threads in each. Trails has neither knob to turn in the same
way. `trails server` serves the Rack application through rackup's Node handler,
on Node's own `http` server, and concurrency inside one process comes from the
event loop rather than from threads; see the
[Threading and Code Execution](./threading-and-code-execution.md) guide.

That leaves two dimensions you control:

- **Processes.** One Node process uses one CPU core for JavaScript. To use more
  cores, run more processes: several containers behind a load balancer, or a
  process manager that starts one per core.
- **Concurrency per process.** How many requests a process will interleave is
  bounded by what they wait on, most often database connections.

Assets are not served by the application server in development either: Vite
serves them, and `bin/dev` starts both; see the
[Working with JavaScript](./working-with-javascript-in-rails.md) guide.

## What to Optimize for?

Pick one goal before you tune, because the settings pull against each other.

### Understanding the Workload

Measure what a typical request spends its time on. A request that spends most
of its time awaiting the database or another service leaves the event loop
free, and one process can carry many of them. A request that spends its time
computing, rendering a large template or serializing a large payload holds the
loop, and every other request in that process waits behind it.

### Throughput

To serve the most requests per second, keep every core busy: one process per
core, and enough database connections in each that requests are not queued
waiting for one.

### Latency

To keep each response fast, avoid putting a long request in front of short
ones. Move slow work to a background job, and give a process fewer concurrent
requests than it could technically accept.

### Memory

Every process keeps its own copy of the application. If memory is the limit,
run fewer processes and let each one interleave more requests.

## Configurations

### Eager Loading

`config.eagerLoad` loads every application file at boot. The generated
production environment turns it on, so no request pays for a first load and
the process reaches its steady-state memory immediately.

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.eagerLoad = true;
  this.config.enableReloading = false;
});
```

### Process Count

Trails does not pick a process count for you. Start with one process per CPU
core available to the container, then adjust from measurements: fewer if
memory is tight, and no more than the cores you have, since extra processes on
one core only take turns.

### Database Connection Pool

Each process keeps its own connection pool per database. Size it to the number
of requests the process should run at once; a request that cannot get a
connection waits for one until `checkoutTimeout` expires and then raises
`ConnectionTimeoutError`.

Pool options sit beside the connection settings in `config/database.ts`:

```ts
export default {
  production: {
    adapter: "postgresql",
    database: "app_production",
    pool: 10,
    checkoutTimeout: 5,
  },
};
```

Option keys are camelCase, not Rails' snake_case. Remember that the database
sees the sum of every process's pool, so `pool` times the process count must
stay under the server's connection limit.

### Logging

Logging is synchronous work on the event loop. The production default is the
`info` level, set from `TRAILS_LOG_LEVEL`; `debug` logs every query and costs
noticeably more under load. `config.silenceHealthcheckPath` keeps load-balancer
health checks out of the log.

### Caching

The generated production environment turns fragment caching on. A cache store
shared between processes, such as Solid Cache, lets one process reuse what
another computed; the per-process memory store does not. See
[Caching with Trails](./caching-with-rails.md).

### Background Jobs

Anything a user does not have to wait for belongs in a job. Solid Queue runs
jobs in separate processes, so they never compete with requests for the event
loop; see [Active Job Basics](./active-job-basics.md).

## Performance Testing

Tune against measurements, not guesses.

### Load Testing

Run a load generator such as `wrk` or `oha` against a production-like
deployment, with production settings and a realistic database. Change one
setting at a time and record both throughput and the slowest percentiles:
a change that raises the average can still make the worst requests worse.

```sh
oha -z 30s -c 50 https://staging.example.com/
```

### Profiling

Node's built-in profiler shows where a process spends its time. Start the server
with `node --cpu-prof` to write a profile on exit, or `node --inspect` to attach
Chrome DevTools to a running process.

```sh
node --cpu-prof bin/trails server -e production
```

### Instrumentation

Every request, query and render publishes an Active Support notification with
its duration. Subscribing to them is the cheapest way to see which part of a
slow request is slow; see
[Active Support Instrumentation](./active-support-instrumentation.md).
