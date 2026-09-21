import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { assert, assertNotPredicate } from "@blazetrails/activesupport";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

class ByteaDataType extends Base {
  static {
    this.tableName = "bytea_data_type";
    this.attribute("id", "integer");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;
  let column: PgColumn;
  let type: any;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.transaction(async () => {
      await connection.createTable("bytea_data_type", (t) => {
        t.binary("payload");
        t.binary("serialized");
      });
    });
    void ByteaDataType.resetColumnInformation();
    await ByteaDataType.loadSchema();
    column = ByteaDataType.columnsHash()["payload"] as unknown as PgColumn;
    type = ByteaDataType.typeForAttribute("payload");
  });

  afterEach(async () => {
    await connection.dropTable("bytea_data_type", { ifExists: true });
    void ByteaDataType.resetColumnInformation();
  });

  describe("PostgresqlByteaTest", () => {
    it("column", () => {
      assert(column instanceof PgColumn);
      expect(column.type).toBe("binary");
    });

    it("binary columns are limitless the upper limit is one GB", () => {
      expect(connection.typeToSql("binary", { limit: 100_000 })).toBe("bytea");
      expect(() => connection.typeToSql("binary", { limit: 4_294_967_295 })).toThrow();
    });

    it("type cast binary converts the encoding", () => {
      assert(column);

      const data = "\u001F\x8B";
      expect(data.constructor).toBe(String);
      expect(type.deserialize(data).constructor).toBe(Buffer);
    });

    it("type cast binary value", () => {
      const data = new Uint8Array([0x1f, 0x8b]);
      expect(type.deserialize(data)).toEqual(data);
    });

    it("type case nil", () => {
      expect(type.deserialize(null)).toBeNull();
    });

    it("read value", async () => {
      const data = "\u001F";
      await connection.execute(`insert into bytea_data_type (payload) VALUES ('${data}')`);
      const record = await (ByteaDataType as any).first();
      expect(new TextDecoder().decode(record.payload)).toBe(data);
      await record.delete();
    });

    it("read nil value", async () => {
      await connection.execute(`INSERT INTO bytea_data_type (payload) VALUES (null)`);
      const record = await (ByteaDataType as any).first();
      expect(record.payload).toBeNull();
      await record.delete();
    });

    it("write value", async () => {
      const data = new Uint8Array([0x1f]);
      const record = await (ByteaDataType as any).create({ payload: data });
      assertNotPredicate(record, (r: any) => r.isNewRecord());
      expect(record.payload).toEqual(data);
    });

    async function runViaToSql(): Promise<void> {
      const data = Buffer.from([0x27, 0x1f, 0x5c]);
      await (ByteaDataType as any).create({ payload: data });
      const sql = (ByteaDataType as any).where({ payload: data }).select("payload").toSql();
      const result = await connection.query(sql);
      expect(result.map((row) => row.map((v) => Buffer.from(v as Uint8Array)))).toEqual([[data]]);
    }

    it("via to sql", async () => {
      await runViaToSql();
    });

    it("via to sql with complicating connection", async () => {
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
      const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      assert(data.length > 1);
      const record = await (ByteaDataType as any).create({ payload: data });
      assertNotPredicate(record, (r: any) => r.isNewRecord());
      expect(Buffer.from(record.payload as Uint8Array)).toEqual(data);
      expect(
        Buffer.from((await (ByteaDataType as any).where({ id: record.id }).first()).payload),
      ).toEqual(data);
    });

    it("write nil", async () => {
      const record = await (ByteaDataType as any).create({ payload: null });
      assertNotPredicate(record, (r: any) => r.isNewRecord());
      expect(record.payload).toBeNull();
      expect((await (ByteaDataType as any).where({ id: record.id }).first()).payload).toBeNull();
    });

    it("serialize", async () => {
      const coder = { load: (s: unknown) => s, dump: (s: unknown) => s };
      class ByteaSerialized extends ByteaDataType {}
      ByteaSerialized.serialize("serialized", { coder });
      void ByteaSerialized.resetColumnInformation();
      await ByteaSerialized.loadSchema();
      const obj = new ByteaSerialized() as any;
      obj.serialized = "hello world";
      await obj.saveBang();
      await obj.reload();
      expect(obj.serialized).toBe("hello world");
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema(connection, "bytea_data_type");
      expect(output).toMatch(/t\.binary\s*\("payload"\);$/m);
      expect(output).toMatch(/t\.binary\s*\("serialized"\);$/m);
    });
  });
});
