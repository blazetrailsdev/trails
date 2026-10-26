import { ActiveSupportJSON, Mock, stub } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { Thread, hashAref, rbModConstSet, rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Room } from "../test-helpers/stubs/room.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import type { SuccessAdapter } from "../test-helpers/stubs/test-adapter.js";
import { Base as ConnectionBase } from "../connection/base.js";
import type { WebSocket } from "../connection/web-socket.js";
import type { Base as ServerBase } from "../server/base.js";
import type { Worker } from "../server/worker.js";
import { Async } from "../subscription-adapter/async.js";
import { Base } from "./base.js";

type Handler = (message: unknown) => unknown;

const StreamTests = { name: "ActionCable::StreamTests" };
rbModConstSet(ActionCable, "StreamTests", StreamTests);

class Connection extends ConnectionBase {
  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }
}
rbModConstSet(StreamTests, "Connection", Connection);

class ChatChannel extends Base {
  declare _room?: Room;

  override subscribed(): unknown {
    if (hashAref(this.params, "id") != null) {
      this._room = new Room(hashAref(this.params, "id"));
      this.streamFrom(`test_room_${this._room.id}`, {
        coder: this.pickCoder(hashAref(this.params, "coder")),
      });
    }
    return null;
  }

  sendConfirmation(): unknown {
    return this.transmitSubscriptionConfirmation();
  }

  private pickCoder(coder: unknown): { decode(message: unknown): unknown } | null {
    switch (coder) {
      case null:
      case "json":
        return ActiveSupportJSON;
      case "custom":
        return DummyEncoder;
      case "none":
        return null;
    }
    return null;
  }
}
rbModConstSet(StreamTests, "ChatChannel", ChatChannel);

const DummyEncoder = {
  encode(..._args: unknown[]): string {
    return '{ "foo": "encoded" }';
  },
  decode(..._args: unknown[]): Record<string, unknown> {
    return { foo: "decoded" };
  },
};
rbModConstSet(StreamTests, "DummyEncoder", DummyEncoder);

class SymbolChannel extends Base {
  override subscribed(): unknown {
    this.streamFrom("channel");
    return null;
  }
}
rbModConstSet(StreamTests, "SymbolChannel", SymbolChannel);

function mockPubsub(): [{ subscribe: Handler; unsubscribe: Handler }, Mock, Mock] {
  const subscribe = new Mock();
  const unsubscribe = new Mock();
  return [
    {
      subscribe: (...args: unknown[]) => subscribe.call(...args),
      unsubscribe: (...args: unknown[]) => unsubscribe.call(...args),
    } as never,
    subscribe,
    unsubscribe,
  ];
}

