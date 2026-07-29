/**
 * trails-only coverage for `preventing_writes?`'s nil-descriptor branch
 * (abstract_adapter.rb:229). A standalone adapter has no pool and therefore no
 * connection descriptor, so an ambient `Base.while_preventing_writes` scope —
 * which Rails resolves through that descriptor — cannot reach it.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "../support/describe-if-sqlite.js";
import { Base } from "../base.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

let adapter: BetterSQLite3Adapter;

describeIfSqlite("AbstractAdapter#isPreventingWrites with no connection descriptor", () => {
  beforeEach(() => {
    adapter = new BetterSQLite3Adapter(":memory:");
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("is not preventing writes inside an ambient Base scope", async () => {
    expect(adapter.connectionDescriptor).toBeNull();

    await Base.whilePreventingWrites(async () => {
      expect(adapter.isPreventingWrites()).toBe(false);
    });
  });

  it("still reports preventing writes for a standalone replica", async () => {
    const replica = new BetterSQLite3Adapter({ database: ":memory:", replica: true } as never);
    try {
      expect(replica.connectionDescriptor).toBeNull();
      expect(replica.isPreventingWrites()).toBe(true);
    } finally {
      await replica.close();
    }
  });
});
