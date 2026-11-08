import { constSet } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../support/test-helper.js";
import { ActionCable } from "../../lib/namespaces.js";
import { Base } from "../../lib/channel/base.js";

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
