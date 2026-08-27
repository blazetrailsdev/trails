import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

class XmlDataType extends Base {
  static {
    this.tableName = "xml_data_type";
    this.attribute("id", "integer");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("DROP TABLE IF EXISTS xml_data_type");
    await connection.execute(`CREATE TABLE xml_data_type (id SERIAL PRIMARY KEY, payload xml)`);
    void XmlDataType.resetColumnInformation();
    await XmlDataType.loadSchema();
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS xml_data_type");
    void XmlDataType.resetColumnInformation();
  });

  describe("PostgreSQLXMLTest", () => {
    it("xml column", async () => {
      const column = XmlDataType.columnsHash()["payload"];
      expect(column.type).toBe("xml");
    });

    it("null xml", async () => {
      await connection.execute("INSERT INTO xml_data_type (payload) VALUES(null)");
      const record = (await XmlDataType.first()) as any;
      expect(record.payload).toBeNull();
    });

    it("round trip", async () => {
      const data = XmlDataType.new({ payload: "<foo>bar</foo>" }) as any;
      expect(data.payload).toBe("<foo>bar</foo>");
      await data.saveBang();
      await data.reload();
      expect(data.payload).toBe("<foo>bar</foo>");
    });

    it("update all", async () => {
      const data = (await XmlDataType.createBang({})) as any;
      await XmlDataType.updateAll({ payload: "<bar>baz</bar>" });
      await data.reload();
      expect(data.payload).toBe("<bar>baz</bar>");
    });

    it("xml schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "xml_data_type");
      expect(output).toMatch(/t\.xml\("payload"\)/);
    });
  });
});
