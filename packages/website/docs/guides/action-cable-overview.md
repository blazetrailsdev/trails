---
title: Action Cable Overview
description: Real-time features over WebSockets in Trails — connections, channels, streams and broadcasts, the browser client, subscription adapters, configuration, and testing.
---

# Action Cable Overview

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actioncable package](/packages/actioncable) ·
> [solid-cable package](/packages/solid-cable)

Action Cable adds WebSockets to a Trails application, so the server can push
data to the browser the moment something changes. After reading this guide you
will know:

- The pieces Action Cable is made of, and how they fit together.
- How to authenticate a connection and define channels.
- How to stream broadcasts to subscribers, and how a browser subscribes.
- How to configure the subscription adapter and allowed origins.
- How to run the cable server, and how to test channels and connections.

## What is Action Cable?

An ordinary HTTP request is answered once and closed. A WebSocket stays open,
and either side can send a message whenever it likes. Action Cable is the
framework around that socket: it authenticates the socket, multiplexes many
logical _channels_ over it, and fans a message published on the server out to
every socket that asked for it. Server-side code is written as Trails classes
that read like controllers; the browser side is a small JavaScript client.

## Terminology

### Connections

A **connection** is one open WebSocket between one browser tab and the
server. It is authenticated once when it opens, and every channel subscription
from that tab rides on it.

### Consumers

The **consumer** is the browser-side end of a connection, created by the
JavaScript client. A page normally creates one consumer and reuses it.

### Channels

A **channel** groups one kind of real-time behaviour — a chat room, a
notification feed — the way a controller groups the actions for one resource.

### Subscribers

A consumer **subscribes** to a channel, optionally with parameters (which
room). Each subscription is a separate instance of the channel class on the
server.

### Pub/Sub

Publish/subscribe is the pattern underneath: publishers send messages to a
named stream without knowing who listens, and the subscription adapter
delivers them to every subscriber of that name, across processes.

### Broadcastings

A **broadcasting** is such a named stream. Anything in the application — a
controller, a model callback, a job — can broadcast to it, and every channel
streaming from it relays the message to its consumer.

## Server-Side Components

### Connections

The application defines one connection class, conventionally
`ApplicationCable::Connection`, extending `Connection.Base`. Its `connect`
method runs when a socket opens; `identifiedBy` names the attributes that
identify the connection, which every channel on it can then read.

```ts
import { Base as ConnectionBase } from "@blazetrails/actioncable/connection/base.js";

export class Connection extends ConnectionBase {
  declare currentUserId: string;

  connect(): void {
    const id = this.request.params["user_id"];
    if (typeof id !== "string") this.rejectUnauthorizedConnection();
    this.currentUserId = id;
  }
}
Connection.identifiedBy("currentUserId");
```

A real application reads a signed or encrypted cookie that its sign-in action
set, since the WebSocket request carries the same cookies as page requests.
`rejectUnauthorizedConnection` closes the socket before any channel can be
subscribed. Exceptions in a connection or channel can be handled with
`rescueFrom`, as in a controller.

### Channels

Channels extend `Channel.Base`, usually through an
`ApplicationCable::Channel` the application defines. `subscribed` runs when a
consumer subscribes and `unsubscribed` when it leaves; between the two, any
public method is an action the client can invoke with `perform`.

```ts
import { Base as ChannelBase } from "@blazetrails/actioncable/channel/base.js";

export class ChatChannel extends ChannelBase {
  protected override subscribed(): unknown {
    return this.streamFrom(`chat_${String(this.params.get("room"))}`);
  }

  speak(data: Record<string, unknown>): unknown {
    return this.transmit({ said: data["message"] });
  }
}
```

`params` holds what the client subscribed with. `reject()` inside `subscribed`
refuses the subscription. `beforeSubscribe`, `afterSubscribe` and their
unsubscribe siblings register callbacks, and `periodically` runs a method on a
timer for as long as the subscription lives.

## Client-Side Components

### Connections

The browser client is Rails' own JavaScript package, used unchanged; Trails
does not port it because it is already JavaScript (see the
[actioncable package](/packages/actioncable) notes for the pinned version).

```sh
pnpm add @rails/actioncable
```

<!-- typecheck:skip -->

```js
import { createConsumer } from "@rails/actioncable";

export default createConsumer();
```

`createConsumer` connects to `/cable` by default, or to the URL in the
`action-cable-url` meta tag the layout renders with `actionCableMetaTag`.

## Client-Server Interactions

### Streams

A channel's `streamFrom(name)` attaches its subscription to a broadcasting.
`streamFor(record)` derives the name from a model, so each record gets its own
stream without the caller spelling a string. `stopStreamFrom`,
`stopStreamFor` and `stopAllStreams` detach again.

