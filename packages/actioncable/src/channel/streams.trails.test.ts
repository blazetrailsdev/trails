import { describe, expect, it } from "vitest";
import { include, rbFSend } from "@blazetrails/ruby-compat";
import "../index.js";
import { Callbacks } from "./callbacks.js";
import { Streams } from "./streams.js";

type Handler = (message: unknown) => unknown;

function recordingConnection() {
  const subscribed: [string, Handler][] = [];
  const unsubscribed: [string, Handler][] = [];
  const posted: (() => unknown)[] = [];
  const connection = {
    server: { eventLoop: { post: (_task: null, block: () => unknown) => posted.push(block) } },
    workerPool: {
      asyncInvoke: (receiver: unknown, method: string, message: unknown) =>
        rbFSend(receiver, method, message),
    },
    pubsub: {
      subscribe: (channel: string, handler: Handler, success: () => unknown) => {
        subscribed.push([channel, handler]);
        success();
      },
      unsubscribe: async (channel: string, handler: Handler) => {
        await Promise.resolve();
        unsubscribed.push([channel, handler]);
      },
    },
  };
  return { connection, subscribed, unsubscribed, posted };
}

class ChatChannel {
  transmissions: [unknown, unknown][] = [];
  confirmations = 0;
  logged: string[] = [];
  logger = { info: (message: string) => this.logged.push(message) };
  constructor(public connection: ReturnType<typeof recordingConnection>["connection"]) {}
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
  deferSubscriptionConfirmationBang(): void {}
  ensureConfirmationSent(): void {
    this.confirmations++;
  }
  transmit(data: unknown, options: unknown): void {
    this.transmissions.push([data, options]);
  }
}
include(ChatChannel, Callbacks);
include(ChatChannel, Streams);

type Host = ChatChannel & {
  streamFrom(b: unknown, cb?: unknown, opts?: unknown, block?: Handler): void;
  stopStreamFrom(b: string): Promise<void>;
  streams: Record<string, Handler>;
};

async function subscribe(channel: Host, posted: (() => unknown)[]): Promise<void> {
  for (const task of posted.splice(0)) await task();
}

describe("ActionCable::Channel::Streams", () => {
  it("passes the raw message to a user handler when coder is nil", async () => {
    const { connection, subscribed, posted } = recordingConnection();
    const channel = new ChatChannel(connection) as Host;
    const received: unknown[] = [];
    channel.streamFrom("test_room_1", (m: unknown) => received.push(m));
    await subscribe(channel, posted);
    await subscribed[0][1]('{"foo":"bar"}');
    expect(received).toEqual(['{"foo":"bar"}']);
    expect(channel.confirmations).toBe(1);
    expect(channel.logged).toEqual(["ChatChannel is streaming from test_room_1"]);
  });

  it("decodes with the default handler and transmits with via", async () => {
    const { connection, subscribed, posted } = recordingConnection();
    const channel = new ChatChannel(connection) as Host;
    channel.streamFrom("test_room_1");
    await subscribe(channel, posted);
    await subscribed[0][1]('{"foo":"bar"}');
    expect(channel.transmissions).toEqual([[{ foo: "bar" }, { via: "streamed from test_room_1" }]]);
  });

  it("stop_stream_from unsubscribes the stored wrapper", async () => {
    const { connection, subscribed, unsubscribed, posted } = recordingConnection();
    const channel = new ChatChannel(connection) as Host;
    channel.streamFrom("test_room_1");
    await subscribe(channel, posted);
    await channel.stopStreamFrom("test_room_1");
    await channel.stopStreamFrom("test_room_1");
    expect(unsubscribed).toEqual([["test_room_1", subscribed[0][1]]]);
  });

  it("stop_all_streams awaits each unsubscribe", async () => {
    const { connection, unsubscribed, posted } = recordingConnection();
    const channel = new ChatChannel(connection) as Host;
    channel.streamFrom("a");
    channel.streamFrom("b");
    await subscribe(channel, posted);
    await channel.runCallbacks("unsubscribe");
    expect(unsubscribed.map(([b]) => b)).toEqual(["a", "b"]);
    expect(channel.streams).toEqual({});
  });
});
