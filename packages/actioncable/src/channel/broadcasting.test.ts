import { constSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Room } from "../test-helpers/stubs/room.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { Base } from "./base.js";

class ChatChannel extends Base {}
const Chat = ChatChannel as unknown as {
  broadcastTo(model: unknown, message: unknown): Promise<unknown>;
  broadcastingFor(model: unknown): string;
};

const BroadcastingTest = { name: "ActionCable::Channel::BroadcastingTest" };
constSet(ActionCable.Channel, "BroadcastingTest", BroadcastingTest);
constSet(BroadcastingTest, "ChatChannel", ChatChannel);

describe("ActionCable::Channel::BroadcastingTest", () => {
  let tc: TestCase;
  let _connection: TestConnection;

  beforeEach(() => {
    tc = new TestCase("broadcasting");
    _connection = new TestConnection();
  });

  it("broadcasts_to", async () => {
    await tc.assertCalledWith(
      ActionCable.server() as object,
      "broadcast" as never,
      ["action_cable:channel:broadcasting_test:chat:Room#1-Campfire", "Hello World"],
      {},
      async () => {
        await Chat.broadcastTo(new Room(1), "Hello World");
      },
    );
  });

  it("broadcasting_for with an object", () => {
    expect(Chat.broadcastingFor(new Room(1))).toBe(
      "action_cable:channel:broadcasting_test:chat:Room#1-Campfire",
    );
  });

  it("broadcasting_for with an array", () => {
    expect(Chat.broadcastingFor([new Room(1), new Room(2)])).toBe(
      "action_cable:channel:broadcasting_test:chat:Room#1-Campfire:Room#2-Campfire",
    );
  });

  it("broadcasting_for with a string", () => {
    expect(Chat.broadcastingFor("hello")).toBe("action_cable:channel:broadcasting_test:chat:hello");
  });
});
