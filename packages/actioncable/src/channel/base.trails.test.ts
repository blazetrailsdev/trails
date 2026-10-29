import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { TestConnection } from "../test-helpers/stubs/test-connection.js";
import { Base, registerChannel, registeredChannel } from "./base.js";

class BasicChannel extends Base {
  chatters(): void {}
}

class ChatChannel extends BasicChannel {
  log: unknown[] = [];
  #secret(): void {}
  get room(): unknown {
    return null;
  }
  isSubscribed(): boolean {
    return true;
  }
  override subscribed(): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(() => {
        this.log.push("subscribed");
        resolve();
      }, 5),
    );
  }
  speak(data: unknown): void {
    this.log.push(["speak", data]);
  }
  optional(data: unknown = {}): void {
    this.log.push(["optional", data]);
  }
  rest(...args: unknown[]): void {
    this.log.push(["rest", args]);
  }
  touch(): void {
    this.#secret();
  }
}

describe("ActionCable::Channel::Base", () => {
  it("counts subclass members, getters and predicates, not Base or #private ones", () => {
    expect([...ChatChannel.actionMethods()].sort()).toEqual(
      [
        "chatters",
        "isSubscribed",
        "optional",
        "rest",
        "room",
        "speak",
        "subscribed",
        "touch",
      ].sort(),
    );
    expect(ChatChannel.actionMethods().has("transmit")).toBe(false);
  });

  it("keeps a Base method redefined on the channel and recomputes after methodAdded", () => {
    class TopicChannel extends Base {}
    expect(TopicChannel.actionMethods().has("topic")).toBe(false);
    (TopicChannel.prototype as unknown as Record<string, unknown>).topic = () => null;
    (TopicChannel as unknown as { methodAdded(name: string): void }).methodAdded("topic");
    expect(TopicChannel.actionMethods().has("topic")).toBe(true);
  });

  it("passes data only to an action of Ruby arity 1", async () => {
    const channel = new ChatChannel(new TestConnection() as never, "{id: 1}");
    await channel.performAction({ action: "speak", x: 1 });
    await channel.performAction({ action: "optional", x: 1 });
    await channel.performAction({ action: "rest", x: 1 });
    expect(channel.log).toEqual([
      ["speak", { action: "speak", x: 1 }],
      ["optional", {}],
      ["rest", []],
    ]);
  });

  it("transmits the confirmation after an async subscribed finishes", async () => {
    const connection = new TestConnection();
    const channel = new ChatChannel(connection as never, "{id: 1}");
    await channel.subscribeToChannel();
    expect(channel.log).toEqual(["subscribed"]);
    expect(connection.lastTransmission).toEqual({
      identifier: "{id: 1}",
      type: "confirm_subscription",
    });
  });

  it("delegates connection identifiers as own methods that are not actions", () => {
    const connection = new TestConnection();
    const channel = new ChatChannel(connection as never, "{id: 1}");
    expect((channel as unknown as { currentUser(): unknown }).currentUser()).toBe(
      connection.currentUser,
    );
    expect(ChatChannel.actionMethods().has("currentUser")).toBe(false);
  });

  it("closes the perform_action event after an async action settles", async () => {
    class SlowChannel extends Base {
      done = false;
      async slow(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 20));
        this.done = true;
      }
    }
    const channel = new SlowChannel(new TestConnection() as never, "{id: 1}");
    const events: NotificationEvent[] = [];
    Notifications.subscribe("perform_action.action_cable", (event) => events.push(event));
    try {
      await channel.performAction({ action: "slow" });
    } finally {
      Notifications.unsubscribe("perform_action.action_cable");
    }
    expect(channel.done).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].duration).toBeGreaterThanOrEqual(15);
  });
});

describe("registeredChannel", () => {
  it("reads back a channel seated by registerChannel under its name and an explicit name", () => {
    class RegistryReadChannel extends Base {}
    registerChannel(RegistryReadChannel);
    registerChannel("Registry::AliasChannel", RegistryReadChannel);
    expect(registeredChannel("RegistryReadChannel")).toBe(RegistryReadChannel);
    expect(registeredChannel("Registry::AliasChannel")).toBe(RegistryReadChannel);
    expect(registeredChannel("NeverRegisteredChannel")).toBeUndefined();
  });
});
