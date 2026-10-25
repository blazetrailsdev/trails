import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { PeriodicTimers } from "./periodic-timers.js";

type Timer = [(this: unknown) => unknown, { every: unknown }];

interface ChannelClass {
  periodicTimers: Timer[];
  periodically(arg: unknown, options: { every: unknown }, block?: unknown): void;
  onSubscribe: unknown;
  afterSubscribe: unknown;
  onUnsubscribe: unknown;
  afterUnsubscribe: unknown;
}

class Channel {
  pings = 0;
  constructor(public connection: unknown) {}
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
  sendUpdates(): void {
    this.pings++;
  }
}
include(Channel, Callbacks);
include(Channel, PeriodicTimers);

class ChatChannel extends Channel {}
const Chat = ChatChannel as unknown as ChannelClass;
Chat.periodically(":sendUpdates", { every: 1 });
Chat.periodically(
  function (this: Channel) {
    this.pings++;
  },
  { every: 2 },
);
Chat.periodically(null, { every: 3 }, function (this: Channel) {
  this.pings++;
});

function recordingConnection() {
  const shutdowns: unknown[] = [];
  const timers: unknown[] = [];
  const connection = {
    server: {
      eventLoop: {
        timer(every: unknown, blk: () => unknown) {
          timers.push(every);
          blk();
          return { shutdown: () => shutdowns.push(every) };
        },
      },
    },
    workerPool: {
      asyncExec(receiver: Channel, options: { connection: unknown }, blk: () => unknown) {
        expect(options.connection).toBe(connection);
        return blk.call(receiver);
      },
    },
  };
  return { connection, shutdowns, timers };
}

describe("ActionCable::Channel::Callbacks and PeriodicTimers", () => {
  it("aliases on_subscribe and on_unsubscribe to the after callbacks", () => {
    expect(Chat.onSubscribe).toBe(Chat.afterSubscribe);
    expect(Chat.onUnsubscribe).toBe(Chat.afterUnsubscribe);
  });

  it("keeps a subclass's timers out of the parent", () => {
    expect((Channel as unknown as ChannelClass).periodicTimers).toEqual([]);
    expect((new ChatChannel(null) as unknown as ChannelClass).periodicTimers).toBeUndefined();
  });

  it("starts each timer through the event loop and runs it on the worker pool", async () => {
    class TimedChannel extends Channel {}
    (TimedChannel as unknown as ChannelClass).periodically(":sendUpdates", { every: 1 });
    (TimedChannel as unknown as ChannelClass).periodically(":sendUpdates", { every: 2 });
    const { connection, shutdowns, timers } = recordingConnection();
    const channel = new TimedChannel(connection);

    await channel.runCallbacks("subscribe");
    expect(timers).toEqual([1, 2]);
    expect(channel.pings).toBe(2);
    await channel.runCallbacks("unsubscribe");
    expect(shutdowns).toEqual([1, 2]);
  });
});
