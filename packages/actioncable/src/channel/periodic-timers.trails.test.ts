import { describe, expect, it } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { ArgumentError, block, include } from "@blazetrails/ruby-compat";
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

  it("periodic timers definition", () => {
    const timers = Chat.periodicTimers;
    expect(timers.length).toBe(3);
    timers.forEach((timer, i) => {
      expect(typeof timer[0]).toBe("function");
      expect(timer[1].every).toBe(i + 1);
    });
  });

  it("keeps a subclass's timers out of the parent", () => {
    expect((Channel as unknown as ChannelClass).periodicTimers).toEqual([]);
    expect((new ChatChannel(null) as unknown as ChannelClass).periodicTimers).toBeUndefined();
  });

  it("disallow negative and zero periods", () => {
    for (const invalid of [
      0,
      0.0,
      Duration.seconds(0),
      -1,
      Duration.seconds(-1),
      "foo",
      ":foo",
      {},
    ]) {
      expect(() => Chat.periodically(":sendUpdates", { every: invalid })).toThrow(
        /Expected every:/,
      );
    }
  });

  it("disallow block and arg together", () => {
    expect(() =>
      Chat.periodically(
        ":sendUpdates",
        { every: 1 },
        block(() => null),
      ),
    ).toThrow(new ArgumentError("Pass a block or provide a callback arg, not both"));
  });

  it("disallow unknown args", () => {
    for (const invalid of ["send_updates", {}, null]) {
      expect(() => Chat.periodically(invalid, { every: 1 })).toThrow(/Expected a Symbol/);
    }
    expect(() => Chat.periodically("send_updates", { every: 1 })).toThrow(
      'Expected a Symbol method name or a Proc, got "send_updates"',
    );
  });

  it("timer start and stop", async () => {
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
    expect(
      (channel as unknown as { activePeriodicTimers: unknown[] }).activePeriodicTimers,
    ).toEqual([]);
  });
});
