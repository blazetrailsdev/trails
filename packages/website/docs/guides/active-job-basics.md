---
title: Active Job Basics
description: Background work in a Trails application — job classes, enqueuing now, later and in bulk, Solid Queue, callbacks, retries and argument serialization.
---

# Active Job Basics

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [activejob package](/packages/activejob) · [solid-queue package](/packages/solid-queue) ·
> [Action Mailer Basics](./action-mailer-basics.md)

Active Job gives a Trails application one interface for work that should run
outside the request: sending mail, resizing images, calling a slow API. After
reading this guide you will know:

- How to write a job and put it on a queue.
- How Solid Queue, the default backend, is installed, configured and started.
- How to hook into enqueuing and performing with callbacks.
- How arguments are serialized, and how to retry or discard a failing job.

## What is Active Job?

A job is a class with a `perform` method. Your code asks for it to run, either
now or later, and a _queue adapter_ decides where and when: inline in the same
process, on an in-process async pool, or through a database-backed queue that a
separate worker process drains. Because every adapter speaks the same API, you
can change backends without rewriting a single job.

## Create and Enqueue Jobs

### Create the Job

```sh
pnpm trails generate job guests-cleanup
```

This writes `app/jobs/guests-cleanup-job.ts` and a test. Jobs extend
`ApplicationJob`, which in turn extends `ActiveJob.Base`, so settings shared by
every job live in one place.

```ts
import { Base } from "@blazetrails/activejob";

export class ApplicationJob extends Base {}

export class GuestsCleanupJob extends ApplicationJob {
  static {
    this.queueAs("default");
  }

  async perform(guestId: number): Promise<void> {
    const guest = await User.find(guestId);
    await guest.destroy();
  }
}
```

