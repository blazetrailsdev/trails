import { describe, expect, it, vi } from "vitest";
import { beginDeferredTransaction } from "./abstract/database-statements.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe.each([
  ["Mysql2Adapter", Mysql2Adapter],
  ["PostgreSQLAdapter", PostgreSQLAdapter],
] as const)("%s#beginDeferredTransaction", (_name, klass) => {
  it("begins an isolated transaction when given an isolation level", async () => {
    const host = {
      beginIsolatedDbTransaction: vi.fn(async () => {}),
      beginDbTransaction: vi.fn(async () => {}),
    };
    await (
      klass.prototype as unknown as { beginDeferredTransaction: typeof beginDeferredTransaction }
    ).beginDeferredTransaction.call(host as never, ":read_committed");
    expect(host.beginIsolatedDbTransaction).toHaveBeenCalledWith(":read_committed");
    expect(host.beginDbTransaction).not.toHaveBeenCalled();
  });

  it("begins a plain transaction without an isolation level", async () => {
    const host = {
      beginIsolatedDbTransaction: vi.fn(async () => {}),
      beginDbTransaction: vi.fn(async () => {}),
    };
    await (
      klass.prototype as unknown as { beginDeferredTransaction: typeof beginDeferredTransaction }
    ).beginDeferredTransaction.call(host as never);
    expect(host.beginDbTransaction).toHaveBeenCalled();
    expect(host.beginIsolatedDbTransaction).not.toHaveBeenCalled();
  });
});
