import { Duration, Mock } from "@blazetrails/activesupport";
import { ArgumentError, block, constSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { Base } from "./base.js";

interface ChannelClass {
  periodicTimers: [unknown, { every: unknown }][];
  periodically(arg: unknown, options: { every: unknown }, block?: unknown): void;
}

class ChatChannel extends Base {
  static {
    const host = this as unknown as ChannelClass;
    host.periodically(":sendUpdates", { every: 1 });

    host.periodically(
      function (this: ChatChannel) {
        this.ping();
      },
      { every: 2 },
    );

    host.periodically(null, { every: 3 }, function (this: ChatChannel) {
      this.ping();
    });
  }

  /** @internal */
  private ping(): void {}
}
const Chat = ChatChannel as unknown as ChannelClass;

const PeriodicTimersTest = { name: "ActionCable::Channel::PeriodicTimersTest" };
constSet(ActionCable.Channel, "PeriodicTimersTest", PeriodicTimersTest);
constSet(PeriodicTimersTest, "ChatChannel", ChatChannel);

describe("ActionCable::Channel::PeriodicTimersTest", () => {
  let tc: TestCase;
  let connection: TestConnection;

  beforeEach(() => {
    tc = new TestCase("periodic_timers");
    connection = new TestConnection();
  });

  it("periodic timers definition", () => {
    const timers = Chat.periodicTimers;

    expect(timers.length).toBe(3);

    timers.forEach((timer, i) => {
      expect(timer[0]).toBeInstanceOf(Function);
      expect(timer[1].every).toBe(i + 1);
    });
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
      new Object(),
    ]) {
      let e!: Error;
      expect(() => {
        try {
          Chat.periodically(":sendUpdates", { every: invalid });
        } catch (error) {
          throw (e = error as Error);
        }
      }).toThrow(ArgumentError);
      expect(e.message).toMatch(/Expected every:/);
    }
  });

  it("disallow block and arg together", () => {
    let e!: Error;
    expect(() => {
      try {
        Chat.periodically(
          ":sendUpdates",
          { every: 1 },
          block(function (this: ChatChannel) {
            (this as unknown as { ping(): void }).ping();
          }),
        );
      } catch (error) {
        throw (e = error as Error);
      }
    }).toThrow(ArgumentError);
    expect(e.message).toMatch(/not both/);
  });

  it("disallow unknown args", () => {
    for (const invalid of ["send_updates", new Object(), null]) {
      let e!: Error;
      expect(() => {
        try {
          Chat.periodically(invalid, { every: 1 });
        } catch (error) {
          throw (e = error as Error);
        }
      }).toThrow(ArgumentError);
      expect(e.message).toMatch(/Expected a Symbol/);
    }
  });

  it("timer start and stop", async () => {
    const mock = new Mock();
    for (let i = 0; i < 3; i++) mock.expect("call", null);
    const timer = { shutdown: () => mock.call() };

    await tc.assertCalled(
      connection.server.eventLoop,
      "timer",
      null,
      { times: 3, returns: timer },
      async () => {
        const channel = new ChatChannel(connection as never, "{id: 1}", { id: 1 });

        await channel.subscribeToChannel();
        await channel.unsubscribeFromChannel();
        expect(
          (channel as unknown as { activePeriodicTimers: unknown[] }).activePeriodicTimers,
        ).toEqual([]);
      },
    );

    expect(mock.verify()).toBeTruthy();
  });
});
