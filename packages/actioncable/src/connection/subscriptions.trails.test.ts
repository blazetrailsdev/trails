import { describe, expect, it } from "vitest";
import { rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import { Channel } from "../namespaces.js";
import { Subscriptions } from "./subscriptions.js";

const events: string[] = [];

class Base {
  constructor(
    public connection: unknown,
    public identifier: string,
    public params: { get(key: string): unknown },
  ) {}

  async subscribeToChannel(): Promise<void> {
    events.push(`subscribed ${this.identifier}`);
  }

  async unsubscribeFromChannel(): Promise<void> {
    await Promise.resolve();
    events.push(`unsubscribing ${this.identifier}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push(`unsubscribed ${this.identifier}`);
  }

  async performAction(data: unknown): Promise<void> {
    events.push(`perform ${JSON.stringify(data)}`);
  }
}
rbModConstSet(Channel, "Base", Base);

class ChatChannel extends Base {}
registerConstant("SubscriptionsTestChatChannel", ChatChannel);
registerConstant("SubscriptionsTestBase", Base);

function buildConnection() {
  const logged: string[] = [];
  const rescued: unknown[] = [];
  const connection = {
    logger: {
      error: (message: string) => logged.push(message),
      info: (message: string) => logged.push(message),
    },
    rescueWithHandler: (e: unknown) => rescued.push(e),
  };
  return { connection, logged, rescued, subscriptions: new Subscriptions(connection) };
}

function identifier(id: number, channel = "SubscriptionsTestChatChannel"): string {
  return JSON.stringify({ id, channel });
}

describe("ActionCable::Connection::Subscriptions", () => {
  it("ignores a duplicate subscribe", async () => {
    events.length = 0;
    const { subscriptions } = buildConnection();
    await subscriptions.executeCommand({ command: "subscribe", identifier: identifier(1) });
    await subscriptions.executeCommand({ command: "subscribe", identifier: identifier(1) });
    expect(subscriptions.identifiers).toEqual([identifier(1)]);
    expect(events).toEqual([`subscribed ${identifier(1)}`]);
  });

  it("passes the raw identifier and indifferent params to the channel", async () => {
    const { subscriptions } = buildConnection();
    await subscriptions.add({ identifier: identifier(2) });
    await subscriptions.executeCommand({
      command: "message",
      identifier: identifier(2),
      data: JSON.stringify({ action: "speak" }),
    });
    expect(events.at(-1)).toBe(`perform {"action":"speak"}`);
  });

  it("refuses Channel::Base itself", async () => {
    const { subscriptions, logged } = buildConnection();
    await subscriptions.executeCommand({
      command: "subscribe",
      identifier: identifier(3, "SubscriptionsTestBase"),
    });
    expect(subscriptions.identifiers).toEqual([]);
    expect(logged).toEqual(['Subscription class not found: "SubscriptionsTestBase"']);
  });

  it("logs and rescues an unknown subscription", async () => {
    const { subscriptions, logged, rescued } = buildConnection();
    await subscriptions.executeCommand({ command: "unsubscribe", identifier: identifier(4) });
    expect(rescued).toHaveLength(1);
    expect(logged.at(-1)).toMatch(
      /^Could not execute command from .* \[RuntimeError - Unable to find subscription with identifier: /,
    );
  });

  it("logs an unrecognized command", async () => {
    const { subscriptions, logged } = buildConnection();
    await subscriptions.executeCommand({ command: "bogus" });
    expect(logged[0]).toMatch(/^Received unrecognized command in /);
  });

  it("unsubscribes from all in order", async () => {
    const { subscriptions } = buildConnection();
    await subscriptions.add({ identifier: identifier(5) });
    await subscriptions.add({ identifier: identifier(6) });
    events.length = 0;
    await subscriptions.unsubscribeFromAll();
    expect(events).toEqual([
      `unsubscribing ${identifier(5)}`,
      `unsubscribed ${identifier(5)}`,
      `unsubscribing ${identifier(6)}`,
      `unsubscribed ${identifier(6)}`,
    ]);
    expect(subscriptions.identifiers).toEqual([]);
  });
});
