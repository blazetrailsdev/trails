import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2Adapter } from "../mysql2-adapter.js";

function adapterWith(raw: unknown): Mysql2Adapter {
  const adapter = Object.create(Mysql2Adapter.prototype) as Mysql2Adapter;
  (adapter as unknown as { _connection: unknown })._connection = raw;
  return adapter;
}

function promiseConnection(base: object): unknown {
  const PromiseConnection = (mysql as unknown as { PromiseConnection: new (c: object) => unknown })
    .PromiseConnection;
  return new PromiseConnection(Object.assign(Object.create({ on() {} }), base));
}

describe("Mysql2Adapter#isConnected", () => {
  it("is false without a raw connection", () => {
    expect(adapterWith(null).isConnected()).toBe(false);
  });

  it("is true for an open promise connection", () => {
    expect(adapterWith(promiseConnection({ _closing: false })).isConnected()).toBe(true);
  });

  it("is false once the driver connection is closing", () => {
    expect(adapterWith(promiseConnection({ _closing: true })).isConnected()).toBe(false);
  });

  it("is false once the driver stream is destroyed", () => {
    const raw = promiseConnection({ _closing: false, stream: { destroyed: true } });
    expect(adapterWith(raw).isConnected()).toBe(false);
  });
});
