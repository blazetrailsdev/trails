import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import "../index.js";
import { InternalChannel } from "./internal-channel.js";

type Callback = (message: unknown) => unknown;

class Connection {
  connectionIdentifier = "user:1";
  logged: string[] = [];
  closed: unknown[] = [];
  posted: (() => unknown)[] = [];
  subscribed: [string, Callback][] = [];
  unsubscribed: [string, Callback][] = [];
  logger = {
    info: (message: string) => this.logged.push(message),
    error: (message: string) => this.logged.push(message),
  };
  server = { eventLoop: { post: (_task: null, block: () => unknown) => this.posted.push(block) } };
  pubsub = {
    subscribe: (channel: string, callback: Callback) => this.subscribed.push([channel, callback]),
    unsubscribe: (channel: string, callback: Callback) =>
      this.unsubscribed.push([channel, callback]),
  };
  decode(message: unknown): unknown {
    return JSON.parse(message as string);
  }
  close(...args: unknown[]): void {
    this.closed.push(args[0]);
    if (this.connectionIdentifier === "raises" && args.length) throw new TypeError("boom");
  }
}
include(Connection, InternalChannel);

type Host = Connection & {
  internalChannel: string;
  subscribeToInternalChannel(): void;
  unsubscribeFromInternalChannel(): void;
};

function subscribed(connection: Host): Callback {
  connection.subscribeToInternalChannel();
  for (const task of connection.posted.splice(0)) task();
  return connection.subscribed[0][1];
}

describe("ActionCable::Connection::InternalChannel", () => {
  it("subscribes to and unsubscribes from the internal channel with one callback", () => {
    const connection = new Connection() as Host;
    expect(connection.internalChannel).toBe("action_cable/user:1");
    const callback = subscribed(connection);
    expect(connection.subscribed).toEqual([["action_cable/user:1", callback]]);
    expect(connection.logged).toEqual(["Registered connection (user:1)"]);

    connection.unsubscribeFromInternalChannel();
    for (const task of connection.posted.splice(0)) task();
    expect(connection.unsubscribed).toEqual([["action_cable/user:1", callback]]);
  });

  it("skips the subscription for a blank identifier", () => {
    const connection = new Connection() as Host;
    connection.connectionIdentifier = "";
    connection.subscribeToInternalChannel();
    connection.unsubscribeFromInternalChannel();
    expect(connection.posted).toEqual([]);
  });

  it("closes on disconnect, keeping a stored reconnect", () => {
    const connection = new Connection() as Host;
    const callback = subscribed(connection);
    callback(JSON.stringify({ type: "disconnect", reconnect: false }));
    callback(JSON.stringify({ type: "disconnect", reconnect: null }));
    callback(JSON.stringify({ type: "disconnect" }));
    callback(JSON.stringify({ type: "other" }));
    expect(connection.closed).toEqual([
      { reason: "remote", reconnect: false },
      { reason: "remote", reconnect: null },
      { reason: "remote", reconnect: true },
    ]);
  });

  it("logs and closes when processing raises", () => {
    const connection = new Connection() as Host;
    connection.connectionIdentifier = "raises";
    const callback = subscribed(connection);
    connection.logged.length = 0;
    callback(JSON.stringify({ type: "disconnect" }));
    expect(connection.logged[1]).toBe("There was an exception - TypeError(boom)");
    expect(connection.closed).toEqual([{ reason: "remote", reconnect: true }, undefined]);
  });
});
