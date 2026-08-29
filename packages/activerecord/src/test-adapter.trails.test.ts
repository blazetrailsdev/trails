import { describe, expect, test } from "vitest";
import { Base } from "./base.js";
import { ambientPoolConfiguration, checkoutRawTestAdapter } from "./test-adapter.js";
import { currentAdapter, inMemoryDb } from "./support/adapter-helper.js";

describe("ambientPoolConfiguration", () => {
  test("matches the primary pool's configuration hash key-for-key", () => {
    expect(ambientPoolConfiguration()).toEqual(Base.connectionPool().dbConfig.configurationHash);
  });

  test.skipIf(inMemoryDb())("newRawTestAdapter opens the database Base rides", async () => {
    const { adapter, pool } = await checkoutRawTestAdapter();
    try {
      expect(await adapter.tableExists("posts")).toBe(true);
    } finally {
      pool.releaseConnection();
      await pool.disconnectBang();
    }
  });

  test.skipIf(!currentAdapter("SQLite3Adapter"))(
    "newRawTestAdapter opens sqlite with the ambient strict setting",
    async () => {
      const { adapter, pool } = await checkoutRawTestAdapter();
      try {
        expect((adapter as unknown as { _strictStrings: boolean })._strictStrings).toBe(
          Boolean(ambientPoolConfiguration().strict),
        );
      } finally {
        pool.releaseConnection();
        await pool.disconnectBang();
      }
    },
  );
});
