import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertChanges } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.execute("DROP TABLE IF EXISTS after_rename CASCADE");
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.execute("DROP TABLE IF EXISTS after_rename CASCADE");
    await adapter.disconnectBang();
  });

  describe("PostgresqlRenameTableTest", () => {
    it("rename table with index", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.execute("CREATE INDEX idx_before_name ON before_rename (name)");
      await adapter.renameTable("before_rename", "after_rename");
      const indexes = await adapter.indexes("after_rename");
      expect(indexes.some((i) => i.columns.includes("name"))).toBe(true);
    });

    it("rename table with sequence", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.renameTable("before_rename", "after_rename");
      expect(await adapter.primaryKey("after_rename")).toBe("id");
      const id = await adapter.insert(`INSERT INTO after_rename (name) VALUES ('test')`);
      expect(id).toBeGreaterThan(0);
    });

    it("rename table preserves data", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('alice')`);
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('bob')`);
      await adapter.renameTable("before_rename", "after_rename");
      const rows = await adapter.execute("SELECT name FROM after_rename ORDER BY name");
      expect(rows.map((r) => r.name)).toEqual(["alice", "bob"]);
    });

    it("renaming a table also renames the primary key sequence", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.renameTable("before_rename", "after_rename");
      const [pk, seq] = (await adapter.pkAndSequenceFor("after_rename"))!;
      expect(seq!.identifier).toBe(`after_rename_${pk}_seq`);
    });

    it("renaming a table also renames the primary key index", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await assertRenamesIndex("before_rename_pkey", "after_rename_pkey", async () => {
        await adapter.renameTable("before_rename", "after_rename");
      });
    });

    it("renaming a table with uuid primary key and uuid_generate_v4() default also renames the primary key index", async (ctx) => {
      try {
        await adapter.execute(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      } catch {
        ctx.skip();
        return;
      }
      await adapter.execute(
        `CREATE TABLE before_rename (id uuid DEFAULT uuid_generate_v4() PRIMARY KEY)`,
      );
      await assertRenamesIndex("before_rename_pkey", "after_rename_pkey", async () => {
        await adapter.renameTable("before_rename", "after_rename");
      });
    });

    it("renaming a table with uuid primary key and gen_random_uuid() default also renames the primary key index", async () => {
      await adapter.execute(
        `CREATE TABLE before_rename (id uuid DEFAULT gen_random_uuid() PRIMARY KEY)`,
      );
      await assertRenamesIndex("before_rename_pkey", "after_rename_pkey", async () => {
        await adapter.renameTable("before_rename", "after_rename");
      });
    });

    async function assertRenamesIndex(
      from: string,
      to: string,
      block: () => Promise<void>,
    ): Promise<void> {
      await assertChanges(
        () => numIndicesNamed(from),
        null,
        { from: 1, to: 0 },
        async () => {
          await assertChanges(() => numIndicesNamed(to), null, { from: 0, to: 1 }, block);
        },
      );
    }

    async function numIndicesNamed(name: string): Promise<number> {
      return (
        await adapter.execute(`
          SELECT 1 FROM "pg_index"
            JOIN "pg_class" ON "pg_index"."indexrelid" = "pg_class"."oid"
            WHERE "pg_class"."relname" = '${name}'
        `)
      ).length;
    }
  });
});