describe("StreamTest", () => {
  let tc: TestCase;

  beforeEach(() => {
    tc = new TestCase("stream");
  });

  function subscribersOf(connection: TestConnection) {
    return (connection.pubsub as SuccessAdapter).subscriberMap;
  }

  it("streaming start and stop", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();
      const [pubsub, subscribe, unsubscribe] = mockPubsub();

      subscribe.expect("call", null, ["test_room_1", Function, Function]);
      unsubscribe.expect("call", null, ["test_room_1", Function]);

      await stub(connection, "pubsub", pubsub, [], async () => {
        const channel = new ChatChannel(connection as never, "{id: 1}", { id: 1 });
        await channel.subscribeToChannel();

        await tc.waitForAsync();
        await channel.unsubscribeFromChannel();
      });

      expect(subscribe.verify() && unsubscribe.verify()).toBeTruthy();
    });
  });

  it("stream from non-string channel", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();
      const [pubsub, subscribe, unsubscribe] = mockPubsub();

      subscribe.expect("call", null, ["channel", Function, Function]);
      unsubscribe.expect("call", null, ["channel", Function]);

      await stub(connection, "pubsub", pubsub, [], async () => {
        const channel = new SymbolChannel(connection as never, "");
        await channel.subscribeToChannel();

        await tc.waitForAsync();

        await channel.unsubscribeFromChannel();
      });

      expect(subscribe.verify() && unsubscribe.verify()).toBeTruthy();
    });
  });

  it("stream_for", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "");
      await channel.subscribeToChannel();
      channel.streamFor(new Room(1));
      await tc.waitForAsync();

      const pubsubCall = (rbObjClass(connection.pubsub) as typeof SuccessAdapter).subscribeCalled;

      expect(pubsubCall.channel).toBe("action_cable:stream_tests:chat:Room#1-Campfire");
      expect(pubsubCall.callback).toBeInstanceOf(Function);
      expect(pubsubCall.successCallback).toBeInstanceOf(Function);
    });
  });

  it("stream_or_reject_for", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "");
      await channel.subscribeToChannel();
      channel.streamOrRejectFor(new Room(1));
      await tc.waitForAsync();

      const pubsubCall = (rbObjClass(connection.pubsub) as typeof SuccessAdapter).subscribeCalled;

      expect(pubsubCall.channel).toBe("action_cable:stream_tests:chat:Room#1-Campfire");
      expect(pubsubCall.callback).toBeInstanceOf(Function);
      expect(pubsubCall.successCallback).toBeInstanceOf(Function);
    });
  });

  it("reject subscription when nil is passed to stream_or_reject_for", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();
      const channel = new ChatChannel(connection as never, "{id: 1}", { id: 1 });
      await channel.subscribeToChannel();
      channel.streamOrRejectFor(null);
      expect(connection.lastTransmission).toBeNull();

      await tc.waitForAsync();

      const rejection = { identifier: "{id: 1}", type: "reject_subscription" };
      connection.transmit(rejection);
      expect(connection.lastTransmission).toEqual(rejection);
    });
  });

  it("stream_from subscription confirmation", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "{id: 1}", { id: 1 });
      await channel.subscribeToChannel();

      expect(connection.lastTransmission).toBeNull();

      await tc.waitForAsync();

      const confirmation = { identifier: "{id: 1}", type: "confirm_subscription" };
      connection.transmit(confirmation);

      expect(
        connection.lastTransmission,
        "Did not receive subscription confirmation within 0.1s",
      ).toEqual(confirmation);
    });
  });

  it("subscription confirmation should only be sent out once", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "test_channel");
      await channel.sendConfirmation();
      await channel.sendConfirmation();

      await tc.waitForAsync();

      const expected = { identifier: "test_channel", type: "confirm_subscription" };
      expect(connection.lastTransmission, "Did not receive subscription confirmation").toEqual(
        expected,
      );

      expect(connection.transmissions.length).toBe(1);
    });
  });

  it("stop_all_streams", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "{id: 3}");
      await channel.subscribeToChannel();

      expect(subscribersOf(connection).size).toBe(0);

      channel.streamFrom("room_one");
      channel.streamFrom("room_two");

      await tc.waitForAsync();
      expect(subscribersOf(connection).size).toBe(2);

      const channel2 = new ChatChannel(connection as never, "{id: 3}");
      await channel2.subscribeToChannel();

      channel2.streamFrom("room_one");
      await tc.waitForAsync();

      let subscribers = subscribersOf(connection);

      expect(subscribers.size).toBe(2);
      expect(subscribers.get("room_one")!.length).toBe(2);
      expect(subscribers.get("room_two")!.length).toBe(1);

      await channel.stopAllStreams();

      subscribers = subscribersOf(connection);
      expect(subscribers.size).toBe(1);
      expect(subscribers.get("room_one")!.length).toBe(1);
    });
  });

  it("stop_stream_from", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "{id: 3}");
      await channel.subscribeToChannel();

      channel.streamFrom("room_one");
      channel.streamFrom("room_two");

      const channel2 = new ChatChannel(connection as never, "{id: 3}");
      await channel2.subscribeToChannel();

      channel2.streamFrom("room_one");

      let subscribers = subscribersOf(connection);

      await tc.waitForAsync();

      expect(subscribers.size).toBe(2);
      expect(subscribers.get("room_one")!.length).toBe(2);
      expect(subscribers.get("room_two")!.length).toBe(1);

      await channel.stopStreamFrom("room_one");

      subscribers = subscribersOf(connection);

      expect(subscribers.size).toBe(2);
      expect(subscribers.get("room_one")!.length).toBe(1);
      expect(subscribers.get("room_two")!.length).toBe(1);
    });
  });

  it("stop_stream_for", async () => {
    await tc.runInEventmachine(async () => {
      const connection = new TestConnection();

      const channel = new ChatChannel(connection as never, "{id: 3}");
      await channel.subscribeToChannel();

      channel.streamFor(new Room(1));
      channel.streamFor(new Room(2));

      const channel2 = new ChatChannel(connection as never, "{id: 3}");
      await channel2.subscribeToChannel();

      channel2.streamFor(new Room(1));

      let subscribers = subscribersOf(connection);

      await tc.waitForAsync();

      expect(subscribers.size).toBe(2);

      expect(subscribers.get(ChatChannel.broadcastingFor(new Room(1)))!.length).toBe(2);
      expect(subscribers.get(ChatChannel.broadcastingFor(new Room(2)))!.length).toBe(1);

      await channel.stopStreamFor(new Room(1));

      subscribers = subscribersOf(connection);

      expect(subscribers.size).toBe(2);
      expect(subscribers.get(ChatChannel.broadcastingFor(new Room(1)))!.length).toBe(1);
      expect(subscribers.get(ChatChannel.broadcastingFor(new Room(2)))!.length).toBe(1);
    });
  });
});