`perform` may return a promise, and almost every real job does, because each
Active Record query is awaited. For the same reason `performNow` and
`performLater` are async in trails, where Rails runs them synchronously; the
reasoning is in
[activejob's `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activejob/CLAUDE.md#a-jobs-perform-and-enqueue-are-async-perform_now--perform_later).

### Enqueue the Job

`performLater` serializes the arguments and hands the job to the adapter.
`set` returns a configured job, so the timing, queue and priority can vary per
call:

```ts
import { Base } from "@blazetrails/activejob";
import { minutes } from "@blazetrails/activesupport";

class GuestsCleanupJob extends Base {
  perform(_guestId: number): void {}
}

await GuestsCleanupJob.performLater(42);
await GuestsCleanupJob.set({ wait: minutes(5) }).performLater(42);
await GuestsCleanupJob.set({ queue: "low", priority: 10 }).performLater(42);

// Run in this process right now, skipping the queue entirely.
await GuestsCleanupJob.performNow(42);
```

`waitUntil` takes an absolute time instead of a delay.

### Enqueue Jobs in Bulk

`ActiveJob.performAllLater` hands a list of job instances to the adapter in one
call. Adapters that can insert many rows at once, Solid Queue among them, do so;
the others fall back to one enqueue per job. Callbacks do not run for jobs
enqueued this way.

```ts
import { ActiveJob, Base } from "@blazetrails/activejob";

class GuestsCleanupJob extends Base {
  perform(_guestId: number): void {}
}

const jobs = [1, 2, 3].map((id) => new GuestsCleanupJob(id));
await ActiveJob.performAllLater(...jobs);
```

## Default Backend: Solid Queue

Solid Queue stores jobs in database tables, so a Trails application gets a
durable queue without a separate broker. It is a port of the `solid_queue` gem,
shipped as `@blazetrails/solid-queue`.

### Set Up

```sh
pnpm trails generate solid-queue:install
```

The installer writes `config/queue.yml`, `config/recurring.yml`, the table
definitions in `db/queue_schema.ts`, and a `bin/jobs` launcher. Point Active Job
at the adapter in the environment config with
`config.activeJob.queueAdapter = "solid_queue"`, or per class:

```ts
import { Base } from "@blazetrails/activejob";
import { SolidQueueAdapter } from "@blazetrails/solid-queue";

class ApplicationJob extends Base {}
ApplicationJob.queueAdapter = new SolidQueueAdapter();
```

### Configuration

`config/queue.yml` describes two kinds of process. _Dispatchers_ move jobs whose
scheduled time has arrived onto the ready list; _workers_ claim ready jobs and
perform them. Each worker names the queues it reads, how many jobs it runs at
once and how often it polls:

```yaml
production:
  dispatchers:
    - polling_interval: 1
      batch_size: 500
  workers:
    - queues: "*"
      threads: 3
      polling_interval: 0.1
```

### Queue Order

A worker's `queues` list is read in order. `[real_time, background]` drains
`real_time` before touching `background`, and a trailing `*` in a name matches
by prefix. Within a queue, lower `priority` numbers run first.

### Threads, Processes, and Signals

`bin/jobs` starts a supervisor, which forks the configured dispatchers and
workers and restarts any that die. `threads` sets how many jobs a worker runs
concurrently: in trails these are cooperative tasks on Node's event loop, not
OS threads. `TERM` and `INT` ask the supervisor to finish in-flight jobs and
stop; `QUIT` stops at once.

### Errors When Enqueuing

When the database insert fails, `performLater` raises
`ActiveJob.EnqueueError` wrapping the original error, so the caller can rescue
one class whatever the backend.

### Concurrency Controls

`limitsConcurrency` caps how many jobs sharing a key may run at once. Extra
jobs wait as _blocked_ executions until a slot frees, or are dropped with
`onConflict: "discard"`.

```ts
import "@blazetrails/solid-queue";
import { Base } from "@blazetrails/activejob";
import { minutes } from "@blazetrails/activesupport";

class SyncAccountJob extends Base {
  static {
    this.limitsConcurrency({ key: (accountId: unknown) => accountId, to: 1, duration: minutes(5) });
  }

  perform(_accountId: number): void {}
}
```

### Error Reporting on Jobs

A job that raises is recorded as a _failed execution_ with its error and
backtrace, where it waits until you retry or discard it. Errors raised by
Solid Queue's own processes, outside any job, go to `SolidQueue.onThreadError`,
which you can point at an error-reporting service.

### Transactional Integrity on Jobs

Because the queue lives in your database, a job enqueued inside a transaction
can commit or roll back with it. Set `enqueueAfterTransactionCommit` on a job
class to delay the enqueue until the surrounding transaction commits, so a
worker never picks up a job for a record that does not exist yet.

### Recurring Tasks

`config/recurring.yml` lists jobs the scheduler enqueues on a timetable written
in plain English (`every hour`, `at 5am every day`):

```yaml
production:
  periodic_cleanup:
    class: CleanSoftDeletedRecordsJob
    queue: background
    args: [1000, { batch_size: 500 }]
    schedule: every hour
```

## Queues

Jobs go to the `default` queue unless the class says otherwise. `queueAs`
accepts a name or a function evaluated per job, so the choice can depend on the
arguments:

```ts
import { Base } from "@blazetrails/activejob";

class ReportJob extends Base {
  static {
    this.queueAs("reports");
    this.queueWithPriority(20);
  }

  perform(): void {}
}
```

`config.activeJob.queueNamePrefix` prepends a string, such as the environment,
to every queue name.

## Priority

Priority is set with `queueWithPriority` on the class or `set({ priority })`
per call. Whether a number is honored, and which direction counts as urgent, is
up to the adapter; Solid Queue runs lower numbers first.

## Callbacks

Callbacks run around the two moments in a job's life: being enqueued and being
performed.

### Available Callbacks

`beforeEnqueue`, `aroundEnqueue`, `afterEnqueue`, `beforePerform`,
`aroundPerform`, `afterPerform` and `afterDiscard`.

```ts
import { Base } from "@blazetrails/activejob";

class AuditedJob extends Base {
  static {
    this.beforeEnqueue((job: AuditedJob) => {
      job.enqueuedFrom = "web";
    });
    this.afterPerform((job: AuditedJob) => {
      console.log(`${job.jobId} finished`);
    });
  }

  enqueuedFrom: string | null = null;

  perform(): void {}
}
```

A `beforeEnqueue` callback that calls `kernelThrow(":abort")` (from
`@blazetrails/ruby-compat`, Ruby's `throw :abort`) stops the enqueue, and
`enqueue` then answers `false`.

## Bulk Enqueuing

`performAllLater` groups jobs by adapter and enqueues each group in one call, so
a list may mix job classes freely. As noted above, no enqueue callbacks run;
inspect each job's `isSuccessfullyEnqueued()` afterwards to see which made it.

## Queue Backend Support

trails ships the `inline`, `async` and `test` adapters with Active Job and the
Solid Queue adapter in its own package. Adapters for third-party queue services
are not ported; see the [activejob package page](/packages/activejob).

## Supported Types for Arguments

Arguments are turned into JSON when a job is enqueued and back again when it
runs. Strings, numbers, booleans, `null`, arrays and plain objects pass through;
dates, times, durations, ranges and `BigDecimal` have built-in serializers.

### GlobalID

An Active Record model passed as an argument is stored as its
[GlobalID](/packages/globalid) and loaded fresh when the job runs, so the job
always sees current data and the payload stays small. If the record is gone by
then, the job raises `ActiveJob.DeserializationError`.

### Serializers

To pass your own type, subclass `ObjectSerializer`, implement `serialize` and
`deserialize`, and list it in `config.activeJob.customSerializers`.

## Exceptions

`rescueFrom` handles an error raised by `perform` the way it does in a
controller.

### Retrying or Discarding Failed Jobs

`retryOn` re-enqueues the job after a delay, up to a number of attempts, and
then lets the error propagate. `discardOn` drops the job quietly.

```ts
import { Base } from "@blazetrails/activejob";
import { seconds } from "@blazetrails/activesupport";

class ApiTimeout extends Error {}
class GoneError extends Error {}

class RemoteSyncJob extends Base {
  static {
    this.retryOn(ApiTimeout, { wait: seconds(30), attempts: 10 });
    this.discardOn(GoneError);
  }

  perform(): void {}
}
```

`wait: "polynomially_longer"` backs off on each attempt.

### Deserialization

A `DeserializationError` is raised before `perform` runs, so it can be retried
or discarded like any other error.

## Job Testing

`ActiveJob.TestHelper` provides `assertEnqueuedJobs`,
`assertPerformedJobs` and `performEnqueuedJobs`, and switches jobs onto the
`test` adapter so nothing leaves the process.

## Debugging

Each enqueue and perform is logged with the job class, id and queue. Setting
`config.activeJob.verboseEnqueueLogs = true` also logs the line of your code
that enqueued the job.
