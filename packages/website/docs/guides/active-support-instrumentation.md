---
title: Active Support Instrumentation
description: Measuring what a Trails app does with Active Support's notifications — subscribing to framework events, timing your own code, and building subscriber classes.
---

# Active Support Instrumentation

> **See also:** [Guides index](./index.md) ·
> [Active Support Core Extensions](./active-support-core-extensions.md) ·
> [activesupport package](/packages/activesupport)

The framework announces the interesting moments of its work: a controller
action starting and finishing, a SQL statement running, a mail being
delivered. Each announcement is an _event_, published through
`Notifications`, and anything that cares can subscribe to it. Logging,
metrics, tracing and test assertions all sit on this one mechanism. This guide
covers:

- What an event carries and how it is named.
- Subscribing to events, by exact name or by pattern.
- The events trails' frameworks publish today.
- Publishing events from your own code.
- Grouping handlers into a subscriber class.

## Introduction to Instrumentation

An event has a name, a start and end time, a unique id and a _payload_: a
plain object of details specific to that kind of event. The name is two
dot-separated parts, the event and the framework that owns it, such as
`sql.active_record` or `process_action.action_controller`. Event names and
payload keys keep their Rails spelling, because they are strings that
dashboards, log pipelines and APM agents already match on.

Publishing costs almost nothing when no one listens: `Notifications.instrument`
checks for a subscriber first and, if there is none, simply runs the block.

## Subscribing to an Event

`Notifications.subscribe` takes a name and a callback. A one-argument callback
receives an `Event`, which exposes the payload and the timing:

```ts
import { Notifications } from "@blazetrails/activesupport";

Notifications.subscribe("process_action.action_controller", (event) => {
  const { controller, action, status } = event.payload;
  console.log(`${String(controller)}#${String(action)} -> ${String(status)}`);
  console.log(`took ${event.duration.toFixed(1)}ms`);
});
```

`event.duration` is in milliseconds. `event.time` and `event.end` are the
start and finish stamps, and `event.transactionId` is the id shared by every
event that one instrumenter published.

A five-argument callback receives the raw parts instead, which avoids building
an `Event` when only a field or two is needed:

```ts
import { Notifications } from "@blazetrails/activesupport";

Notifications.subscribe(
  "sql.active_record",
  (name: string, start: number, finish: number, id: string, payload: Record<string, unknown>) => {
    console.log(name, id, payload.sql);
  },
);
```

### Matching several events

The first argument may be a regular expression. Every event whose name matches
reaches the callback, which makes it easy to watch one whole framework:

```ts
import { Notifications } from "@blazetrails/activesupport";

Notifications.subscribe(/\.active_record$/, (event) => {
  console.log(event.name, event.duration);
});
```

Pass `null` to receive every event.

### Monotonic timing

`subscribe` stamps events with wall-clock time. `monotonicSubscribe` uses a
monotonic clock, which is never adjusted, so durations stay correct across a
clock change:

```ts
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";

Notifications.monotonicSubscribe("deliver.action_mailer", (event: NotificationEvent) => {
  console.log(event.duration);
});
```

### Subscribing for the length of a block

`Notifications.subscribed` attaches a callback, runs a block, and detaches the
callback when the block finishes or raises. It returns a promise, since the
block may be async:

```ts
import { Notifications } from "@blazetrails/activesupport";

const statements: unknown[] = [];

await Notifications.subscribed(
  (event: { payload: Record<string, unknown> }) => statements.push(event.payload.sql),
  "sql.active_record",
  async () => {
    await Post.where({ published: true }).toArray();
  },
);
```

This is how a test counts the queries a piece of code runs.

### Unsubscribing

`subscribe` returns a handle. Hand it to `unsubscribe` to stop listening, or
pass an event name to drop every subscriber for that name:

```ts
import { Notifications } from "@blazetrails/activesupport";

const handle = Notifications.subscribe("sql.active_record", () => {});

