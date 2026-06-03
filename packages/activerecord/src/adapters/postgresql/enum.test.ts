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
    await adapter.exec(`DROP SCHEMA IF EXISTS "enum_test_schema" CASCADE`);
    await adapter.close();
  });

  describe("PostgresqlEnumTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "current_mood");
      expect(col).toBeDefined();
      expect(col!.type).toBe("enum");
      expect(col!.sqlType).toContain("mood");
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

    // Needs ORM layer (ActiveRecord enum DSL)
    it.skip("invalid enum update", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in enum
      // ROOT-CAUSE: connection-adapters/postgresql/enum.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in connection-adapters/postgresql/enum.ts; affects ~10–47 tests in enum.test.ts
    });

    // Needs ORM layer
    it.skip("no oid warning", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in enum
      // ROOT-CAUSE: connection-adapters/postgresql/enum.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in connection-adapters/postgresql/enum.ts; affects ~10–47 tests in enum.test.ts
    });

    it("enum type cast", async () => {
      const rows = await adapter.execute("SELECT 'happy'::mood AS val");
      expect(rows[0].val).toBe("happy");
    });

    it("assigning enum to nil", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_enums" ("current_mood") VALUES (NULL)`,
      );
      const rows = await adapter.execute(`SELECT "current_mood" FROM "postgresql_enums"`);
      expect(rows[0].current_mood).toBeNull();
    });

    it("schema dump", async () => {
      await adapter.exec(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy' NOT NULL`,
      );
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain(
        "Note that some types may not work with other database engines. Be careful if changing database.",
      );
      expect(output).toContain('await ctx.createEnum("mood", ["sad","ok","happy"]);');
      expect(output).toContain('t.enum("current_mood", { enum_type: "mood" })');
      expect(output).toContain(
        't.enum("good_mood", { default: "happy", null: false, enum_type: "mood" })',
      );
    });

    it("schema dump renamed enum", async () => {
      await adapter.renameEnum("mood", "feeling");
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("feeling", ["sad","ok","happy"]);');
      expect(output).toContain('enum_type: "feeling"');
    });

    it("schema dump renamed enum with to option", async () => {
      await adapter.renameEnum("mood", { to: "feeling" });
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("feeling", ["sad","ok","happy"]);');
      expect(output).toContain('enum_type: "feeling"');
    });

    it("schema dump added enum value", async () => {
      await adapter.addEnumValue("mood", "angry", { before: "ok" });
      await adapter.addEnumValue("mood", "nervous", { after: "ok" });
      await adapter.addEnumValue("mood", "glad");
      await adapter.addEnumValue("mood", "glad", { ifNotExists: true });
      await adapter.addEnumValue("mood", "curious", { ifNotExists: true });
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain(
        'await ctx.createEnum("mood", ["sad","angry","ok","nervous","happy","glad","curious"]);',
      );
    });

    it("schema dump renamed enum value", async () => {
      await adapter.renameEnumValue("mood", { from: "ok", to: "okay" });
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("mood", ["sad","okay","happy"]);');
    });

    // Needs migration framework (ActiveRecord::Schema.define)
    it.skip("schema load", () => {
      // BLOCKED: schema — migration/schema-define framework not wired at adapter layer
      // ROOT-CAUSE: ActiveRecord::Schema.define requires full migration framework
      // SCOPE: migration framework work; affects ~1 test
    });

    it("drop enum", async () => {
      await adapter.createEnum("unused", ["dummy"]);
      await adapter.dropEnum("unused");
      await expect(adapter.dropEnum("unused")).rejects.toThrow();
      await expect(adapter.dropEnum("unused", { ifExists: true })).resolves.toBeUndefined();
    });

    // Needs ORM layer (ActiveRecord enum DSL)
    it.skip("works with activerecord enum", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in enum
      // ROOT-CAUSE: connection-adapters/postgresql/enum.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in connection-adapters/postgresql/enum.ts; affects ~10–47 tests in enum.test.ts
    });

    it("enum type scoped to schemas", async () => {
      await adapter.beginTransaction();
      try {
        await adapter.createSchema("enum_test_schema");
        await adapter.exec(`SET LOCAL search_path TO enum_test_schema, public`);
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
      await adapter.createSchema("enum_test_schema");
      await adapter.createEnum("enum_test_schema.mood_in_other_schema", ["sad", "ok", "happy"]);
      await adapter.exec(`
        CREATE TABLE "enum_test_schema"."postgresql_enums_in_other_schema" (
          "id" SERIAL PRIMARY KEY,
          "current_mood" "enum_test_schema"."mood_in_other_schema"
        )
      `);
      const exists = await adapter.dataSourceExists(
        "enum_test_schema.postgresql_enums_in_other_schema",
      );
      expect(exists).toBe(true);
      await expect(
        adapter.dropTable("enum_test_schema.postgresql_enums_in_other_schema"),
      ).resolves.not.toThrow();
      await expect(
        adapter.dropEnum("enum_test_schema.mood_in_other_schema"),
      ).resolves.not.toThrow();
    });

    // Needs schema dumper with schema-scoped enum support
    it.skip("schema dump scoped to schemas", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in enum
      // ROOT-CAUSE: connection-adapters/postgresql/enum.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in connection-adapters/postgresql/enum.ts; affects ~10–47 tests in enum.test.ts
    });

    it.skip("schema load scoped to schemas", () => {
      // BLOCKED: schema — schema loading / cache invalidation gap
      // ROOT-CAUSE: schema-cache.ts#clear or connection-handler.ts#clearCache not fully wired
      // SCOPE: ~20 LOC fix in schema-cache.ts; affects ~1 test
    });
  });
});
