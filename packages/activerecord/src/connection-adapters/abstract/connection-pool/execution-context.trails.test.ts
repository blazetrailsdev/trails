import { describe, it, expect } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { ConnectionPool } from "../connection-pool.js";
import { PoolConfig } from "../../pool-config.js";
import { ConnectionDescriptor } from "../connection-handler.js";
import { HashConfig } from "../../../database-configurations/hash-config.js";
import { executionContext, withExecutionContext } from "./execution-context.js";

describe("execution context per IsolatedExecutionState.run", () => {
  it("gives concurrent runs distinct leases and leaves top-level code on the root context", async () => {
    const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
    const pool = new ConnectionPool(new PoolConfig(new ConnectionDescriptor("primary"), dbConfig));
    const lease = () => (pool as unknown as { connectionLease(): object }).connectionLease();

    const [a, b] = await Promise.all([
      IsolatedExecutionState.run(async () => {
        await Promise.resolve();
        return lease();
      }),
      IsolatedExecutionState.run(async () => lease()),
    ]);

    expect(a).not.toBe(b);
    expect(executionContext().id).toBe(0);
    expect(lease()).not.toBe(a);
    expect(lease()).toBe(lease());
  });

  it("carries the caller's scoped state into the new thread", () => {
    const seen = IsolatedExecutionState.scope("scoped_key", "scoped", () =>
      withExecutionContext(() => IsolatedExecutionState.get("scoped_key")),
    );
    expect(seen).toBe("scoped");
  });
});
