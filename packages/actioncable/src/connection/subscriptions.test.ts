import { ActiveSupportJSON, assertCalled } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { Exception, hashAref, constSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Base as ChannelBase } from "../channel/base.js";
import { ActionCable } from "../namespaces.js";
import { TestCase } from "../test-helpers/test-helper.js";
import { Room } from "../test-helpers/stubs/room.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import { Base } from "./base.js";
import { Subscriptions } from "./subscriptions.js";

type Data = Record<string, unknown>;

class ChatChannelError extends Exception {}

class Connection extends Base {
  exceptions: unknown[] = [];

  sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }

  errorHandler(e: unknown): void {
    this.exceptions.push(e);
  }

  static {
    this.rescueFrom(ChatChannelError, {
      with: ":errorHandler",
    });
  }
}

class ChatChannel extends ChannelBase {
  declare room: Room;
  declare lines: Data[];

  override subscribed(): unknown {
    this.room = new Room(hashAref(this.params, "id"));
    return (this.lines = []);
  }

  speak(data: Data): void {
    this.lines.push(data);
  }

  throwException(_data: Data): void {
    throw new ChatChannelError("Uh Oh");
  }
}

const SubscriptionsTest = { name: "ActionCable::Connection::SubscriptionsTest" };
constSet(ActionCable.Connection, "SubscriptionsTest", SubscriptionsTest);
constSet(SubscriptionsTest, "ChatChannel", ChatChannel);

describe("ActionCable::Connection::SubscriptionsTest", () => {
  const t = new TestCase("subscriptions");
  let server: TestServer;
  let chatIdentifier: string;
  let connection: Connection;
  let subscriptions: Subscriptions;

  beforeEach(() => {
    server = new TestServer();

    chatIdentifier = ActiveSupportJSON.encode({
      id: 1,
      channel: "ActionCable::Connection::SubscriptionsTest::ChatChannel",
    });
  });

  it("subscribe command", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();
      const channel = await subscribeToChatChannel();

      expect(channel).toBeInstanceOf(ChatChannel);
      expect(channel.room.id).toBe(1);
    });
  });

  it("subscribe command without an identifier", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();

      await subscriptions.executeCommand({ command: "subscribe" });
      expect(subscriptions.identifiers).toBeEmpty();
    });
  });

  it("subscribe command with Base channel", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();

      const identifier = ActiveSupportJSON.encode({ id: 1, channel: "ActionCable::Channel::Base" });
      await subscriptions.executeCommand({ command: "subscribe", identifier });

      expect(subscriptions.identifiers).toBeEmpty();
    });
  });

  it("unsubscribe command", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();
      await subscribeToChatChannel();

      const channel = await subscribeToChatChannel();

      await assertCalled(channel, "unsubscribeFromChannel", null, {}, async () => {
        await subscriptions.executeCommand({ command: "unsubscribe", identifier: chatIdentifier });
      });

      expect(subscriptions.identifiers).toBeEmpty();
    });
  });

  it("unsubscribe command without an identifier", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();

      await subscriptions.executeCommand({ command: "unsubscribe" });
      expect(subscriptions.identifiers).toBeEmpty();
    });
  });

  it("message command", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();
      const channel = await subscribeToChatChannel();

      const data = { content: "Hello World!", action: "speak" };
      await subscriptions.executeCommand({
        command: "message",
        identifier: chatIdentifier,
        data: ActiveSupportJSON.encode(data),
      });

      expect(channel.lines).toEqual([data]);
    });
  });

  it("accessing exceptions thrown during command execution", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();
      await subscribeToChatChannel();

      const data = { content: "Hello World!", action: "throwException" };
      await subscriptions.executeCommand({
        command: "message",
        identifier: chatIdentifier,
        data: ActiveSupportJSON.encode(data),
      });

      const exception = connection.exceptions[0];
      expect(exception).toBeInstanceOf(ChatChannelError);
    });
  });

  it("unsubscribe from all", async () => {
    await t.runInEventmachine(async () => {
      setupConnection();

      const channel1 = await subscribeToChatChannel();

      const channel2Id = ActiveSupportJSON.encode({
        id: 2,
        channel: "ActionCable::Connection::SubscriptionsTest::ChatChannel",
      });
      const channel2 = await subscribeToChatChannel(channel2Id);

      await assertCalled(channel1, "unsubscribeFromChannel", null, {}, async () => {
        await assertCalled(channel2, "unsubscribeFromChannel", null, {}, async () => {
          await subscriptions.unsubscribeFromAll();
        });
      });
    });
  });

  async function subscribeToChatChannel(identifier = chatIdentifier): Promise<ChatChannel> {
    await subscriptions.executeCommand({ command: "subscribe", identifier });
    expect(subscriptions.identifiers.at(-1)).toBe(identifier);

    return (subscriptions as unknown as { find(data: Data): ChatChannel }).find({ identifier });
  }

  function setupConnection(): void {
    const env = MockRequest.envFor("/test", {
      HTTP_HOST: "localhost",
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
    });
    connection = new Connection(server as never, env);

    subscriptions = new Subscriptions(connection as never);
  }
});
