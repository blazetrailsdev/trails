---
title: Error Reporting in Trails Applications
description: Reporting errors through Trails.error — subscribing a reporter, handling, recording and manually reporting errors, context, severity, sources and disabling a subscriber.
---

# Error Reporting in Trails Applications

> **See also:** [Guides index](./index.md) ·
> [Debugging Trails Applications](./debugging-rails-applications.md) ·
> [activesupport package](/packages/activesupport)

Every application raises errors it did not plan for. This guide covers the one
place a Trails app sends them, so that an error-tracking service sees them all
in the same shape:

- Wiring an error-reporting service into the reporter.
- Handling, recording and reporting errors from your own code.
- Adding context, choosing a severity and naming a source.
- Filtering by error class and silencing a subscriber.

## Error Reporting

`Trails.error` is the application's `ErrorReporter`, the
`@blazetrails/activesupport` class. It holds a list of _subscribers_: objects
that send an error on to a service, a log, or anywhere else. Code that catches
an error hands it to the reporter, and the reporter hands it to each
subscriber.

The framework reports through it too. The executor middleware that wraps each
request reports any error that escapes it, so an unrescued request error
reaches your subscribers without you writing anything.

### Subscribing to the Reporter

A subscriber is any object with a `report` method. It receives the error and
an options object carrying `handled`, `severity`, `context` and `source`:

```ts
import { Trails } from "@blazetrails/trailties";
import type { ErrorSeverity, ErrorContext } from "@blazetrails/activesupport";

class ErrorSubscriber {
  report(
    error: Error,
    opts: { handled: boolean; severity: ErrorSeverity; context: ErrorContext; source: string },
  ): void {
    console.log(`[${opts.severity}] ${opts.source}: ${error.message}`, opts.context);
  }
}

Trails.error.subscribe(new ErrorSubscriber());
```

Put the `subscribe` call in an initializer, such as
`config/initializers/error-subscriber.ts`, so it runs once at boot. Passing an
object with no `report` method raises `ArgumentError`. Register as many
subscribers as you like; each sees every report. If a subscriber itself
raises and the reporter has a `logger`, the failure is logged at `fatal`
level and the next subscriber still runs; with no logger, the subscriber's
error propagates.

Error-tracking services usually ship a subscriber of their own, so for them
subscribing is the whole integration.

### Using the Error Reporter

There are four ways to send an error to the reporter. They differ in whether
the error is swallowed, re-raised, or was caught somewhere else first.

#### Reporting and Swallowing Errors

`handle` runs a function and reports any error it raises, then swallows it.
The call answers the function's result, or `null` when it raised:

```ts
import { Trails } from "@blazetrails/trailties";

const total = Trails.error.handle(() => 1 + 1);
```

Pass `fallback` to answer something other than `null` on failure. A function
is called for the value:

```ts
import { Trails } from "@blazetrails/trailties";

declare function loadPreferences(): Record<string, unknown>;

const preferences = Trails.error.handle({ fallback: () => ({}) }, () => loadPreferences());
```

An error reported by `handle` is reported with `handled: true` and, by
default, severity `"warning"`.

#### Reporting and Re-raising Errors

`record` reports the error and then raises it again, so the caller still sees
the failure:

```ts
import { Trails } from "@blazetrails/trailties";

declare function chargeCard(): string;

const receipt = Trails.error.record(() => chargeCard());
```

The report is sent with `handled: false` and severity `"error"`. Use it where
the error should still stop the work, but should be reported even if
something further up rescues it.

#### Manually Reporting Errors

Where you already have the error in hand, from a `catch` of your own, pass it
to `report`:

```ts
import { Trails } from "@blazetrails/trailties";

declare function syncInventory(): void;

try {
  syncInventory();
} catch (error) {
  Trails.error.report(error as Error, { handled: true, context: { warehouse: "east" } });
}
```

`handled` defaults to `true`, and the severity follows it: `"warning"` for a
handled error, `"error"` for one that was not.

An error is reported once. The reporter marks it, and its `cause` chain, so
an error that `record` reports and an outer executor sees again is not sent a
second time.

#### Reporting Unexpected Errors

`unexpected` is for a condition that should never happen but that production
should survive. Normally it reports the error and answers `null`. When the
reporter's `debugMode` is on it raises an `ErrorReporter.UnexpectedError`
instead, so the problem is found before it ships. Rails turns `debugMode` on
in development and test at boot; trails does not yet, so set
`Trails.error.debugMode = true` yourself in those environments:

```ts
import { Trails } from "@blazetrails/trailties";

declare const status: string;

if (status !== "open" && status !== "closed") {
  Trails.error.unexpected(`unknown status ${status}`);
}
```

A string is wrapped in a `RuntimeError`. The default severity is `"warning"`.

### Error-reporting Options

`handle`, `record`, `report` and `unexpected` all accept the same options:

- `severity` — `"error"`, `"warning"` or `"info"`. Any other value raises
  `ArgumentError`.
- `context` — an object of extra details, merged into the context the
  subscriber receives.
- `source` — a string naming where the error came from. It defaults to
  `"application"`. Framework reports use sources of their own, so a
  subscriber can, for example, ignore one subsystem's errors.

`handle` additionally takes `fallback`, described above.

```ts
import { Trails } from "@blazetrails/trailties";

Trails.error.handle({ severity: "info", context: { feature: "search" }, source: "search" }, () =>
  JSON.parse("{}"),
);
```

### Setting Context Globally

`setContext` adds details to every report made from the current execution,
such as the signed-in user's id:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.error.setContext({ section: "checkout" });
Trails.error.handle({ context: { step: "payment" } }, () => null);
// The subscriber receives { section: "checkout", step: "payment" }.
```

Context set this way is stored in the execution context, which the executor
clears between requests and jobs, so one request's details do not leak into
the next. Per-call `context` wins over the global one for the same key.

### Filtering by Error Classes

By default `handle` and `record` catch any `Error`. Pass error classes ahead
of the options and the function to catch only those; anything else propagates
untouched and unreported:

```ts
import { Trails } from "@blazetrails/trailties";
import { ArgumentError } from "@blazetrails/ruby-compat";

declare function parseFilter(): string[];

const filters = Trails.error.handle(ArgumentError, { fallback: () => [] }, () => parseFilter());
```

### Disabling Notifications

`disable` runs a function with one subscriber silenced. Pass the subscriber
object, or its class to silence every instance of it:

```ts
import { Trails } from "@blazetrails/trailties";

declare class ErrorSubscriber {
  report(error: Error): void;
}

Trails.error.disable(ErrorSubscriber, () => {
  Trails.error.handle(() => {
    throw new Error("not sent to ErrorSubscriber");
  });
});
```

Silencing lasts only for the function, and only for the current execution.
`unsubscribe` removes a subscriber for good.

## Error-reporting Libraries

A library that wants to report errors without depending on an application can
build an `ErrorReporter` of its own and let the app subscribe to it, or report
through `Trails.error` when it runs inside one. The reporter takes its
subscribers, and an optional `logger` for subscriber failures, in its
constructor:

```ts
import { ErrorReporter } from "@blazetrails/activesupport";

const reporter = new ErrorReporter({
  report(error: Error) {
    console.error(error.message);
  },
});

reporter.handle(() => {
  throw new Error("reported to the subscriber above");
});
```

Name a distinct `source` on each report, so an application's subscriber can
tell the library's errors from its own.