Notifications.unsubscribe(handle);
Notifications.unsubscribe("sql.active_record");
```

`subscribeOnce` is a shortcut for a subscriber that removes itself after the
first event it sees.

## Framework Hooks

The events below are the ones trails publishes today. Each section follows the
Rails guide's grouping; a framework missing from the list does not publish its
events yet, and its [package page](/packages/) records what is ported.

### Action Controller

- `start_processing.action_controller` — an action is about to run. The
  payload names the `controller`, `action`, `request`, `params`, `headers`,
  `format`, `method` and `path`.
- `process_action.action_controller` — the action finished. The same payload,
  plus the response `status` and the time spent rendering as `view_runtime`.
- `send_file.action_controller` and `send_stream.action_controller` — a file
  or a stream is being sent.
- `halted_callback.action_controller` — a `before` callback rendered or
  redirected, so the action never ran. The payload holds the `filter`.
- `rate_limit.action_controller` — a request went over a `rateLimit`.

### Action Dispatch

- `redirect.action_dispatch` — a route-level redirect answered the request.

### Action View

- `render_template.action_view`, `render_partial.action_view`,
  `render_collection.action_view` and `render_layout.action_view` — a
  template, partial, collection or layout was rendered. The payload's
  `identifier` is the template path.

### Active Record

- `sql.active_record` — a statement ran. The payload holds the `sql`, the
  statement `name` (`"Post Load"`), the `binds`, `type_casted_binds`, whether
  it ran `async`, the `connection`, the user-visible `transaction` and the
  `row_count`.
- `instantiation.active_record` — records were built from a result. The
  payload has `record_count` and `class_name`.
- `start_transaction.active_record` — a real database transaction began.

### Action Mailer

- `deliver.action_mailer` — a message was handed to its delivery method.
- `process.action_mailer` — a mailer action ran to build a message.

### Active Job

- `enqueue_all.active_job` — a batch of jobs was enqueued with
  `performAllLater`.

### Action Cable

- `perform_action.action_cable`, `transmit.action_cable` and
  `broadcast.action_cable` — a channel action ran, a message went to one
  subscriber, or a broadcast went out.

### Active Storage

- `analyze.active_storage` and `transform.active_storage` — a blob was
  analyzed, or a variant was transformed.

## Exceptions

When the instrumented block raises, the event is still published, and the
payload gains two keys before the error is re-raised: `exception`, a
two-element array of the error's class name and message, and
`exception_object`, the error itself:

```ts
import { Notifications } from "@blazetrails/activesupport";

Notifications.subscribe("checkout.shop", (event) => {
  const failure = event.payload.exception as [string, string] | undefined;
  if (failure) console.log(`checkout failed: ${failure[0]}: ${failure[1]}`);
});
```

## Creating Custom Events

Instrument your own code with `Notifications.instrument`. Give it an event
name, a payload, and the work to time. Whatever the block returns,
`instrument` returns; an async block gives back a promise, and the event
finishes when that promise settles:

```ts
import { Notifications } from "@blazetrails/activesupport";

async function chargeCard(amountCents: number): Promise<string> {
  return Notifications.instrument("charge.payments", { amountCents }, async (payload) => {
    const receipt = "rcpt_123";
    payload.receipt = receipt;
    return receipt;
  });
}
```

The block receives the payload, so it can record facts it only learns while it
runs. Name custom events the way the framework does, `event.library`, so a
pattern subscriber can pick out your library without matching the framework's
own events.

## Subscriber Classes

When one object handles many events of the same framework, write a
`Subscriber`. Each public method is a handler, and its name, underscored, is
the event it receives within the namespace passed to `attachTo`:

```ts
import { Subscriber, type NotificationEvent } from "@blazetrails/activesupport";

class PaymentsSubscriber extends Subscriber {
  charge(event: NotificationEvent): void {
    console.log("charged", event.payload.amountCents);
  }

  refundIssued(event: NotificationEvent): void {
    console.log("refunded", event.payload.amountCents);
  }
}

PaymentsSubscriber.attachTo("payments");
```

`charge` receives `charge.payments` and `refundIssued` receives
`refund_issued.payments`. `PaymentsSubscriber.detachFrom("payments")` removes
every handler again.

`LogSubscriber` builds on `Subscriber` and adds a logger plus helpers for
colouring output; each framework's log lines come from one. Its log level
decides which handlers run, so a `debug`-only handler costs nothing in
production.
