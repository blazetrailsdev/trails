import { afterEach, describe, expect, it } from "vitest";
import { include, constSet, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { ActionCable } from "../index.js";
import { Broadcasting } from "./broadcasting.js";
import { Naming } from "./naming.js";

interface Host {
  broadcastingFor(model: unknown): string;
  broadcastTo(model: unknown, message: unknown): Promise<unknown>;
}

describe("ActionCable::Channel::Broadcasting", () => {
  class ChatChannel {}
  include(ChatChannel, Naming);
  include(ChatChannel, Broadcasting);
  const Chat = { name: "Chat" };
  class RoomsChannel extends ChatChannel {}
  const klass = RoomsChannel as unknown as Host;

  registerConstant("ChatChannel", ChatChannel);
  afterEach(() => unregisterConstant("Chat", Chat));

  it("serializes a namespaced class's channel name with the model", () => {
    registerConstant("Chat", Chat);
    constSet(Chat, "RoomsChannel", RoomsChannel);
    expect(klass.broadcastingFor("lobby")).toBe("chat:rooms:lobby");
  });

  it("memoizes the channel name per class", () => {
    expect((ChatChannel as unknown as Host).broadcastingFor("x")).toBe("chat:x");
  });

  it("joins a nested array, a GlobalID-answering object and nil", () => {
    const record = { toGidParam: () => "Z2lkOi8v" };
    const host = ChatChannel as unknown as Host;
    expect(host.broadcastingFor([["a", record], null])).toBe("chat:a:Z2lkOi8v:");
  });

  it("delegates the instance halves to the class", async () => {
    const sent: unknown[][] = [];
    const server = {
      broadcast: async (b: unknown, m: unknown) => {
        sent.push([b, m]);
      },
    };
    const previous = (ActionCable as { _server?: unknown })._server;
    (ActionCable as { _server?: unknown })._server = server;
    try {
      const channel = new ChatChannel() as unknown as Host;
      expect(channel.broadcastingFor("plain")).toBe("chat:plain");
      await channel.broadcastTo("plain", { a: 1 });
      expect(sent).toEqual([["chat:plain", { a: 1 }]]);
    } finally {
      (ActionCable as { _server?: unknown })._server = previous;
    }
  });
});
