import { constSet } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Base } from "./base.js";

class ChatChannel extends Base {}

const NamingTest = { name: "ActionCable::Channel::NamingTest" };
constSet(ActionCable.Channel, "NamingTest", NamingTest);
constSet(NamingTest, "ChatChannel", ChatChannel);

describe("ActionCable::Channel::NamingTest", () => {
  it("channel_name", () => {
    expect((ChatChannel as unknown as { channelName: string }).channelName).toBe(
      "action_cable:channel:naming_test:chat",
    );
  });
});
