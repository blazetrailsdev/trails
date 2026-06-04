/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bytea_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

// Rails: class ByteaDataType < ActiveRecord::Base
//   self.table_name = "bytea_data_type"
class ByteaDataType extends Base {
  static {
    this.tableName = "bytea_data_type";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;
  let column: PgColumn;
  let type: any;

  beforeEach(async () => {
    // Rails: @connection = ActiveRecord::Base.lease_connection
    connection = Base.connection as PostgreSQLAdapter;
    // Rails: @connection.transaction { @connection.create_table("bytea_data_type") { |t| ... } }
    await connection.createTable("bytea_data_type", (t) => {
      t.binary("payload");
      t.binary("serialized");
    });
    ByteaDataType.resetColumnInformation();
    await ByteaDataType.loadSchema();
    // Rails: @column = ByteaDataType.columns_hash["payload"]
    column = ByteaDataType.columnsHash()["payload"] as unknown as PgColumn;
    // Rails: @type = ByteaDataType.type_for_attribute("payload")
    type = ByteaDataType.typeForAttribute("payload");
  });

  afterEach(async () => {
    // Rails: @connection.drop_table "bytea_data_type", if_exists: true
    await connection.dropTable("bytea_data_type", { ifExists: true });
    ByteaDataType.resetColumnInformation();
  });

  describe("PostgresqlByteaTest", () => {
    it("column", () => {
      // Rails: assert @column.is_a?(ActiveRecord::ConnectionAdapters::PostgreSQLColumn)
      expect(column).toBeInstanceOf(PgColumn);
      // Rails: assert_equal :binary, @column.type
      expect(column.type).toBe("binary");
    });

    it("binary columns are limitless the upper limit is one GB", () => {
      // Rails: assert_equal "bytea", @connection.type_to_sql(:binary, limit: 100_000)
      expect(connection.typeToSql("binary", { limit: 100_000 })).toBe("bytea");
      // Rails: assert_raise ArgumentError { @connection.type_to_sql(:binary, limit: 4294967295) }
      expect(() => connection.typeToSql("binary", { limit: 4_294_967_295 })).toThrow();
    });

    it("type cast binary converts the encoding", () => {
      // Rails: assert @column
      expect(column).toBeDefined();
      // Rails: data = "\x8B"
      // Rails: assert_equal("ASCII-8BIT", @type.deserialize(data).encoding.name)
      // JS equivalent: deserializing a string returns a Uint8Array (binary, not a string)
      const data = "\x8B";
      const result = type.deserialize(data);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("type cast binary value", () => {
      // Rails: data = (+"\x8B").force_encoding("BINARY")
      // Rails: assert_equal(data, @type.deserialize(data))
      const data = Buffer.from([0x1f, 0x8b]);
      const result = type.deserialize(data);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result as Uint8Array)).toEqual(data);
    });

    it("type case nil", () => {
      // Rails: assert_nil(@type.deserialize(nil))
      expect(type.deserialize(null)).toBeNull();
    });

    it("read value", async () => {
      // Rails: data = ""
      // Rails: @connection.execute "insert into bytea_data_type (payload) VALUES ('#{data}')"
      const data = Buffer.from([0x1f]);
      await connection.execute(`INSERT INTO bytea_data_type (payload) VALUES ($1)`, [data]);
      // Rails: record = ByteaDataType.first
      const record = await (ByteaDataType as any).first();
      // Rails: assert_equal(data, record.payload)
      expect((record as any).payload).toBeInstanceOf(Uint8Array);
      expect(Buffer.from((record as any).payload as Uint8Array)).toEqual(data);
    });

    it("read nil value", async () => {
      // Rails: @connection.execute "insert into bytea_data_type (payload) VALUES (null)"
      await connection.execute(`INSERT INTO bytea_data_type (payload) VALUES (null)`);
      // Rails: record = ByteaDataType.first
      const record = await (ByteaDataType as any).first();
      // Rails: assert_nil(record.payload)
      expect((record as any).payload).toBeNull();
    });

    it("write value", async () => {
      // Rails: data = ""
      const data = Buffer.from([0x1f]);
      // Rails: record = ByteaDataType.create(payload: data)
      const record = await (ByteaDataType as any).create({ payload: data });
      // Rails: assert_not_predicate record, :new_record?
      expect((record as any).isNewRecord()).toBe(false);
      // Rails: assert_equal(data, record.payload)
      expect((record as any).payload).toBeInstanceOf(Uint8Array);
      expect(Buffer.from((record as any).payload as Uint8Array)).toEqual(data);
    });

    // Rails: re-used by test_via_to_sql and test_via_to_sql_with_complicating_connection
    async function runViaToSql(): Promise<void> {
      // Rails: data = "'\\"
      const data = Buffer.from([0x27, 0x1f, 0x5c]);
      await (ByteaDataType as any).create({ payload: data });
      const sql = (ByteaDataType as any).where({ payload: data }).select("payload").toSql();
      const result = (await connection.execute(sql)) as Array<{ payload: Uint8Array }>;
      // Rails: assert_equal([[data]], result)
      expect(result.length).toBe(1);
      expect(Buffer.from(result[0].payload)).toEqual(data);
    }

    it("via to sql", async () => {
      await runViaToSql();
    });

    it("via to sql with complicating connection", async () => {
      // Rails: Thread.new { other_conn = ...; SET standard_conforming_strings = off; ... }.join
      const other = new pg.Client({ connectionString: PG_TEST_URL });
      await other.connect();
      try {
        await other.query("SET standard_conforming_strings = off");
        await other.query("SET escape_string_warning = off");
      } finally {
        await other.end();
      }
      await runViaToSql();
    });

    it("write binary", async () => {
      // Rails: data = File.read(File.join(__dir__, "..", "..", "..", "assets", "example.log"))
      // Rails: assert(data.size > 1)
      // JS: round-trip all byte values 0x00–0xFF (same intent, no file dependency)
      const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      expect(data.length).toBeGreaterThan(1);
      // Rails: record = ByteaDataType.create(payload: data)
      const record = await (ByteaDataType as any).create({ payload: data });
      // Rails: assert_not_predicate record, :new_record?
      expect((record as any).isNewRecord()).toBe(false);
      // Rails: assert_equal(data, record.payload)
      expect(Buffer.from((record as any).payload as Uint8Array)).toEqual(data);
      // Rails: assert_equal(data, ByteaDataType.where(id: record.id).first.payload)
      const reloaded = await ByteaDataType.find((record as any).id);
      expect(Buffer.from((reloaded as any).payload as Uint8Array)).toEqual(data);
    });

    it("write nil", async () => {
      // Rails: record = ByteaDataType.create(payload: nil)
      const record = await (ByteaDataType as any).create({ payload: null });
      // Rails: assert_not_predicate record, :new_record?
      expect((record as any).isNewRecord()).toBe(false);
      // Rails: assert_nil(record.payload)
      expect((record as any).payload).toBeNull();
      // Rails: assert_nil(ByteaDataType.where(id: record.id).first.payload)
      const reloaded = await ByteaDataType.find((record as any).id);
      expect((reloaded as any).payload).toBeNull();
    });

    it.skip("serialize", () => {
      // BLOCKED: binary-subtype coder bridge
      // Rails: klass = Class.new(ByteaDataType) { serialize :serialized, coder: Serializer.new }
      // On read, Bytea#deserialize yields a Uint8Array, but coder.load() needs a string.
      // Type::Serialized#deserialize must bridge binary Buffer→string for binary subtypes.
      // SCOPE: ~15 LOC binary bridge in type/serialized.ts.
    });

    it("schema dumping", async () => {
      // Rails: output = dump_table_schema("bytea_data_type")
      const output = await SchemaDumper.dumpTableSchema(connection, "bytea_data_type");
      // Rails: assert_match %r{t\.binary\s+"payload"$}, output
      expect(output).toMatch(/t\.binary\s*\("payload"\)/);
      // Rails: assert_match %r{t\.binary\s+"serialized"$}, output
      expect(output).toMatch(/t\.binary\s*\("serialized"\)/);
    });
  });
});
