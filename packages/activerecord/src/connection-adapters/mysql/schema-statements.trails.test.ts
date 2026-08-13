import { describe, it, expect } from "vitest";
import { MysqlSchemaStatements } from "./schema-statements.js";
import { Table as MysqlTable } from "./schema-definitions.js";

describe("MysqlSchemaStatements#changeTable", () => {
  it("yields the MySQL Table subclass", async () => {
    const ss = Object.setPrototypeOf(
      { adapterName: "mysql2" },
      MysqlSchemaStatements.prototype,
    ) as MysqlSchemaStatements;
    let yielded: unknown;
    await ss.changeTable("things", (t) => {
      yielded = t;
    });
    expect(yielded).toBeInstanceOf(MysqlTable);
  });
});
