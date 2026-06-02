/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_enum_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../base.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.createTable("enum_tests", { id: false, force: true }, (t: any) => {
      t.column("enum_column", "enum('text','blob','tiny','medium','long','unsigned','bigint')");
      t.column("state", "TINYINT(1)");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("enum_tests", { ifExists: true });
    await adapter.close();
  });

  describe("MysqlEnumTest", () => {
    it("should not be unsigned", async () => {
      const columns = await adapter.columns("enum_tests");
      const column = columns.find((c) => c.name === "enum_column");
      expect((column as any).isUnsigned()).toBe(false);
    });

    it("should not be bigint", async () => {
      const columns = await adapter.columns("enum_tests");
      const column = columns.find((c) => c.name === "enum_column");
      expect((column as any).isBigint()).toBe(false);
    });

    // BLOCKED: schema-dumper columnSpec divergence (Wave 3 Story 3.3). For a raw
    // string-typed column trails' emitTable appends `{ limit, collation }` option
    // literals, whereas Rails emits a bare `t.column "enum_column", "enum(...)"`.
    // The `unsigned`/`bigint` introspection this file proves is unaffected; un-skip
    // when the schema dumper stops emitting native-type options for opaque string
    // types. (See enum_tests dump: the column line carries `{ limit: 8, collation }`.)
    it.skip("schema dumping", async () => {
      const schema = await SchemaDumper.dumpTableSchema(
        adapter as unknown as SchemaSource,
        "enum_tests",
      );
      expect(schema).toMatch(
        /t\.column\("enum_column", "enum\('text','blob','tiny','medium','long','unsigned','bigint'\)"\)/,
      );
    });

    // BLOCKED: not a MySQL-adapter gap — needs general enum label mass-assignment.
    // `create({ state: "middle" })` routes the label through `writeAttribute`, which
    // bypasses the `enum` macro's property setter (the only place label→integer
    // mapping happens) and casts "middle" through the integer type → null. Rails
    // dispatches construction through `public_send("state=")`; trails cannot route
    // its constructor through setters wholesale (the composite-PK `id=` setter, and
    // others, diverge from writeAttribute). The faithful fix is a separate,
    // non-MySQL change to make the enum macro type-backed so writeAttribute maps
    // labels — tracked as a follow-up.
    it.skip("enum with attribute", async () => {
      class EnumTest extends Base {
        static _tableName = "enum_tests";
        static {
          this.attribute("state", "integer");
          this.enum("state", { start: 0, middle: 1, finish: 2 });
        }
      }
      EnumTest.adapter = adapter;

      const enumTest = await EnumTest.create({ state: "middle" });
      expect((enumTest as any).state).toBe("middle");
    });
  });
});
