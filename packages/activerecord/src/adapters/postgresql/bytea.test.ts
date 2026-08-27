import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { BinaryData } from "@blazetrails/activemodel";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

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
      expect(column).toBeInstanceOf(PgColumn);
      expect(column.type).toBe("binary");
    });

    it("binary columns are limitless the upper limit is one GB", () => {
      expect(connection.typeToSql("binary", { limit: 100_000 })).toBe("bytea");
      expect(() => connection.typeToSql("binary", { limit: 4_294_967_295 })).toThrow();
    });

    it("type cast binary converts the encoding", () => {
      expect(column).toBeDefined();
      const data = "\u001F\x8B";
      const result = type.deserialize(data);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("type cast binary value", () => {
      const data = Buffer.from([0x1f, 0x8b]);
      const result = type.deserialize(data);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result as Uint8Array)).toEqual(data);
    });

    it("type case nil", () => {
      expect(type.deserialize(null)).toBeNull();
    });

    it("read value", async () => {
      const data = Buffer.from([0x1f]);
      await connection.execute(`INSERT INTO bytea_data_type (payload) VALUES ($1)`, [
        new BinaryData(data),
      ]);
      const record = await (ByteaDataType as any).first();
      expect(record.payload).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(record.payload as Uint8Array)).toEqual(data);
    });

    it("read nil value", async () => {
      await connection.execute(`INSERT INTO bytea_data_type (payload) VALUES (null)`);
      const record = await (ByteaDataType as any).first();
      expect(record.payload).toBeNull();
    });

    it("write value", async () => {
      const data = Buffer.from([0x1f]);
      const record = await (ByteaDataType as any).create({ payload: data });
      expect(record.isNewRecord()).toBe(false);
      expect(record.payload).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(record.payload as Uint8Array)).toEqual(data);
    });

    async function runViaToSql(): Promise<void> {
      const data = Buffer.from([0x27, 0x1f, 0x5c]);
      await (ByteaDataType as any).create({ payload: data });
      const sql = (ByteaDataType as any).where({ payload: data }).select("payload").toSql();
      const result = (await connection.execute(sql)) as Array<{ payload: Uint8Array }>;
      expect(result.length).toBe(1);
      expect(Buffer.from(result[0].payload)).toEqual(data);
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
      expect(data.length).toBeGreaterThan(1);
      const record = await (ByteaDataType as any).create({ payload: data });
      expect(record.isNewRecord()).toBe(false);
      expect(Buffer.from(record.payload as Uint8Array)).toEqual(data);
      const reloaded = await ByteaDataType.find(record.id);
      expect(Buffer.from((reloaded as any).payload as Uint8Array)).toEqual(data);
    });

    it("write nil", async () => {
      const record = await (ByteaDataType as any).create({ payload: null });
      expect(record.isNewRecord()).toBe(false);
      expect(record.payload).toBeNull();
      const reloaded = await ByteaDataType.find(record.id);
      expect((reloaded as any).payload).toBeNull();
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
      obj.serialized = "héllo";
      await obj.saveBang();
      await obj.reload();
      expect(obj.serialized).toBe("héllo");
    });

    it("schema dumping", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "bytea_data_type");
      expect(output).toMatch(/t\.binary\s*\("payload"\);$/m);
      expect(output).toMatch(/t\.binary\s*\("serialized"\);$/m);
    });
  });
});
