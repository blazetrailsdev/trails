---
title: Debugging Trails Applications
description: Inspecting a running Trails app — debug helpers in views, the logger and tagged logging, SQL query comments, and Node's own debugger.
---

# Debugging Trails Applications

> **See also:** [Guides index](./index.md) ·
> [Configuring Trails Applications](./configuring.md) ·
> [Active Support Instrumentation](./active-support-instrumentation.md) ·
> [trailties package](/packages/trailties) ·
> [activesupport package](/packages/activesupport)

Sooner or later a request does something you did not expect. This guide
covers the tools for finding out why:

- Dumping values into a page while you develop.
- Reading and writing the log, and tagging its lines.
- Tracing a SQL statement back to the code that ran it.
- Stepping through code with Node's inspector.
- Looking for memory leaks.

## View Helpers for Debugging

The `debug` view helper renders any value as YAML inside a `<pre>` block,
which is a quick way to see what a template was handed:

<!-- typecheck:skip -->

```tse
<%= debug(this.post) %>
<p><b>Title:</b> <%= this.post.title %></p>
```

For a short value inline, `rbInspect` from `@blazetrails/ruby-compat` gives the
same text Ruby's `inspect` would:

```ts
import { rbInspect } from "@blazetrails/ruby-compat";

console.log(rbInspect({ title: "Hello", tags: ["a", "b"] }));
```

## The Logger

`Trails.logger` is the application's logger, an Active Support `Logger`. In
development and test it writes to `log/<env>.log`, and the development server
also prints to the terminal.

### Choosing a Logger

Any object with the `Logger` interface can take its place, set as
`config.logger`. To write to standard output, as a container platform
usually wants:

```ts
import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { stdout } from "@blazetrails/ruby-compat";
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.logger = TaggedLogging.new(new Logger(stdout));
  }
}
```

### Log Levels

The six levels, from most to least verbose, are `debug`, `info`, `warn`,
`error`, `fatal` and `unknown`. A message below the logger's level is
dropped. `config.logLevel` sets it for the app; a generated app uses `debug`
in development and `info` in production.

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.logLevel = ":warn";
  }
}
```

### Sending Messages

Each level has a method of the same name:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.logger?.debug("Loaded the post list");
Trails.logger?.info("Processing the request...");
Trails.logger?.error("Something went wrong");
```

A function passed as the second argument, `debug(null, () => message)`, is
called only when the logger will write the line, which saves building a message
the level drops.

### Verbose Query Logs

With `config.activeRecord.verboseQueryLogs` on, each SQL line in the log is
followed by the file and line of the application code that ran it. It is on
by default in development.

### Tagged Logging

When many requests write at once their lines interleave. A tagged logger puts
a prefix in front of each line, so one request's lines can be picked out:

```ts
import { Logger, TaggedLogging } from "@blazetrails/activesupport";

const logger = TaggedLogging.new(new Logger());
logger.tagged("BCX", "Jason").info("Stuff");
```

`config.logTags` names what to tag every request's lines with, such as the
request id:

```ts
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.logTags = [":requestId"];
  }
}
```

### Impact of Logs on Performance

Logging is cheap but not free: each line is formatted and written, and a
`debug` message built with string interpolation is built even when the level
drops it. In production keep the level at `info` or above, and pass a
function for expensive messages.

## SQL Query Comments

Query log tags add a comment to each SQL statement naming the controller and
action, or the job, that issued it. The comment then shows up in the
database's own slow-query log:

```ts
import "@blazetrails/trailties/trailties/active-record";
import { Application } from "@blazetrails/trailties";

class Blog extends Application {
  static {
    this.config.activeRecord.queryLogTagsEnabled = true;
    this.config.activeRecord.queryLogTagsFormat = "sqlcommenter";
  }
}
```

## Debugging with the Node Inspector

Rails steps through code with the `debug` gem; a trails app is a Node
process, so it uses Node's built-in inspector. Start the server with
`--inspect` and attach Chrome DevTools or your editor's debugger:

<!-- typecheck:skip -->

```sh
NODE_OPTIONS=--inspect pnpm trails server
```

A `debugger;` statement anywhere in application code pauses there once a
debugger is attached. Breakpoints, stepping, the call stack and a console
evaluated in the paused frame all come from the debugger, not from trails.

### The Trails Console

`trails console` starts a REPL with the application loaded, which is the
quickest way to try a query or call a model method by hand. `--sandbox` rolls
back every database change when the console exits.

### Backtraces

`Trails.backtraceCleaner` strips framework and `node_modules` frames from an
error's backtrace, which is what error pages and test failures show. Add your
own filters and silencers in an initializer:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.backtraceCleaner.addSilencer((line) => line.includes("vendor/"));
```

## Debugging in the Browser

Rails' `web-console` gem has no trails port. In development the error page
shows the exception, the cleaned backtrace and the request; for an
interactive session, attach the inspector as above.

## Debugging Memory Leaks

A Node process that keeps growing usually holds references it no longer
needs: a module-level cache, an event listener never removed, a closure kept
in a long-lived array. Start the server with `--inspect`, take two heap
snapshots in DevTools' Memory panel some requests apart, and compare them to
see which objects grew.

## References

- [Active Support Instrumentation](./active-support-instrumentation.md), for
  subscribing to the events the frameworks publish.
- Node's [debugging guide](https://nodejs.org/en/learn/getting-started/debugging).
