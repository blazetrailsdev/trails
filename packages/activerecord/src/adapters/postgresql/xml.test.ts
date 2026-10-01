import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

class XmlDataType extends Base {
  static {
    this.tableName = "xml_data_type";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await connection.createTable("xml_data_type", {}, (t) => {
      t.xml("payload");
    });
    void XmlDataType.resetColumnInformation();
    await XmlDataType.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("xml_data_type", { ifExists: true });
    void XmlDataType.resetColumnInformation();
  });

  describe("PostgreSQLXMLTest", () => {
    it("column", async () => {
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

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema(connection, "xml_data_type");
      expect(output).toMatch(/t\.xml\("payload"\)/);
    });
  });
});
