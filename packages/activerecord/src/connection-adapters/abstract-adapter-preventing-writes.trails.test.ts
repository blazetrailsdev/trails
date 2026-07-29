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
