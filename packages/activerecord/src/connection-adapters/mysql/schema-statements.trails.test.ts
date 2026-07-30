import { describe, it, expect } from "vitest";
import { MysqlSchemaStatements } from "./schema-statements.js";
import { Table as MysqlTable } from "./schema-definitions.js";

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
