import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { Base } from "./base.js";
import { ConnectionStub, TestCase } from "./test-case.js";

class StubbedChannel extends Base {
  subscribed(): void {
    (this as unknown as { streamFrom(b: string): unknown }).streamFrom("room");
  }
}

describe("ActionCable::Channel::TestCase", () => {
  it("applies ChannelStub to one subscription only", async () => {
    const before = Object.getOwnPropertyNames(StubbedChannel.prototype);
    class StubbedChannelTest extends TestCase {}
    StubbedChannelTest.tests(StubbedChannel);
    const tc = new StubbedChannelTest("testNothing" as never);

    const subscription = await tc.subscribe();
    expect(subscription.streams).toEqual(["room"]);
    expect(subscription.isConfirmed()).toBe(true);

    const other = new StubbedChannel(new ConnectionStub() as never, "x");
    expect("isConfirmed" in other).toBe(false);
    expect(Object.getOwnPropertyNames(StubbedChannel.prototype)).toEqual(before);
    expect(Object.getPrototypeOf(other)).toBe(StubbedChannel.prototype);
  });

  it("joins identifiers into the connection identifier", () => {
    expect(new ConnectionStub({ username: "John", admin: true }).connectionIdentifier).toBe(
      "John:true",
    );
  });

  it("runs the action_cable_channel_test_case load hooks with the class", () => {
    let base: unknown;
    onLoad("action_cable_channel_test_case", (klass: unknown) => {
      base = klass;
    });
    expect(base).toBe(TestCase);
    expect(ActionCable.Channel.TestCase).toBe(TestCase);
  });
});
