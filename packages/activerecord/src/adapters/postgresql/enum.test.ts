/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/enum_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.createEnum("mood", ["sad", "ok", "happy"]);
    await adapter.exec(`
      CREATE TABLE "postgresql_enums" (
        "id" SERIAL PRIMARY KEY,
        "current_mood" mood
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "feeling" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "unused" CASCADE`);
    await adapter.exec(`DROP SCHEMA IF EXISTS "test_schema" CASCADE`);
    await adapter.close();
  });

  describe("PostgresqlEnumTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "current_mood");
      expect(col).toBeDefined();
      expect(col!.type).toContain("mood");
    });

    it("enum default", async () => {
      await adapter.exec(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy'`,
      );
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "good_mood");
      expect(col).toBeDefined();
      expect(col!.default).toContain("happy");
    });

    it("enum type cast", async () => {
      const rows = await adapter.execute("SELECT 'happy'::mood AS val");
      expect(rows[0].val).toBe("happy");
    });

    it("enum mapping", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      const rows = await adapter.execute(
        `SELECT "current_mood" FROM "postgresql_enums" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].current_mood).toBe("sad");

      await adapter.executeMutation(
        `UPDATE "postgresql_enums" SET "current_mood" = 'happy' WHERE "id" = ?`,
        [id],
      );
      const updated = await adapter.execute(
        `SELECT "current_mood" FROM "postgresql_enums" WHERE "id" = ?`,
        [id],
      );
      expect(updated[0].current_mood).toBe("happy");
    });

    it("invalid enum value", async () => {
      await expect(
        adapter.executeMutation(`INSERT INTO "postgresql_enums" ("current_mood") VALUES ('angry')`),
      ).rejects.toThrow();
    });

    it("create enum", async () => {
      const values = await adapter.enumValues("mood");
      expect(values).toEqual(["sad", "ok", "happy"]);
    });

    it("drop enum", async () => {
      await adapter.createEnum("unused", ["dummy"]);
      await adapter.dropEnum("unused");
      await expect(adapter.dropEnum("unused")).rejects.toThrow();
      await expect(adapter.dropEnum("unused", { ifExists: true })).resolves.toBeUndefined();
    });

    it("rename enum", async () => {
      await adapter.renameEnum("mood", "feeling");
      const values = await adapter.enumValues("feeling");
      expect(values).toEqual(["sad", "ok", "happy"]);

      // Also verify renameEnumValue
      await adapter.renameEnumValue("feeling", { from: "ok", to: "okay" });
      const updated = await adapter.enumValues("feeling");
      expect(updated).toEqual(["sad", "okay", "happy"]);

      // Clean up — rename back so afterEach can drop "mood"
      await adapter.renameEnumValue("feeling", { from: "okay", to: "ok" });
      await adapter.renameEnum("feeling", "mood");
    });

    it("add enum value", async () => {
      await adapter.addEnumValue("mood", "angry");
      const values = await adapter.enumValues("mood");
      expect(values).toContain("angry");
      expect(values[values.length - 1]).toBe("angry");
    });

    it("add enum value before", async () => {
      await adapter.addEnumValue("mood", "angry", { before: "ok" });
      const values = await adapter.enumValues("mood");
      const angryIdx = values.indexOf("angry");
      const okIdx = values.indexOf("ok");
      expect(angryIdx).toBeLessThan(okIdx);
    });

    it("add enum value after", async () => {
      await adapter.addEnumValue("mood", "nervous", { after: "ok" });
      const values = await adapter.enumValues("mood");
      const okIdx = values.indexOf("ok");
      const nervousIdx = values.indexOf("nervous");
      expect(nervousIdx).toBe(okIdx + 1);
    });

    it("enum schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain("postgresql_enums");
      expect(output).toContain('t.column("current_mood", "mood"');
    });

    it("enum where", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('happy')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      const rows = await adapter.execute(
        `SELECT * FROM "postgresql_enums" WHERE "current_mood" = 'sad'`,
      );
      expect(rows).toHaveLength(2);
    });

    it("enum order", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('happy')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('ok')`,
      );
      const rows = await adapter.execute(
        `SELECT "current_mood" FROM "postgresql_enums" ORDER BY "current_mood" ASC`,
      );
      // Enum ordering follows creation order: sad, ok, happy
      expect(rows.map((r) => r.current_mood)).toEqual(["sad", "ok", "happy"]);
    });

    // Needs ORM layer (pluck)
    it.skip("enum pluck", async () => {});

    it("enum distinct", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('happy')`,
      );
      const rows = await adapter.execute(
        `SELECT DISTINCT "current_mood" FROM "postgresql_enums" ORDER BY "current_mood"`,
      );
      expect(rows).toHaveLength(2);
    });

    it("enum group", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('happy')`,
      );
      const rows = await adapter.execute(
        `SELECT "current_mood", COUNT(*) AS cnt FROM "postgresql_enums" GROUP BY "current_mood" ORDER BY "current_mood"`,
      );
      expect(rows).toHaveLength(2);
      const sadRow = rows.find((r) => r.current_mood === "sad");
      expect(Number(sadRow!.cnt)).toBe(2);
    });

    // Needs migration framework
    it.skip("enum migration", async () => {});

    it("enum array", async () => {
      await adapter.exec(`ALTER TABLE "postgresql_enums" ADD COLUMN "past_moods" mood[]`);
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood", "past_moods") VALUES ('happy', '{sad,ok}')`,
      );
      const rows = await adapter.execute(`SELECT "past_moods" FROM "postgresql_enums"`);
      // pg driver may return enum arrays as raw strings since it doesn't know the enum OID
      const pastMoods = rows[0].past_moods;
      const values =
        typeof pastMoods === "string"
          ? pastMoods.replace(/[{}]/g, "").split(",")
          : (pastMoods as string[]);
      expect(values).toEqual(["sad", "ok"]);
    });

    it("enum defaults", async () => {
      await adapter.exec(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy'`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES ('sad')`,
      );
      const rows = await adapter.execute(`SELECT "good_mood" FROM "postgresql_enums"`);
      expect(rows[0].good_mood).toBe("happy");
    });

    // Needs ORM layer (ActiveRecord enum DSL)
    it.skip("invalid enum update", () => {});

    // Needs ORM layer
    it.skip("no oid warning", () => {});

    it("assigning enum to nil", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES (NULL)`,
      );
      const rows = await adapter.execute(`SELECT "current_mood" FROM "postgresql_enums"`);
      expect(rows[0].current_mood).toBeNull();
    });

    // Needs schema dumper with enum type output
    it.skip("schema dump renamed enum", () => {});
    it.skip("schema dump renamed enum with to option", () => {});
    it.skip("schema dump added enum value", () => {});
    it.skip("schema dump renamed enum value", () => {});

    // Needs ORM layer (ActiveRecord enum DSL)
    it.skip("works with activerecord enum", () => {});

    it("enum type scoped to schemas", async () => {
      await adapter.beginTransaction();
      try {
        await adapter.createSchema("test_schema");
        await adapter.exec(`SET LOCAL search_path TO test_schema, public`);
        await adapter.createEnum("mood_in_other_schema", ["sad", "ok", "happy"]);
        await adapter.exec(`
          CREATE TABLE "postgresql_enums_in_other_schema" (
            "id" SERIAL PRIMARY KEY,
            "current_mood" mood_in_other_schema DEFAULT 'happy' NOT NULL
          )
        `);
        const exists = await adapter.dataSourceExists("postgresql_enums_in_other_schema");
        expect(exists).toBe(true);
        await adapter.commit();
      } catch (error) {
        await adapter.rollback();
        throw error;
      }
    });

    it("enum type explicit schema", async () => {
      await adapter.createSchema("test_schema");
      await adapter.createEnum("test_schema.mood_in_other_schema", ["sad", "ok", "happy"]);
      await adapter.exec(`
        CREATE TABLE "test_schema"."postgresql_enums_in_other_schema" (
          "id" SERIAL PRIMARY KEY,
          "current_mood" "test_schema"."mood_in_other_schema"
        )
      `);
      const exists = await adapter.dataSourceExists("test_schema.postgresql_enums_in_other_schema");
      expect(exists).toBe(true);
    });

    // Needs schema dumper with schema-scoped enum support
    it.skip("schema dump scoped to schemas", () => {});
    it.skip("schema load scoped to schemas", () => {});
  });
});
