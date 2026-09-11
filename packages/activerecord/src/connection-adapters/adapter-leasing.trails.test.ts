import { describe, it, expect } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { withExecutionContext } from "./abstract/connection-pool/execution-context.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { PoolConfig } from "./pool-config.js";
import { ConnectionDescriptor } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { ActiveRecordError } from "../errors.js";

describe("AdapterLeasingTest", () => {
  it("expire from a different thread raises", async () => {
    const adapter = new AbstractAdapter({});
    adapter.lease();
    await withExecutionContext(async () => {
      expect(() => adapter.expire()).toThrow(ActiveRecordError);
      expect(() => adapter.expire()).toThrow(
        /^Cannot expire connection, it is owned by a different thread: #<Thread:0x0{16} run>\. Current thread: #<Thread:0x[0-9a-f]{16} run>\.$/,
      );
    });
    expect(adapter.inUse).toBeTruthy();
    adapter.expire();
    expect(adapter.inUse).toBeFalsy();
  });

  it("lease from a different thread names the owner", async () => {
    const adapter = new AbstractAdapter({});
    adapter.lease();
    await withExecutionContext(async () => {
      expect(() => adapter.lease()).toThrow(
        /^Cannot lease connection, it is already in use by a different thread: #<Thread:0x0{16} run>\. Current thread: #<Thread:0x[0-9a-f]{16} run>\.$/,
      );
    });
  });

  it("steal! from a different thread takes ownership", async () => {
    const adapter = new AbstractAdapter({});
    const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
    adapter.pool = new ConnectionPool(
      new PoolConfig(new ConnectionDescriptor("primary"), dbConfig),
    );
    adapter.lease();
    await withExecutionContext(async () => {
      adapter.stealBang();
      expect(() => adapter.expire()).not.toThrow();
    });
    expect(adapter.inUse).toBeFalsy();
  });
});
