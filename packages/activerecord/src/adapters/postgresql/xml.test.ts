/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/xml_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";

// Rails: class XmlDataType < ActiveRecord::Base
//   self.table_name = "xml_data_type"
class XmlDataType extends Base {
  static {
    this.tableName = "xml_data_type";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    // Rails: @connection.create_table("xml_data_type") { |t| t.xml "payload" }
    await connection.execute(`CREATE TABLE xml_data_type (id SERIAL PRIMARY KEY, payload xml)`);
    XmlDataType.resetColumnInformation();
    await XmlDataType.loadSchema();
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS xml_data_type");
    XmlDataType.resetColumnInformation();
  });

  describe("PostgresqlXMLTest", () => {
    it("xml column", async () => {
      // Rails: assert_equal :xml, @column.type
      const column = XmlDataType.columnsHash()["payload"];
      expect(column.type).toBe("xml");
    });

    it("null xml", async () => {
      // Rails: @connection.execute "insert into xml_data_type (payload) VALUES(null)"
      await connection.execute("INSERT INTO xml_data_type (payload) VALUES(null)");
      // Rails: assert_nil XmlDataType.first.payload
      const record = (await XmlDataType.first()) as any;
      expect(record.payload).toBeNull();
    });

    it("round trip", async () => {
      // Rails: data = XmlDataType.new(payload: "<foo>bar</foo>"); data.save!
      const data = XmlDataType.new({ payload: "<foo>bar</foo>" }) as any;
      expect(data.payload).toBe("<foo>bar</foo>");
      await data.saveBang();
      // Rails: assert_equal "<foo>bar</foo>", data.reload.payload
      await data.reload();
      expect(data.payload).toBe("<foo>bar</foo>");
    });

    it("update all", async () => {
      // Rails: data = XmlDataType.create!
      const data = (await XmlDataType.createBang({})) as any;
      // Rails: XmlDataType.update_all(payload: "<bar>baz</bar>")
      await XmlDataType.updateAll({ payload: "<bar>baz</bar>" });
      // Rails: assert_equal "<bar>baz</bar>", data.reload.payload
      await data.reload();
      expect(data.payload).toBe("<bar>baz</bar>");
    });

    it("xml schema dump", async () => {
      // Rails: assert_match %r{t\.xml "payload"}, output
      const output = await SchemaDumper.dumpTableSchema(connection, "xml_data_type");
      expect(output).toMatch(/t\.xml\("payload"\)/);
    });
  });
});
