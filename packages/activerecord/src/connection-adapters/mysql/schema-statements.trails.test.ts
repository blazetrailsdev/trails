import { describe, it, expect } from "vitest";
import { MysqlSchemaStatements } from "./schema-statements.js";
import { Table as MysqlTable } from "./schema-definitions.js";

// Rails defines MySQL::SchemaStatements#update_table_definition on the module the
// adapter includes, so the inherited change_table yields MySQL::Table. In trails
// the module is a companion class, and Migration#schema hands back that companion
// — this pins the override on the companion rather than on the adapter.
describe("MysqlSchemaStatements#changeTable", () => {
  it("yields the MySQL Table subclass", async () => {
    const ss = new MysqlSchemaStatements({ adapterName: "mysql" } as never);
    let yielded: unknown;
    await ss.changeTable("things", (t) => {
      yielded = t;
    });
    expect(yielded).toBeInstanceOf(MysqlTable);
  });
});
