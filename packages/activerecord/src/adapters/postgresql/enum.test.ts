import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, pgServerVersion } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";
import { Base, Schema } from "../../index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assert,
  assertNotPredicate,
  assertNothingRaised,
  assertPredicate,
  assertRaises,
  isBlank,
} from "@blazetrails/activesupport";
import { StatementInvalid } from "../../errors.js";
import { fixtures } from "../../test-fixtures.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

class PostgresqlEnum extends Base {
  static {
    this.tableName = "postgresql_enums";
    this.attribute("id", "integer");
    this.enum(
      "current_mood",
      { sad: "sad", okay: "ok", happy: "happy", aliased_field: "happy" },
      { prefix: true },
    );
  }
}

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
    adapter.schemaCache.clearBang();
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  let defaultSearchPath: string;
  beforeAll(async () => {
    defaultSearchPath = await (Base.connection as PostgreSQLAdapter).schemaSearchPath();
  });
  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.execute(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.createEnum("mood", ["sad", "ok", "happy"]);
    await adapter.execute(`
      CREATE TABLE "postgresql_enums" (
        "id" SERIAL PRIMARY KEY,
        "current_mood" mood
      )
    `);
    void PostgresqlEnum.resetColumnInformation();
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS "postgresql_enums" CASCADE`);
    await adapter.execute(
      `DROP TABLE IF EXISTS postgresql_enums_in_other_schema, test_schema, postgresql_enums_in_test_schema CASCADE`,
    );
    await adapter.execute(`DROP TYPE IF EXISTS "mood" CASCADE`);
    await adapter.execute(`DROP TYPE IF EXISTS "feeling" CASCADE`);
    await adapter.execute(`DROP TYPE IF EXISTS "unused" CASCADE`);
    await adapter.execute(`DROP TYPE IF EXISTS "color" CASCADE`);
    await adapter.setSchemaSearchPath(defaultSearchPath);
    adapter.schemaCache.clearBang();
    void PostgresqlEnum.resetColumnInformation();
    vi.restoreAllMocks();
  });

  describe("PostgresqlEnumTest", () => {
    it("column", async () => {
      await PostgresqlEnum.loadSchema();
      const column = PostgresqlEnum.columnsHash()["current_mood"] as any;
      expect(column.type).toBe("enum");
      expect(column.sqlType).toBe("mood");
      assertNotPredicate(column, (c: any) => c.isArray());

      const type = PostgresqlEnum.typeForAttribute("current_mood");
      assertNotPredicate(type, (t: any) => t.isBinary());
    });

    it("enum defaults", async () => {
      await adapter.addColumn("postgresql_enums", "good_mood", "mood", { default: "happy" });
      void PostgresqlEnum.resetColumnInformation();
      await PostgresqlEnum.loadSchema();

      expect((PostgresqlEnum as any).columnDefaults["good_mood"]).toBe("happy");
      expect((new PostgresqlEnum() as any).good_mood).toBe("happy");
    });

    it("enum mapping", async () => {
      await adapter.execute(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const enumRecord = await PostgresqlEnum.first();
      expect((enumRecord as any).readAttribute("current_mood")).toBe("sad");
      (enumRecord as any).writeAttribute("current_mood", "happy");
      await enumRecord!.saveBang();

      expect((await (enumRecord as any).reload()).readAttribute("current_mood")).toBe("happy");
    });

    it("invalid enum update", async () => {
      await adapter.execute(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const enumRecord = await PostgresqlEnum.first();
      expect(() => {
        (enumRecord as any).current_mood = "angry";
      }).toThrow(ArgumentError);
    });

    it("no oid warning", async () => {
      await adapter.execute(`INSERT INTO "postgresql_enums" VALUES (1, 'sad')`);
      const stderrOutput: string[] = [];
      vi.spyOn(console, "warn").mockImplementation((...args) => {
        stderrOutput.push(args.join(" "));
      });
      await PostgresqlEnum.first();

      assertPredicate(stderrOutput.join(""), isBlank);
    });

    it("enum type cast", async () => {
      await PostgresqlEnum.loadSchema();
      const enumRecord = new PostgresqlEnum();
      (enumRecord as any).writeAttribute("current_mood", "happy");
      expect((enumRecord as any).readAttribute("current_mood")).toBe("happy");
    });

    it("assigning enum to nil", async () => {
      await PostgresqlEnum.loadSchema();
      const model = new PostgresqlEnum();
      (model as any).writeAttribute("current_mood", null);
      expect((model as any).readAttribute("current_mood")).toBeNull();
      const saved = await model.save();
      expect(saved).toBeTruthy();
      await (model as any).reload();
      expect((model as any).readAttribute("current_mood")).toBeNull();
    });

    it("schema dump", async () => {
      await adapter.execute(
        `ALTER TABLE "postgresql_enums" ADD COLUMN "good_mood" mood DEFAULT 'happy' NOT NULL`,
      );
      const output = await dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain(
        "// Note that some types may not work with other database engines. Be careful if changing database.",
      );
      expect(output).toContain('await ctx.createEnum("mood", ["sad","ok","happy"]);');
      expect(output).toContain('t.enum("current_mood", { enumType: "mood" })');
      expect(output).toContain(
        't.enum("good_mood", { default: "happy", null: false, enumType: "mood" })',
      );
    });

    it("schema dump renamed enum", async () => {
      await adapter.renameEnum("mood", "feeling");
      const output = await dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("feeling", ["sad","ok","happy"]);');
      expect(output).toContain('t.enum("current_mood", { enumType: "feeling" })');
    });

    it("schema dump renamed enum with to option", async () => {
      await adapter.renameEnum("mood", { to: "feeling" });
      const output = await dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("feeling", ["sad","ok","happy"]);');
      expect(output).toContain('t.enum("current_mood", { enumType: "feeling" })');
    });

    it.skipIf(pgServerVersion < 100000)("schema dump added enum value", async () => {
      await adapter.addEnumValue("mood", "angry", { before: "ok" });
      await adapter.addEnumValue("mood", "nervous", { after: "ok" });
      await adapter.addEnumValue("mood", "glad");

      await assertNothingRaised(async () => {
        await adapter.addEnumValue("mood", "glad", { ifNotExists: true });
        await adapter.addEnumValue("mood", "curious", { ifNotExists: true });
      });

      const output = await dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain(
        'await ctx.createEnum("mood", ["sad","angry","ok","nervous","happy","glad","curious"]);',
      );
    });

    it.skipIf(pgServerVersion < 100000)("schema dump renamed enum value", async () => {
      await adapter.renameEnumValue("mood", { from: "ok", to: "okay" });
      const output = await dumpTableSchema(adapter, "postgresql_enums");
      expect(output).toContain('await ctx.createEnum("mood", ["sad","okay","happy"]);');
    });

    it("schema load", async () => {
      await Schema.define<PostgreSQLAdapter>(async (schema) => {
        await schema.createEnum("color", ["blue", "green"]);
        await schema.changeTable("postgresql_enums", async (t) => {
          await t.enum("best_color", {
            enumType: "color",
            default: "blue",
            null: false,
          });
        });
      });

      assert(
        await adapter.columnExists("postgresql_enums", "best_color", null, {
          sqlType: "color",
          default: "blue",
          null: false,
        } as never),
      );
    });

    it("drop enum", async () => {
      await adapter.createEnum("unused", []);

      await assertNothingRaised(async () => {
        await adapter.dropEnum("unused");
      });

      await assertNothingRaised(async () => {
        await adapter.dropEnum("unused", { ifExists: true });
      });

      await assertRaises([StatementInvalid], {}, async () => {
        await adapter.dropEnum("unused");
      });
    });

    it("works with activerecord enum", async () => {
      let model = await PostgresqlEnum.createBang();
      await (model as any).currentMoodOkayBang();

      model = (await PostgresqlEnum.find((model as any).id))!;
      expect((model as any).current_mood).toBe("okay");

      (model as any).current_mood = "happy";
      await model.saveBang();

      model = (await PostgresqlEnum.find((model as any).id))!;
      assertPredicate(model, (m: any) => m.isCurrentMoodHappy());
    });

    it("enum type scoped to schemas", async () => {
      await withTestSchema(adapter, "test_schema", async () => {
        await adapter.createEnum("mood_in_other_schema", ["sad", "ok", "happy"]);

        await assertNothingRaised(async () => {
          await adapter.createTable("postgresql_enums_in_other_schema", (t) => {
            t.column("current_mood", "mood_in_other_schema", { default: "happy", null: false });
          });
        });

        assert(await adapter.tableExists("postgresql_enums_in_other_schema"));
      });
    });

    it("enum type explicit schema", async () => {
      await adapter.dropSchema("test_schema", { ifExists: true });
      await adapter.createSchema("test_schema");
      try {
        await adapter.createEnum("test_schema.mood_in_other_schema", ["sad", "ok", "happy"]);

        await adapter.createTable("test_schema.postgresql_enums_in_other_schema", (t) => {
          t.column("current_mood", "test_schema.mood_in_other_schema");
        });

        assert(await adapter.tableExists("test_schema.postgresql_enums_in_other_schema"));

        await assertNothingRaised(async () => {
          // eslint-disable-next-line blazetrails/require-table-teardown -- the drop is under test; the finally drops the schema
          await adapter.dropTable("test_schema.postgresql_enums_in_other_schema");
          await adapter.dropEnum("test_schema.mood_in_other_schema");
        });
      } finally {
        await adapter.dropSchema("test_schema", { ifExists: true });
      }
    });

    it("schema dump scoped to schemas", { timeout: 60_000 }, async () => {
      await adapter.dropSchema("other_schema", { ifExists: true });
      await adapter.createSchema("other_schema");
      try {
        await adapter.createEnum("other_schema.mood_in_other_schema", ["sad", "ok", "happy"]);

        await withTestSchema(adapter, "test_schema", async () => {
          await adapter.createEnum("mood_in_test_schema", ["sad", "ok", "happy"]);
          await adapter.execute(`
            CREATE TABLE "postgresql_enums_in_test_schema" (
              "id" SERIAL PRIMARY KEY,
              "current_mood" mood_in_test_schema
            )
          `);

          const output = (await SchemaDumper.dump(adapter)).string();

          expect(output).toContain('await ctx.createEnum("public.mood", ["sad","ok","happy"]);');
          expect(output).toContain(
            'await ctx.createEnum("mood_in_test_schema", ["sad","ok","happy"]);',
          );
          expect(output).toContain('t.enum("current_mood", { enumType: "mood_in_test_schema" })');
          expect(output).not.toContain('await ctx.createEnum("other_schema.mood_in_other_schema"');
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
            await Schema.define<PostgreSQLAdapter>(async (schema) => {
              await schema.createEnum("mood_in_test_schema", ["sad", "ok", "happy"]);
              await schema.createEnum("public.mood", ["sad", "ok", "happy"]);
              await schema.createTable(
                "postgresql_enums_in_test_schema",
                { force: "cascade" },
                (t) => {
                  t.enum("current_mood", { enumType: "mood_in_test_schema" });
                },
              );
            });

            assert(
              await adapter.columnExists("postgresql_enums_in_test_schema", "current_mood", null, {
                sqlType: "mood_in_test_schema",
              } as never),
            );
          },
          { drop: false },
        );

        assert(
          await adapter.columnExists(
            "test_schema.postgresql_enums_in_test_schema",
            "current_mood",
            null,
            {
              sqlType: "test_schema.mood_in_test_schema",
            } as never,
          ),
        );
      } finally {
        await adapter.dropSchema("test_schema", { ifExists: true });
      }
    });
  });
});
