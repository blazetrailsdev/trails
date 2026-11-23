import { describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2 } from "@blazetrails/mysql2";
import { Mysql2Adapter } from "../../../../lib/connection-adapters/mysql2-adapter.js";

function adapterWith(raw: unknown): Mysql2Adapter {
  const adapter = Object.create(Mysql2Adapter.prototype) as Mysql2Adapter;
  (adapter as unknown as { _rawConnection: unknown })._rawConnection = raw;
  return adapter;
}

async function promiseConnection(base: object): Promise<unknown> {
  const PromiseConnection = (mysql as unknown as { PromiseConnection: new (c: object) => unknown })
    .PromiseConnection;
  const connection = new PromiseConnection(Object.assign(Object.create({ on() {} }), base));
  const createConnection = vi
    .spyOn(mysql, "createConnection")
    .mockResolvedValue(connection as never);
  try {
    return await Mysql2.Client.new({});
  } finally {
    createConnection.mockRestore();
  }
}

describe("Mysql2Adapter#isConnected", () => {
  it("is false without a raw connection", () => {
    expect(adapterWith(null).isConnected()).toBe(false);
  });

  it("is true for an open promise connection", async () => {
    expect(adapterWith(await promiseConnection({ _closing: false })).isConnected()).toBe(true);
  });

  it("is false once the driver connection is closing", async () => {
    expect(adapterWith(await promiseConnection({ _closing: true })).isConnected()).toBe(false);
  });

  it("is false once the driver stream is destroyed", async () => {
    const raw = await promiseConnection({ _closing: false, stream: { destroyed: true } });
    expect(adapterWith(raw).isConnected()).toBe(false);
  });
});
