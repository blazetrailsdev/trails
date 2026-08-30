import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Base, TransactionIsolationError } from "./index.js";
import { adapterType, ambientPoolConfiguration } from "./test-adapter.js";
import { adapterSupports } from "./support/supports.js";
import { fixtures } from "./test-fixtures.js";
import { transactionIsolationLevels } from "./connection-adapters/abstract/database-statements.js";

describe("TransactionIsolationUnsupportedTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it.skipIf(adapterType !== "sqlite")("setting the isolation level raises an error", async () => {
    class Tag extends Base {
      declare name: unknown;
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

describe("TransactionIsolationTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class Tag extends Base {
    declare name: string;
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
