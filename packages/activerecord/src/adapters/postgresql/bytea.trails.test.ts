import { afterEach, beforeEach, expect, it } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

class ByteaDataType extends Base {
  static {
    this.tableName = "bytea_data_type";
    this.attribute("id", "integer");
  }
}

describeIfPg("PostgreSQL bytea round trip", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await connection.createTable("bytea_data_type", (t) => {
      t.binary("payload");
      t.binary("serialized");
    });
    void ByteaDataType.resetColumnInformation();
    await ByteaDataType.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("bytea_data_type", { ifExists: true });
    void ByteaDataType.resetColumnInformation();
  });

  const cases: [string, number[]][] = [
    ["a doubled backslash", [0x5c, 0x5c]],
    ["bytes that read as a hex literal", [...Buffer.from("\\x6869")]],
    ["bytes that read as an octal escape", [...Buffer.from("\\134")]],
    ["a lone backslash before a letter", [0x5c, 0x61]],
  ];

  for (const [label, bytes] of cases) {
    it(`reads back ${label} unchanged`, async () => {
      const data = Buffer.from(bytes);
      const record = await ByteaDataType.create({ payload: data });
      const found = (await ByteaDataType.find(record.id)) as unknown as { payload: Uint8Array };
      expect(Buffer.from(found.payload)).toEqual(data);
    });
  }

  it("hands deserialize the escaped text and decodes bytea for query", async () => {
    await connection.execute("INSERT INTO bytea_data_type (payload) VALUES ('\\x5c5c')");
    const executed = await connection.execute("SELECT payload FROM bytea_data_type");
    expect(executed[0].payload).toBe("\\x5c5c");
    const rows = await connection.query("SELECT payload FROM bytea_data_type");
    expect(rows).toEqual([[Buffer.from([0x5c, 0x5c])]]);
  });
});
