import { Mock, stub } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { ActionCable } from "../namespaces.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { User } from "../test-helpers/stubs/user.js";
import { Base } from "./base.js";

class SecretChannel extends Base {
  override subscribed(): unknown {
    if ((this.params["id"] as number) > 0) return this.reject();
    return null;
  }

  secretAction(): void {}
}

const RejectionTest = { name: "ActionCable::Channel::RejectionTest" };
constSet(ActionCable.Channel, "RejectionTest", RejectionTest);
constSet(RejectionTest, "SecretChannel", SecretChannel);

function mockSubscriptions(): [{ removeSubscription(subscription: unknown): unknown }, Mock] {
  const removeSubscription = new Mock();
  removeSubscription.expect("call", SecretChannel, [SecretChannel]);
  return [{ removeSubscription: (s: unknown) => removeSubscription.call(s) }, removeSubscription];
}

describe("ActionCable::Channel::RejectionTest", () => {
  let user: User;
  let connection: TestConnection;
  let channel: SecretChannel;

  beforeEach(() => {
    user = new User("lifo");
    connection = new TestConnection(user);
  });

  it("subscription rejection", async () => {
    const [subscriptions, mock] = mockSubscriptions();

    await stub(connection, "subscriptions", subscriptions, [], async () => {
      channel = new SecretChannel(connection as never, "{id: 1}", { id: 1 });
      await channel.subscribeToChannel();

      const expected = { identifier: "{id: 1}", type: "reject_subscription" };
      expect(connection.lastTransmission).toEqual(expected);
    });

    expect(mock.verify()).toBeTruthy();
  });

  it("does not execute action if subscription is rejected", async () => {
    const [subscriptions, mock] = mockSubscriptions();

    await stub(connection, "subscriptions", subscriptions, [], async () => {
      channel = new SecretChannel(connection as never, "{id: 1}", { id: 1 });
      await channel.subscribeToChannel();

      const expected = { identifier: "{id: 1}", type: "reject_subscription" };
      expect(connection.lastTransmission).toEqual(expected);
      expect(connection.transmissions.length).toBe(1);

      await channel.performAction({ action: "secretAction" });
      expect(connection.transmissions.length).toBe(1);
    });

    expect(mock.verify()).toBeTruthy();
  });
});
