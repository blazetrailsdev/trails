/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/serial_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { Column } from "../../connection-adapters/postgresql/column.js";
import type { TableDefinition as PgTableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  // Mirrors Rails' `PostgresqlSerial.columns_hash[name]` — fetch a column by
  // name from the live adapter introspection.
  const columnNamed = async (table: string, name: string): Promise<Column> => {
    const cols = (await adapter.columns(table)) as Column[];
    const col = cols.find((c) => c.name === name);
    if (!col) throw new Error(`column ${name} not found on ${table}`);
    return col;
  };

  // Mirrors Rails' SchemaDumpingHelper#dump_table_schema. The dumped DSL is
  // TypeScript-flavored (`t.serial("seq", { null: false })`), so the Rails
  // Ruby-format assertions below are translated to the equivalent TS shape.
  const dumpTableSchema = (table: string): Promise<string> =>
    SchemaDumper.dumpTableSchema(adapter, table);

  describe("PostgresqlSerialTest", () => {
    beforeEach(async () => {
      await adapter.dropTable("postgresql_serials", { ifExists: true });
      await adapter.createTable("postgresql_serials", { force: true }, (table) => {
        const t = table as PgTableDefinition;
        t.serial("seq");
        t.integer("serials_id", {
          default: () => "nextval('postgresql_serials_id_seq')",
        });
      });
    });
    afterEach(async () => {
      await adapter.dropTable("postgresql_serials", { ifExists: true });
    });

    it("serial column", async () => {
      const column = await columnNamed("postgresql_serials", "seq");
      expect(column.type).toBe("integer");
      expect(column.sqlType).toBe("integer");
      expect(column.isSerial).toBe(true);
    });

    it("not serial column", async () => {
      const column = await columnNamed("postgresql_serials", "serials_id");
      expect(column.type).toBe("integer");
      expect(column.sqlType).toBe("integer");
      expect(column.isSerial).toBe(false);
    });

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema("postgresql_serials");
      expect(output).toMatch(/t\.serial\("seq", \{\s*null: false\s*\}\)/);
    });

    it("schema dump with not serial", async () => {
      const output = await dumpTableSchema("postgresql_serials");
      expect(output).toMatch(
        /t\.integer\("serials_id", \{[^}]*default: \(\) => "nextval\('postgresql_serials_id_seq'::regclass\)"/,
      );
    });
  });

  describe("PostgresqlBigSerialTest", () => {
    beforeEach(async () => {
      await adapter.dropTable("postgresql_big_serials", { ifExists: true });
      await adapter.createTable("postgresql_big_serials", { force: true }, (table) => {
        const t = table as PgTableDefinition;
        t.bigserial("seq");
        t.bigint("serials_id", {
          default: () => "nextval('postgresql_big_serials_id_seq')",
        });
      });
    });
    afterEach(async () => {
      await adapter.dropTable("postgresql_big_serials", { ifExists: true });
    });

    it("bigserial column", async () => {
      const column = await columnNamed("postgresql_big_serials", "seq");
      expect(column.type).toBe("integer");
      expect(column.sqlType).toBe("bigint");
      expect(column.isSerial).toBe(true);
    });

    it("not bigserial column", async () => {
      const column = await columnNamed("postgresql_big_serials", "serials_id");
      expect(column.type).toBe("integer");
      expect(column.sqlType).toBe("bigint");
      expect(column.isSerial).toBe(false);
    });

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema("postgresql_big_serials");
      expect(output).toMatch(/t\.bigserial\("seq", \{\s*null: false\s*\}\)/);
    });

    it("schema dump with not bigserial", async () => {
      const output = await dumpTableSchema("postgresql_big_serials");
      expect(output).toMatch(
        /t\.bigint\("serials_id", \{[^}]*default: \(\) => "nextval\('postgresql_big_serials_id_seq'::regclass\)"/,
      );
    });
  });

  describe("CollidedSequenceNameTest", () => {
    beforeEach(async () => {
      await adapter.dropTable("foo_bar", { ifExists: true });
      await adapter.dropTable("foo", { ifExists: true });
      await adapter.createTable("foo_bar", { force: true }, (table) => {
        (table as PgTableDefinition).serial("baz_id");
      });
      await adapter.createTable("foo", { force: true }, (table) => {
        const t = table as PgTableDefinition;
        t.serial("bar_id");
        t.bigserial("bar_baz_id");
      });
    });
    afterEach(async () => {
      await adapter.dropTable("foo_bar", { ifExists: true });
      await adapter.dropTable("foo", { ifExists: true });
    });

    it("serial columns", async () => {
      const columns = (await adapter.columns("foo")) as Column[];
      for (const column of columns) {
        expect(column.type).toBe("integer");
        expect(column.isSerial).toBe(true);
      }
    });

    it("schema dump with collided sequence name", async () => {
      const output = await dumpTableSchema("foo");
      expect(output).toMatch(/t\.serial\("bar_id", \{\s*null: false\s*\}\)/);
      expect(output).toMatch(/t\.bigserial\("bar_baz_id", \{\s*null: false\s*\}\)/);
    });
  });

  describe("LongerSequenceNameDetectionTest", () => {
    const tableName = "long_table_name_to_test_sequence_name_detection_for_serial_cols";
    beforeEach(async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(
        tableName,
        { force: true, _usesLegacyTableName: true } as Parameters<
          PostgreSQLAdapter["createTable"]
        >[1],
        (table) => {
          const t = table as PgTableDefinition;
          t.serial("seq");
          t.bigserial("bigseq");
        },
      );
    });
    afterEach(async () => {
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("serial columns", async () => {
      const columns = (await adapter.columns(tableName)) as Column[];
      for (const column of columns) {
        expect(column.type).toBe("integer");
        expect(column.isSerial).toBe(true);
      }
    });

    it("schema dump with long table name", async () => {
      const output = await dumpTableSchema(tableName);
      expect(output).toMatch(new RegExp(`createTable\\("${tableName}", \\{\\s*force: "cascade"`));
      expect(output).toMatch(/t\.serial\("seq", \{\s*null: false\s*\}\)/);
      expect(output).toMatch(/t\.bigserial\("bigseq", \{\s*null: false\s*\}\)/);
    });
  });
});