### Broadcastings

Anywhere on the server, a broadcast publishes to a named stream:

```ts
import { ActionCable } from "@blazetrails/actioncable";
import type { Base as ServerBase } from "@blazetrails/actioncable/server/base.js";

await (ActionCable.server() as ServerBase).broadcast("chat_lobby", { said: "hello" });
```

`ChatChannel.broadcastTo(record, message)` is the counterpart of `streamFor`,
broadcasting on the name derived from the record.

### Subscriptions

<!-- typecheck:skip -->

```js
import consumer from "./consumer";

const room = consumer.subscriptions.create(
  { channel: "ChatChannel", room: "lobby" },
  {
    received(data) {
      console.log(data.said);
    },
  },
);
```

`received` runs for every message the subscription's streams deliver, and for
anything the channel `transmit`s directly. `connected`, `disconnected` and
`rejected` callbacks report the subscription's state.

### Passing Parameters to Channels

Every key in the subscription's first argument other than `channel` becomes
`params` on the server-side channel instance, which is how one channel class
serves many rooms.

### Rebroadcasting a Message

`room.perform("speak", { message: "hi" })` (or `room.send(...)`) calls the
channel action. A chat channel typically has that action broadcast the message
back to the room's stream, so every participant, the sender included, receives
it through `received`.

## Full-Stack Examples

The common patterns combine the pieces above. An **appearance** channel calls
a model method in `subscribed` and `unsubscribed` to mark the user online and
offline, and broadcasts the change to everyone watching. A **notifications**
channel uses `streamFor(currentUser)`, and any part of the application calls
`broadcastTo(user, payload)` to reach that one user in every open tab.

## Configuration

### Subscription Adapter

`config/cable.ts` exports an adapter setting per environment, where Rails
reads `config/cable.yml`. `async` keeps everything in one process and suits
development; `test` records broadcasts for assertions; `postgresql` and
`redis` fan out across processes, and the generated application uses `redis`
in production. **Solid Cable** is a further adapter that stores messages in a
database table and polls it, so no extra service is needed — see the
[solid-cable package](/packages/solid-cable).

### Allowed Request Origins

The server accepts WebSocket upgrades only from listed origins, a guard against
cross-site WebSocket hijacking. `allowedRequestOrigins` takes strings and
regular expressions; development allows `localhost` by default, and
`disableRequestForgeryProtection` turns the check off entirely.

### Consumer Configuration

The cable URL comes from the server's `url` setting, rendered into the page by
`actionCableMetaTag`, so the client needs no hard-coded address.

### Worker Pool Configuration

Channel actions run on a worker pool (`workerPoolSize`, four by default). Each
worker may hold a database connection, so the database pool must be at least
as large.

### Client-side Logging

`ActionCable.logger.enabled = true` in the browser logs the client's
connection and subscription activity to the console.

### Other Configurations

The server tags its log lines with request data (`logTags`), and
`mountPath` moves the endpoint off `/cable`.

## Running Standalone Cable Servers

### In App

By default the cable server is mounted inside the application at `/cable` and
shares its process with ordinary HTTP requests. The engine that mounts it and
`config.actionCable` live in `@blazetrails/trailties`.

### Standalone

For heavy traffic, a separate process can run only the cable server, booting
the same application code so channels can use models. Both processes must use
a cross-process adapter (Solid Cable, PostgreSQL or Redis) so a broadcast made
in one reaches sockets held by the other.

### Notes

The cable server does not share the HTTP request's session; authenticate from
cookies in `connect`, as shown above.

## Dependencies

The server half is `@blazetrails/actioncable`. The browser half is
`@rails/actioncable` from npm. The adapters need their own backing service:
`@blazetrails/solid-cable` a database, the PostgreSQL adapter the `pg`
driver, the Redis adapter a Redis client. Rails' nio4r selector has no port:
Node's own event loop drives the sockets, as the
[actioncable package notes](/packages/actioncable) explain.

## Deployment

WebSockets are long-lived, so whatever sits in front of the application
(a load balancer, a reverse proxy) must allow the `Upgrade` handshake and must
not time out idle sockets too eagerly. With more than one application process,
use a cross-process adapter.

## Testing

`ActionCable.Connection.TestCase` exercises a connection class's `connect`,
including rejection, with stubbed cookies and headers.
`ActionCable.Channel.TestCase` subscribes a channel with given params and
asserts on what it streamed and transmitted. `ActionCable.TestHelper` adds
broadcast assertions (`assertBroadcasts`, `assertBroadcastOn`) for any test
that triggers a broadcast, such as a model or job test.
