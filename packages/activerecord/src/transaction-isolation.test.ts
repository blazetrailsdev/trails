import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Base, TransactionIsolationError } from "./index.js";
import { adapterType, ambientPoolConfiguration } from "./test-adapter.js";
import { adapterSupports } from "./test-helpers/supports.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { transactionIsolationLevels } from "./connection-adapters/abstract/database-statements.js";

// Runs when the adapter does NOT support transaction isolation (or is SQLite3).
// Rails: TransactionIsolationUnsupportedTest
describe("TransactionIsolationUnsupportedTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it.skipIf(adapterType !== "sqlite")("setting the isolation level raises an error", async () => {
    class Tag extends Base {
      static {
        this._tableName = "tags";
      }
    }
    await expect(
      Tag.transaction(
        async () => {
          await Tag.count();
        },
        { isolation: "serializable" },
      ),
    ).rejects.toThrow(TransactionIsolationError);
  });
});

// Rails: TransactionIsolationTest, guarded by `supports_transaction_isolation? &&
// !current_adapter?(:SQLite3Adapter)` (transaction_isolation_test.rb:20-21), which
// the test:compare Ruby extractor renders as adapters=[mysql,postgresql]
// features=[transaction_isolation]. Each subtest carries the compound skipIf below
// to mirror both dimensions of Rails' gate (non-SQLite adapter set + the feature).
//
// Tag and Tag2 each establish their own connection to the active lane's primary
// database (via ambientPoolConfiguration) so their transactions run on independent
// physical connections — matching Rails' `Tag.establish_connection :arunit` /
// `Tag2.establish_connection :arunit` pattern, generically across pg + mysql.
describe("TransactionIsolationTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class Tag extends Base {
    static {
      this._tableName = "tags";
    }
  }

  class Tag2 extends Base {
    static {
      this._tableName = "tags";
    }
  }

  beforeAll(async () => {
    if (adapterType === "sqlite" || !adapterSupports("transaction_isolation")) return;
    await Tag.establishConnection(ambientPoolConfiguration());
    await Tag2.establishConnection(ambientPoolConfiguration());
  });

  afterAll(async () => {
    if (adapterType === "sqlite" || !adapterSupports("transaction_isolation")) return;
    try {
      await Tag.destroyAll();
    } finally {
      Tag.removeConnection();
      Tag2.removeConnection();
    }
  });

  beforeEach(async () => {
    if (adapterType === "sqlite" || !adapterSupports("transaction_isolation")) return;
    await Tag.destroyAll();
  });

  // PG aliases READ UNCOMMITTED to READ COMMITTED — Rails notes this test only
  // asserts that the second connection's auto-committed insert becomes visible.
  // Rails additionally defines this test only when
  // `transaction_isolation_levels.include?(:read_uncommitted)`
  // (transaction_isolation_test.rb:41) — mirrored via the map term below.
  it.skipIf(
    adapterType === "sqlite" ||
      !adapterSupports("transaction_isolation") ||
      !("read_uncommitted" in transactionIsolationLevels()),
  )("read uncommitted", async () => {
    await Tag.transaction(
      async () => {
        expect(await Tag.count()).toBe(0);
        await Tag2.create({});
        expect(await Tag.count()).toBe(1);
      },
      { isolation: "read_uncommitted" },
    );
  });

  // A dirty read must not happen: Tag2's uncommitted insert is invisible to Tag.
  it.skipIf(adapterType === "sqlite" || !adapterSupports("transaction_isolation"))(
    "read committed",
    async () => {
      await Tag.transaction(
        async () => {
          expect(await Tag.count()).toBe(0);
          await Tag2.transaction(async () => {
            await Tag2.create({});
            expect(await Tag.count()).toBe(0);
          });
        },
        { isolation: "read_committed" },
      );
      expect(await Tag.count()).toBe(1);
    },
  );

  // A non-repeatable read must not happen: a committed update from the second
  // connection is invisible to the first connection's repeatable-read snapshot.
  // Rails additionally defines this test only when
  // `transaction_isolation_levels.include?(:repeatable_read)`
  // (transaction_isolation_test.rb:66) — mirrored via the map term below.
  it.skipIf(
    adapterType === "sqlite" ||
      !adapterSupports("transaction_isolation") ||
      !("repeatable_read" in transactionIsolationLevels()),
  )("repeatable read", async () => {
    const tag = await Tag.create({ name: "jon" });

    await Tag.transaction(
      async () => {
        await tag.reload();
        const t2 = await Tag2.find(tag.id);
        await t2.update({ name: "emily" });

        await tag.reload();
        expect(tag.name).toBe("jon");
      },
      { isolation: "repeatable_read" },
    );

    await tag.reload();
    expect(tag.name).toBe("emily");
  });

  // No-error smoke test for serializable — DBs enforce serializability differently.
  it.skipIf(adapterType === "sqlite" || !adapterSupports("transaction_isolation"))(
    "serializable",
    async () => {
      await Tag.transaction(
        async () => {
          await Tag.create({});
        },
        { isolation: "serializable" },
      );
    },
  );

  it.skipIf(adapterType === "sqlite" || !adapterSupports("transaction_isolation"))(
    "setting isolation when joining a transaction raises an error",
    async () => {
      await Tag.transaction(async () => {
        await expect(
          Tag.transaction(async () => {}, { isolation: "serializable" }),
        ).rejects.toThrow(TransactionIsolationError);
      });
    },
  );

  it.skipIf(adapterType === "sqlite" || !adapterSupports("transaction_isolation"))(
    "setting isolation when starting a nested transaction raises error",
    async () => {
      await Tag.transaction(async () => {
        await expect(
          Tag.transaction(async () => {}, { requiresNew: true, isolation: "serializable" }),
        ).rejects.toThrow(TransactionIsolationError);
      });
    },
  );
});
