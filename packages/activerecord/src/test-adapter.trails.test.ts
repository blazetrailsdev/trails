/**
 * trails-only: `ambientPoolConfiguration()` claims to be Rails'
 * `ActiveRecord::Base.connection_pool.db_config.configuration_hash`. It used to
 * rebuild the sqlite entry by hand and disagreed with the pool on `database`,
 * `timeout` and `strict`; this pins the two to one source — the `connections:`
 * entry `ARCONN` selects.
 */

import { describe, expect, test } from "vitest";
import { Base } from "./base.js";
import { ambientPoolConfiguration, newRawTestAdapter } from "./test-adapter.js";
import { currentAdapter, inMemoryDb } from "./support/adapter-helper.js";

describe("ambientPoolConfiguration", () => {
  test("matches the primary pool's configuration hash key-for-key", () => {
    expect(ambientPoolConfiguration()).toEqual(Base.connectionPool().dbConfig.configurationHash);
  });

  // A `:memory:` database belongs to its own connection: on the sqlite3_mem lane
  // a second handle is a second, empty database by design.
  test.skipIf(inMemoryDb())("newRawTestAdapter opens the database Base rides", async () => {
    const adapter = newRawTestAdapter();
    try {
      expect(await adapter.tableExists("posts")).toBe(true);
    } finally {
      await adapter.disconnectBang();
    }
  });

  test.skipIf(!currentAdapter("SQLite3Adapter"))(
    "newRawTestAdapter opens sqlite with the ambient strict setting",
    async () => {
      const adapter = newRawTestAdapter() as unknown as { strictStrings: boolean } & {
        disconnectBang(): Promise<void>;
      };
      try {
        expect(adapter.strictStrings).toBe(Boolean(ambientPoolConfiguration().strict));
      } finally {
        await adapter.disconnectBang();
      }
    },
  );
});