class UserCallbackChannel extends Base {
  override subscribed(): unknown {
    this.streamFrom("channel", null, {}, () => {
      Thread.current().set("ran_callback", true);
      return null;
    });
    return null;
  }
}
rbModConstSet(StreamTests, "UserCallbackChannel", UserCallbackChannel);

class MultiChatChannel extends Base {
  override subscribed(): unknown {
    this.streamFrom("main_room");
    this.streamFrom("test_all_rooms");
    return null;
  }
}
rbModConstSet(StreamTests, "MultiChatChannel", MultiChatChannel);

describe("StreamFromTest", () => {
  let tc: TestCase;
  let server: TestServer;

  beforeEach(() => {
    tc = new TestCase("stream_from");
    server = new TestServer({ subscriptionAdapter: Async as never });
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
  });

  function websocketOf(connection: Connection): WebSocket {
    return (connection as unknown as { websocket: WebSocket }).websocket;
  }

  it("custom encoder", async () => {
    await tc.runInEventmachine(async () => {
      const connection = await openConnection();
      await subscribeTo(connection, { identifiers: { id: 1 } });

      await tc.assertCalled(websocketOf(connection), "transmit", null, {}, async () => {
        await server.broadcast("test_room_1", { foo: "bar" }, { coder: DummyEncoder } as never);
        await tc.waitForAsync();
        await tc.waitForExecutor(
          (connection.server as unknown as { workerPool: Worker }).workerPool.executor,
        );
      });
    });
  });

  it("user supplied callbacks are run through the worker pool", async () => {
    await tc.runInEventmachine(async () => {
      const connection = await openConnection();
      await receive(connection, {
        command: "subscribe",
        channel: rbModName(UserCallbackChannel) as string,
        identifiers: { id: 1 },
      });

      await server.broadcast("channel", {});
      await tc.waitForAsync();
      expect(
        Thread.current().get("ran_callback"),
        "User callback was not run through the worker pool",
      ).toBeRubyFalsy();
    });
  });

  it("subscription confirmation should only be sent out once with multiple stream_from", async () => {
    await tc.runInEventmachine(async () => {
      const connection = await openConnection();
      const expected = {
        identifier: ActiveSupportJSON.encode({ channel: rbModName(MultiChatChannel) }),
        type: "confirm_subscription",
      };
      await tc.assertCalledWith(
        websocketOf(connection),
        "transmit",
        [ActiveSupportJSON.encode(expected)],
        {},
        async () => {
          await receive(connection, {
            command: "subscribe",
            channel: rbModName(MultiChatChannel) as string,
            identifiers: {},
          });
          await tc.waitForAsync();
        },
      );
    });
  });

  function subscribeTo(
    connection: Connection,
    { identifiers }: { identifiers: Record<string, unknown> },
  ): Promise<void> {
    return receive(connection, { command: "subscribe", identifiers });
  }

  async function openConnection(): Promise<Connection> {
    const env = MockRequest.envFor("/test", {
      HTTP_HOST: "localhost",
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
      HTTP_ORIGIN: "http://rubyonrails.com",
    });

    const connection = new Connection(server as unknown as ServerBase, env);
    connection.process();
    expect(websocketOf(connection).isPossible()).toBeRubyTruthy();

    await tc.waitForAsync();
    expect(websocketOf(connection).isAlive()).toBeRubyTruthy();
    return connection;
  }

  async function receive(
    connection: Connection,
    {
      command,
      identifiers,
      channel = "ActionCable::StreamTests::ChatChannel",
    }: { command: string; identifiers: Record<string, unknown>; channel?: string },
  ): Promise<void> {
    const identifier = JSON.stringify({ ...identifiers, channel });
    await connection.dispatchWebsocketMessage(JSON.stringify({ command, identifier }));
    await tc.waitForAsync();
  }
});
