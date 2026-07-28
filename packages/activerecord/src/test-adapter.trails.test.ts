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
import { inMemoryDb } from "./support/adapter-helper.js";

describe("ambientPoolConfiguration", () => {
  test("matches the primary pool's configuration hash key-for-key", () => {
    expect(ambientPoolConfiguration()).toEqual(Base.connectionPool().dbConfig.configurationHash);
  });

  // A `:memory:` database belongs to its own connection, so on the sqlite3_mem
  // lane a second handle is a second, empty database by design.
  test.skipIf(inMemoryDb())("newRawTestAdapter opens the database Base rides", async () => {
    const adapter = newRawTestAdapter();
    try {
      const ambient = ambientPoolConfiguration();
      // The canonical schema is laid on the primary database at worker boot, so
      // seeing it here means this handle opened that same database.
      expect(await adapter.tableExists("posts")).toBe(true);
      if (ambient.adapter === "sqlite3") {
        expect((adapter as unknown as { strictStrings: boolean }).strictStrings).toBe(
          ambient.strict,
        );
      }
    } finally {
      await adapter.disconnectBang();
    }
  });
});
