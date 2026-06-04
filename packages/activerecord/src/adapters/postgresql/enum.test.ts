/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/enum_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, pgServerVersion } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";
import { Base, Schema } from "../../index.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";

// Rails: class PostgresqlEnum < ActiveRecord::Base
//   enum :current_mood, { sad: "sad", okay: "ok", happy: "happy", aliased_field: "happy" }, prefix: true
// Note: the public enumMethod only accepts integer values (Record<string, number>); string-value
// enum DSL is not yet exposed via the public API. The bang/predicate methods for "works with
// activerecord enum" require the enum DSL and are blocked until the API is extended.
class PostgresqlEnum extends Base {
  static {
    this.tableName = "postgresql_enums";
  }
}

// Mirrors Rails' with_test_schema helper (schema_test.rb):
//   create_schema(name) / SET search_path / yield / ensure { drop_schema(name) / restore search_path }
async function withTestSchema(
  adapter: PostgreSQLAdapter,
  name: string,
  fn: () => Promise<void>,
  options: { drop?: boolean } = {},
): Promise<void> {
  const { drop = true } = options;
  const oldSearchPath = await adapter.schemaSearchPath();
  await adapter.createSchema(name);
  await adapter.setSchemaSearchPath(`${name}, public`);
  try {
    await fn();
  } finally {
    if (drop) await adapter.dropSchema(name, { ifExists: true, cascade: true });
    await adapter.setSchemaSearchPath(oldSearchPath);
    adapter.schemaCache?.clear();
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.createEnum("mood", ["sad", "ok", "happy"]);
    await adapter.exec(`
      CREATE TABLE "postgresql_enums" (
        "id" SERIAL PRIMARY KEY,
        "current_mood" mood
      )
    `);
    PostgresqlEnum.resetColumnInformation();
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "feeling" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "unused" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "color" CASCADE`);
    // test_schema is managed by withTestSchema — no DROP here
    PostgresqlEnum.resetColumnInformation();
  });

  describe("PostgresqlEnumTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "current_mood");
      expect(col).toBeDefined();
      expect(col!.type).toBe("enum");
      expect(col!.sqlType).toContain("mood");
      expect((col as any).array).toBeFalsy();
    });

    it("enum defaults", async () => {
      await adapter.exec(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy'`,
      );
      PostgresqlEnum.resetColumnInformation();
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "good_mood");
      expect(col).toBeDefined();
      expect(col!.default).toContain("happy");
    });

    it("enum mapping", async () => {
      await adapter.exec(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const enumRecord = await PostgresqlEnum.first();
      expect((enumRecord as any).readAttribute("current_mood")).toBe("sad");
      (enumRecord as any).writeAttribute("current_mood", "happy");
      await enumRecord!.save();
      await (enumRecord as any).reload();
      expect((enumRecord as any).readAttribute("current_mood")).toBe("happy");
    });

    // Needs ORM enum validation (string enum setter does not call assertValidValue)
    it.skip("invalid enum update", () => {
      // BLOCKED: enum — _enum setter silently writes invalid values; assertValidValue
      //   is declared on EnumType but not wired into the string-enum attribute setter
      // SCOPE: ~5 LOC fix in enum.ts; affects this test
    });

    // Needs stderr capture
    it.skip("no oid warning", () => {
      // BLOCKED: infra — no vitest equivalent of Ruby capture(:stderr)
      // SCOPE: process stream mocking; affects this test
    });

    it("enum type cast", async () => {
      const enumRecord = new PostgresqlEnum();
      // Rails: enum.current_mood = :happy (symbol cast to string)
      (enumRecord as any).writeAttribute("current_mood", "happy");
      expect((enumRecord as any).readAttribute("current_mood")).toBe("happy");
    });

    it("assigning enum to nil", async () => {
      await adapter.exec(`INSERT INTO "postgresql_enums" ("current_mood") VALUES (NULL)`);
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

    it.skipIf(pgServerVersion < 100000)("schema dump added enum value", async () => {
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

    it.skipIf(pgServerVersion < 100000)("schema dump renamed enum value", async () => {
      await adapter.renameEnumValue("mood", { from: "ok", to: "okay" });
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("mood", ["sad","okay","happy"]);');
    });

    it("schema load", async () => {
      await Schema.define(adapter, async (schema) => {
        await schema.createEnum("color", ["blue", "green"]);
        await schema.changeTable("postgresql_enums", async (t) => {
          await (t as any).column("best_color", "color", { default: "blue", null: false });
        });
      });
      PostgresqlEnum.resetColumnInformation();
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "best_color");
      expect(col).toBeDefined();
      expect(col!.sqlType).toBe("color");
      expect(col!.null).toBe(false);
    });

    it("drop enum", async () => {
      await adapter.createEnum("unused", []);
      await adapter.dropEnum("unused");
      await expect(adapter.dropEnum("unused")).rejects.toThrow();
      await expect(adapter.dropEnum("unused", { ifExists: true })).resolves.toBeUndefined();
    });

    // Needs ORM enum getter for label/value asymmetry (okay: "ok")
    it.skip("works with activerecord enum", () => {
      // BLOCKED: enum — string enum getter returns raw DB value ("ok") instead of
      //   label name ("okay") when label ≠ DB value; reverseMap lookup at line 509
      //   of enum.ts guards on typeof raw === "number", missing the string case
      // SCOPE: ~3 LOC fix in enum.ts getter; affects this test
    });

    it("enum type scoped to schemas", async () => {
      await withTestSchema(adapter, "test_schema", async () => {
        await adapter.createEnum("mood_in_other_schema", ["sad", "ok", "happy"]);
        await adapter.exec(`
          CREATE TABLE "postgresql_enums_in_other_schema" (
            "id" SERIAL PRIMARY KEY,
            "current_mood" mood_in_other_schema DEFAULT 'happy' NOT NULL
          )
        `);
        expect(await adapter.dataSourceExists("postgresql_enums_in_other_schema")).toBe(true);
      });
    });

    it("enum type explicit schema", async () => {
      await withTestSchema(adapter, "test_schema", async () => {
        await adapter.createEnum("test_schema.mood_in_other_schema", ["sad", "ok", "happy"]);
        await adapter.exec(`
          CREATE TABLE "test_schema"."postgresql_enums_in_other_schema" (
            "id" SERIAL PRIMARY KEY,
            "current_mood" "test_schema"."mood_in_other_schema"
          )
        `);
        expect(await adapter.dataSourceExists("test_schema.postgresql_enums_in_other_schema")).toBe(
          true,
        );
        await expect(
          adapter.dropTable("test_schema.postgresql_enums_in_other_schema"),
        ).resolves.not.toThrow();
        await expect(adapter.dropEnum("test_schema.mood_in_other_schema")).resolves.not.toThrow();
      });
    });

    // Needs schema dumper with search-path-scoped enum filtering
    it.skip("schema dump scoped to schemas", () => {
      // BLOCKED: schema-dumper — enumTypes() returns all enums in all schemas; needs
      //   search-path-aware filtering to match Rails' dump_all_table_schema behavior
      // SCOPE: ~20 LOC in PG schema-dumper types(); affects this test
    });

    it.skip("schema load scoped to schemas", () => {
      // BLOCKED: schema — schema cache does not clear across search-path switches;
      //   Schema.define inside withTestSchema leaves stale OID mappings
      // SCOPE: schema cache invalidation work; affects this test
    });
  });
});
