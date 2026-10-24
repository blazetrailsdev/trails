import { TopLevel } from "@blazetrails/activesupport";
import { Monitor, OpenSSL, globalIoExecutor, rbObjIvarSet } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StreamEventLoop } from "../connection/stream-event-loop.js";
import { PostgreSQL } from "./postgresql.js";

class Connection {
  log: string[];
  notifies: [string, string][] = [];
  constructor(log: string[]) {
    this.log = log;
  }
  async exec(sql: string): Promise<null> {
    this.log.push(sql);
    return null;
  }
  escapeIdentifier(str: string): string {
    return `"${str.replace(/"/g, '""')}"`;
  }
  escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }
  async waitForNotify(
    _timeout: number,
    block: (chan: string, pid: number, message: string) => unknown,
  ): Promise<string | null> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const notification = this.notifies.shift();
    if (notification === undefined) return null;
    block(notification[0], 1, notification[1]);
    return notification[0];
  }
}

let log: string[];
let raw: unknown;
let saved: Record<string, unknown>;

function adapter(cable: Record<string, unknown> = {}): PostgreSQL {
  const eventLoop = new StreamEventLoop();
  rbObjIvarSet(eventLoop, "@executor", globalIoExecutor());
  return new PostgreSQL({
    logger: null,
    config: { cable: { id: "cable-id", ...cable } },
    mutex: new Monitor(),
    eventLoop,
  });
}

beforeEach(() => {
  log = [];
  raw = new Connection(log);
  saved = { ActiveRecord: TopLevel.ActiveRecord, PG: TopLevel.PG };
  const arConn = {
    rawConnection: async () => raw,
    disconnectBang: async () => log.push("disconnect!"),
  };
  TopLevel.PG = { Connection };
  TopLevel.ActiveRecord = {
    Base: {
      logger: null,
      connectionPool: {
        newConnection: () => {
          log.push("new_connection");
          return arConn;
        },
        withConnection: async (block: (c: unknown) => unknown) => {
          log.push("with_connection");
          return await block(arConn);
        },
      },
    },
  } as never;
});

afterEach(() => {
  Object.assign(TopLevel, saved);
});

describe("ActionCable::SubscriptionAdapter::PostgreSQL", () => {
  it("broadcasts with NOTIFY on a pooled connection", async () => {
    await adapter({ channelPrefix: "p" }).broadcast("chat", "it's");
    expect(log).toEqual(["with_connection", `NOTIFY "p:chat", 'it''s'`]);
  });

  it("hashes a channel longer than 63 characters", async () => {
    const channel = "a".repeat(101);
    await adapter().broadcast(channel, "x");
    expect(log[1]).toBe(`NOTIFY "${OpenSSL.Digest.SHA1.hexdigest(channel)}", 'x'`);
  });

  it("listens in queue order on an un-pooled connection and shuts down", async () => {
    const a = adapter();
    const events: string[] = [];
    const cb = (m: unknown) => events.push(`message ${String(m)}`);
    await a.subscribe("one", cb, () => events.push(`success ${log.includes(`LISTEN "one"`)}`));
    await a.subscribe("two", cb);
    await a.unsubscribe("two", cb);
    await new Promise((resolve) => setTimeout(resolve, 20));
    (raw as Connection).notifies.push(["one", "hi"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await a.shutdown();

    expect(log).toEqual([
      "new_connection",
      `SET application_name = "cable-id"`,
      `LISTEN "one"`,
      `LISTEN "two"`,
      `UNLISTEN "two"`,
      "disconnect!",
    ]);
    expect(events).toEqual(["success true", "message hi"]);
  });

  it("raises unless the raw connection is a PG::Connection", async () => {
    raw = {};
    await expect(adapter().broadcast("chat", "x")).rejects.toThrow(
      "The Active Record database must be PostgreSQL in order to use the PostgreSQL Action Cable storage adapter",
    );
  });
});
