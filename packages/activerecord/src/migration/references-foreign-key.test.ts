import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { describeIfSupports, itIfSupports } from "../support/supports.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

async function withTestingTables(conn: AbstractAdapter, body: () => Promise<void>): Promise<void> {
  await conn.createTable("testing_parents", { force: true });
  try {
    await body();
  } finally {
    await conn.dropTable("testings", "testing_parents", { ifExists: true });
  }
}

describeIfSupports("foreign_keys", "Migration", () => {
  describe("ReferencesForeignKeyTest", () => {
    fixtures([], { useTransactionalTests: false });

    it("foreign keys cannot be added to polymorphic relations when creating the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          expect(() =>
            t.references("testing_parent", { polymorphic: true, foreignKey: true }),
          ).toThrow(ArgumentError);
        });
      });
    });

    it("foreign keys can be created while changing the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings");
        await conn.changeTable("testings", async (t) => {
          await t.references("testing_parent", { foreignKey: true });
        });

        const fk = (await conn.foreignKeys("testings"))[0];
        expect(fk.fromTable).toBe("testings");
        expect(fk.toTable).toBe("testing_parents");
      });
    });

    it("foreign keys are not added by default when changing the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings");
        await conn.changeTable("testings", async (t) => {
          await t.references("testing_parent");
        });

        expect(await conn.foreignKeys("testings")).toEqual([]);
      });
    });

    it("foreign keys accept options when changing the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.changeTable("testing_parents", async (t) => {
          await t.references("other", { index: { unique: true } });
        });
        await conn.createTable("testings");
        await conn.changeTable("testings", async (t) => {
          await t.references("testing_parent", { foreignKey: { primaryKey: "other_id" } });
        });

        const fk = (await conn.foreignKeys("testings")).find(
          (k) => k.toTable === "testing_parents",
        );
        expect(fk!.primaryKey).toBe("other_id");
      });
    });

    it("foreign keys cannot be added to polymorphic relations when changing the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings");
        await conn.changeTable("testings", async (t) => {
          await expect(
            t.references("testing_parent", { polymorphic: true, foreignKey: true }),
          ).rejects.toThrow(ArgumentError);
        });
      });
    });

    it("foreign key column can be removed", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("testing_parent", { index: true, foreignKey: true });
        });

        const before = (await conn.foreignKeys("testings")).length;
        await conn.removeReference("testings", "testing_parent", { foreignKey: true });
        expect((await conn.foreignKeys("testings")).length).toBe(before - 1);
      });
    });

    it("multiple foreign keys can be added to the same table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("parent1", { foreignKey: { toTable: "testing_parents" } });
          t.references("parent2", { foreignKey: { toTable: "testing_parents" } });
          t.references("self_join", { foreignKey: { toTable: "testings" } });
        });

        const fks = (await conn.foreignKeys("testings")).sort((a, b) =>
          String(a.column).localeCompare(String(b.column)),
        );

        expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column])).toEqual([
          ["testings", "testing_parents", "parent1_id"],
          ["testings", "testing_parents", "parent2_id"],
          ["testings", "testings", "self_join_id"],
        ]);
      });
    });

    it("multiple foreign keys can be removed to the selected one", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("parent1", { foreignKey: { toTable: "testing_parents" } });
          t.references("parent2", { foreignKey: { toTable: "testing_parents" } });
        });

        const before = (await conn.foreignKeys("testings")).length;
        await conn.removeReference("testings", "parent1", {
          foreignKey: { toTable: "testing_parents" },
        });
        expect((await conn.foreignKeys("testings")).length).toBe(before - 1);

        const fks = (await conn.foreignKeys("testings")).sort((a, b) =>
          String(a.column).localeCompare(String(b.column)),
        );

        expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column])).toEqual([
          ["testings", "testing_parents", "parent2_id"],
        ]);
      });
    });
  });

  describe("ReferencesForeignKeyInCreateTest", () => {
    fixtures([], { useTransactionalTests: false });

    it("foreign keys can be created with the table", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("testing_parent", { foreignKey: true });
        });

        const fk = (await conn.foreignKeys("testings"))[0];
        expect(fk.fromTable).toBe("testings");
        expect(fk.toTable).toBe("testing_parents");
      });
    });

    it("no foreign key is created by default", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("testing_parent");
        });

        expect(await conn.foreignKeys("testings")).toEqual([]);
      });
    });

    it("foreign keys can be created in one query when index is not added", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await assertQueriesCount(1, false, async () => {
          await conn.createTable("testings", (t) => {
            t.references("testing_parent", { foreignKey: true, index: false });
          });
        });
      });
    });

    it("options hash can be passed", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.changeTable("testing_parents", async (t) => {
          await t.references("other", { index: { unique: true } });
        });
        await conn.createTable("testings", (t) => {
          t.references("testing_parent", { foreignKey: { primaryKey: "other_id" } });
        });

        const fk = (await conn.foreignKeys("testings")).find(
          (k) => k.toTable === "testing_parents",
        );
        expect(fk!.primaryKey).toBe("other_id");
      });
    });

    it("to_table option can be passed", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("parent", { foreignKey: { toTable: "testing_parents" } });
        });

        const fks = await conn.foreignKeys("testings");
        expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column])).toEqual([
          ["testings", "testing_parents", "parent_id"],
        ]);
      });
    });

    itIfSupports("deferrable_constraints", "deferrable: false option can be passed", async () => {
      const conn = await ambientConnection();
      await withTestingTables(conn, async () => {
        await conn.createTable("testings", (t) => {
          t.references("testing_parent", { foreignKey: { deferrable: false } });
        });

        const fks = await conn.foreignKeys("testings");
        expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column, fk.deferrable])).toEqual([
          ["testings", "testing_parents", "testing_parent_id", false],
        ]);
      });
    });

    itIfSupports(
      "deferrable_constraints",
      "deferrable: :immediate option can be passed",
      async () => {
        const conn = await ambientConnection();
        await withTestingTables(conn, async () => {
          await conn.createTable("testings", (t) => {
            t.references("testing_parent", { foreignKey: { deferrable: "immediate" } });
          });

          const fks = await conn.foreignKeys("testings");
          expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column, fk.deferrable])).toEqual([
            ["testings", "testing_parents", "testing_parent_id", "immediate"],
          ]);
        });
      },
    );

    itIfSupports(
      "deferrable_constraints",
      "deferrable: :deferred option can be passed",
      async () => {
        const conn = await ambientConnection();
        await withTestingTables(conn, async () => {
          await conn.createTable("testings", (t) => {
            t.references("testing_parent", { foreignKey: { deferrable: "deferred" } });
          });

          const fks = await conn.foreignKeys("testings");
          expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.column, fk.deferrable])).toEqual([
            ["testings", "testing_parents", "testing_parent_id", "deferred"],
          ]);
        });
      },
    );

    itIfSupports(
      "deferrable_constraints",
      "deferrable and on_(delete|update) option can be passed",
      async () => {
        const conn = await ambientConnection();
        await withTestingTables(conn, async () => {
          await conn.createTable("testings", (t) => {
            t.references("testing_parent", {
              foreignKey: { onUpdate: "cascade", onDelete: "cascade", deferrable: "immediate" },
            });
          });

          const fks = await conn.foreignKeys("testings");
          expect(
            fks.map((fk) => [
              fk.fromTable,
              fk.toTable,
              fk.column,
              fk.onDelete,
              fk.onUpdate,
              fk.deferrable,
            ]),
          ).toEqual([
            ["testings", "testing_parents", "testing_parent_id", "cascade", "cascade", "immediate"],
          ]);
        });
      },
    );
  });
});
