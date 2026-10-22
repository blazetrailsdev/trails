import { afterEach, describe, expect, it } from "vitest";
import { safeConstantize } from "@blazetrails/activesupport";
import {
  include,
  rbModConstSet,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { ActionCable } from "../index.js";
import { Naming } from "./naming.js";

describe("ActionCable::Channel::Naming constant names", () => {
  class ChatChannel {}
  include(ChatChannel, Naming);
  const Chat = { name: "Chat" };
  class AppearancesChannel extends ChatChannel {}

  afterEach(() => unregisterConstant("Chat", Chat));

  it("names a framework module by its Ruby constant path", () => {
    expect(safeConstantize("ActionCable::Channel::Naming")).toBe(Naming);
    expect((ActionCable.Channel as unknown as Record<string, unknown>).Naming).toBe(Naming);
  });

  it("reads a namespaced channel's full Ruby name and resolves it through safeConstantize", () => {
    registerConstant("Chat", Chat);
    rbModConstSet(Chat, "AppearancesChannel", AppearancesChannel);

    const channelName = (AppearancesChannel as unknown as { channelName: string }).channelName;
    expect(channelName).toBe("chat:appearances");
    expect(new AppearancesChannel() as unknown as { channelName: string }).toMatchObject({
      channelName: "chat:appearances",
    });
    expect(safeConstantize("Chat::AppearancesChannel")).toBe(AppearancesChannel);
  });

  it("does not read a parent's channel_name memo", () => {
    rbModConstSet(ActionCable.Channel, "ChatChannel", ChatChannel);
    expect((ChatChannel as unknown as { channelName: string }).channelName).toBe(
      "action_cable:channel:chat",
    );
    registerConstant("Chat", Chat);
    rbModConstSet(Chat, "AppearancesChannel", AppearancesChannel);
    expect((AppearancesChannel as unknown as { channelName: string }).channelName).toBe(
      "chat:appearances",
    );
  });

  it("raises for an anonymous channel class rather than inventing a name", () => {
    const Anonymous = class extends ChatChannel {};
    Object.defineProperty(Anonymous, "name", { value: "" });
    expect(() => (Anonymous as unknown as { channelName: string }).channelName).toThrow(TypeError);
  });

  it("answers null for an unknown or malformed name", () => {
    expect(safeConstantize("Chat::NoSuchChannel")).toBeUndefined();
    expect(safeConstantize("NoSuchChannel")).toBeUndefined();
    expect(safeConstantize("not a constant")).toBeUndefined();
  });
});
