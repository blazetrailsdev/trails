/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/enum_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, pgServerVersion } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";
import { Base, Schema } from "../../index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { setupFixtures } from "../../test-helpers/fixtures.js";

// Rails: class PostgresqlEnum < ActiveRecord::Base
//   enum :current_mood, { sad: "sad", okay: "ok", happy: "happy", aliased_field: "happy" }, prefix: true
class PostgresqlEnum extends Base {
  static {
    this.tableName = "postgresql_enums";
    // Declare the PK for strict writeFromUser (raw-created table, not warmed).
    this.attribute("id", "integer");
    this.enum(
      "current_mood",
      { sad: "sad", okay: "ok", happy: "happy", aliased_field: "happy" },
      { prefix: true },
    );
  }
}

// Mirrors Rails' private with_test_schema helper in enum_test.rb:
//   create_schema(name) / SET search_path / yield / ensure { drop_schema(name) / restore search_path }
// Only used for tests that scope enums/tables to a named schema.
async function withTestSchema(
  adapter: PostgreSQLAdapter,
  name: string,
  fn: () => Promise<void>,
  options: { drop?: boolean } = {},
): Promise<void> {
  const { drop = true } = options;
  const oldSearchPath = await adapter.schemaSearchPath();
  await adapter.dropSchema(name, { ifExists: true });
  await adapter.createSchema(name);
  await adapter.setSchemaSearchPath(`${name}, public`);
  try {
    await fn();
  } finally {
    if (drop) await adapter.dropSchema(name, {});
    await adapter.setSchemaSearchPath(oldSearchPath);
    adapter.schemaCache.clear();
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupFixtures();

  let adapter: PostgreSQLAdapter;
  // The scoped tests qualify enum sql_types relative to the live search_path, so
  // a path leaked by a prior test (e.g. one whose `withTestSchema` cleanup raced
  // a timeout) would flip `test_schema.mood_in_test_schema` to the unqualified
  // `mood_in_test_schema`. Mirror the schema_test.rb port (schema.test.ts): capture
  // the default once and restore it (plus clear the schema cache) after every test,
  // recovering the `ensure` of Rails' `with_schema_search_path` at suite level.
  let defaultSearchPath: string;
  beforeAll(async () => {
    defaultSearchPath = await (Base.connection as PostgreSQLAdapter).schemaSearchPath();
  });
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
    // Schema-scoped tables created in-test are torn down with their temp schema;
    // these static IF EXISTS drops balance require-table-teardown by name.
    await adapter.exec(
      `DROP TABLE IF EXISTS postgresql_enums_in_other_schema, test_schema, postgresql_enums_in_test_schema CASCADE`,
    );
    await adapter.exec(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "feeling" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "unused" CASCADE`);
    await adapter.exec(`DROP TYPE IF EXISTS "color" CASCADE`);
    // test_schema is managed by withTestSchema — no DROP here
    await adapter.setSchemaSearchPath(defaultSearchPath);
    adapter.schemaCache?.clear();
    PostgresqlEnum.resetColumnInformation();
    vi.restoreAllMocks();
  });

  describe("PostgresqlEnumTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "current_mood");
      expect(col).toBeDefined();
      expect(col!.type).toBe("enum");
      expect(col!.sqlType).toBe("mood");
      expect((col as any).array).toBeFalsy();
      // Rails also asserts: type_for_attribute("current_mood").binary? → false
      // BLOCKED: typeForAttribute is not yet ported to the adapter layer
    });

    it("enum defaults", async () => {
      await adapter.exec(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy'`,
      );
      PostgresqlEnum.resetColumnInformation();
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "good_mood");
      expect(col).toBeDefined();
      expect(col!.default).toBe("happy");
      // Rails also asserts: PostgresqlEnum.column_defaults["good_mood"] and
      // PostgresqlEnum.new.good_mood — both require async schema cache refresh
      // after ALTER TABLE, not yet wired for synchronous ORM column_defaults.
    });

    it("enum mapping", async () => {
      await adapter.exec(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const enumRecord = await PostgresqlEnum.first();
      // prefer enumRecord.current_mood when string-enum getter is ported (enum.ts:509)
      expect((enumRecord as any).readAttribute("current_mood")).toBe("sad");
      // prefer enumRecord.current_mood = "happy" when string-enum setter is ported
      (enumRecord as any).writeAttribute("current_mood", "happy");
      const saved = await enumRecord!.save();
      expect(saved).toBeTruthy();
      await (enumRecord as any).reload();
      expect((enumRecord as any).readAttribute("current_mood")).toBe("happy");
    });

    it("invalid enum update", async () => {
      await adapter.exec(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const enumRecord = await PostgresqlEnum.first();
      expect(() => {
        (enumRecord as any).current_mood = "angry";
      }).toThrow(ArgumentError);
    });

    // Rails: capture(:stderr) { PostgresqlEnum.first }; assert blank.
    // The adapter's unknown-OID warning sink is console.warn, so spying on it
    // is the vitest equivalent of capturing stderr.
    it("no oid warning", async () => {
      await adapter.exec(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await PostgresqlEnum.first();
      expect(warn).not.toHaveBeenCalled();
    });

    it("enum type cast", async () => {
      // Rails: enum.current_mood = :happy (Ruby symbol → string via EnumType cast)
      // TS has no symbol type; write the mapped string value directly.
      // The cast path (symbol → string) is not exercisable in TS.
      const enumRecord = new PostgresqlEnum();
      (enumRecord as any).writeAttribute("current_mood", "happy");
      expect((enumRecord as any).readAttribute("current_mood")).toBe("happy");
    });

    it("assigning enum to nil", async () => {
      const model = new PostgresqlEnum();
      (model as any).writeAttribute("current_mood", null);
      expect((model as any).readAttribute("current_mood")).toBeNull();
      const saved = await model.save();
      expect(saved).toBeTruthy();
      await (model as any).reload();
      expect((model as any).readAttribute("current_mood")).toBeNull();
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
          // ColumnType accepts arbitrary strings (string & {}), so no cast needed
          await t.column("best_color", "color", { default: "blue", null: false });
        });
      });
      PostgresqlEnum.resetColumnInformation();
      const cols = await adapter.columns("postgresql_enums");
      const col = cols.find((c) => c.name === "best_color");
      expect(col).toBeDefined();
      expect(col!.sqlType).toBe("color");
      expect(col!.default).toBe("blue");
      expect(col!.null).toBe(false);
    });

    it("drop enum", async () => {
      await adapter.createEnum("unused", []);
      // Rails order: drop (succeeds) → drop if_exists (succeeds, gone) → bare drop (raises)
      await adapter.dropEnum("unused");
      await expect(adapter.dropEnum("unused", { ifExists: true })).resolves.toBeUndefined();
      await expect(adapter.dropEnum("unused")).rejects.toThrow();
    });

    it("works with activerecord enum", async () => {
      let model = await PostgresqlEnum.create();
      // Rails: model.current_mood_okay! — our _enum bang is in-memory; persist with save().
      (model as any).currentMoodOkayBang();
      await model.save();

      model = (await PostgresqlEnum.find((model as any).id))!;
      expect((model as any).current_mood).toBe("okay");

      (model as any).current_mood = "happy";
      await model.save();

      model = (await PostgresqlEnum.find((model as any).id))!;
      expect((model as any).isCurrentMoodHappy()).toBe(true);
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

    // Rails uses create_schema + ensure { drop_schema } without changing search_path.
    // withTestSchema is intentionally NOT used here — qualified names are used throughout.
    it("enum type explicit schema", async () => {
      await adapter.dropSchema("test_schema", { ifExists: true });
      await adapter.createSchema("test_schema");
      try {
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
      } finally {
        await adapter.dropSchema("test_schema", { ifExists: true });
      }
    });

    // `SchemaDumper.dump` walks every table on the search_path. On the shared
    // worker DB (hundreds of accumulated tables under parallel forks) a full
    // dump legitimately runs past the 5s default and the abort would leak this
    // test's `test_schema` search_path into the next test — so allow more time.
    it("schema dump scoped to schemas", { timeout: 60_000 }, async () => {
      await adapter.dropSchema("other_schema", { ifExists: true });
      await adapter.createSchema("other_schema");
      try {
        await adapter.createEnum("other_schema.mood_in_other_schema", ["sad", "ok", "happy"]);

        await withTestSchema(adapter, "test_schema", async () => {
          await adapter.createEnum("mood_in_test_schema", ["sad", "ok", "happy"]);
          await adapter.exec(`
            CREATE TABLE "postgresql_enums_in_test_schema" (
              "id" SERIAL PRIMARY KEY,
              "current_mood" mood_in_test_schema
            )
          `);

          const output = await SchemaDumper.dump(adapter);

          expect(output).toContain('await ctx.createEnum("public.mood", ["sad","ok","happy"]);');
          expect(output).toContain(
            'await ctx.createEnum("mood_in_test_schema", ["sad","ok","happy"]);',
          );
          expect(output).toContain('t.enum("current_mood", { enum_type: "mood_in_test_schema" })');
          expect(output).not.toContain("other_schema.mood_in_other_schema");
        });
      } finally {
        await adapter.dropSchema("other_schema", { ifExists: true });
      }
    });

    it("schema load scoped to schemas", async () => {
      try {
        await withTestSchema(
          adapter,
          "test_schema",
          async () => {
            await Schema.define(adapter, async (schema) => {
              await schema.createEnum("mood_in_test_schema", ["sad", "ok", "happy"]);
              await schema.createEnum("public.mood", ["sad", "ok", "happy"]);
              // Torn down by `dropSchema("test_schema", {})` in the outer
              // finally — the table lives in the non-default schema; the
              // suite afterEach also drops it by name for the lint rule.
              await schema.createTable(
                "postgresql_enums_in_test_schema",
                { force: "cascade" },
                async (t) => {
                  await t.enum("current_mood", { enum_type: "mood_in_test_schema" });
                },
              );
            });

            const cols = await adapter.columns("postgresql_enums_in_test_schema");
            const col = cols.find((c) => c.name === "current_mood");
            expect(col).toBeDefined();
            expect(col!.sqlType).toBe("mood_in_test_schema");
          },
          { drop: false },
        );

        // Outside withTestSchema — query the schema-qualified table explicitly.
        // The enum sql_type is schema-qualified now that test_schema is off the
        // search path (Rails asserts "test_schema.mood_in_test_schema").
        const cols = await adapter.columns("test_schema.postgresql_enums_in_test_schema");
        const col = cols.find((c) => c.name === "current_mood");
        expect(col).toBeDefined();
        expect(col!.sqlType).toBe("test_schema.mood_in_test_schema");
      } finally {
        await adapter.dropSchema("test_schema", { ifExists: true });
      }
    });
  });
});
