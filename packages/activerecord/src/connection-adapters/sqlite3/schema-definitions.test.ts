import { describe, it, expect } from "vitest";
import { TableDefinition } from "./schema-definitions.js";

describe("SQLite3::TableDefinition", () => {
  it("forces type: integer for references", () => {
    const td = new TableDefinition("orders");
    td.references("customer");
    const col = td.columns.find((c) => c.name === "customer_id");
    expect(col!.type).toBe("integer");
  });

  it("returns primary_key for integer primary key columns (integerLikePrimaryKeyType)", () => {
    const td = new TableDefinition("orders", { id: false });
    td.column("order_id", "integer", { primaryKey: true });
    expect(td.columns.find((c) => c.name === "order_id")!.type).toBe("primary_key");
  });

  it("includes as, type, stored in validColumnDefinitionOptions", () => {
    const td = new TableDefinition("t");
    const opts = (td as any).validColumnDefinitionOptions() as string[];
    expect(opts).toContain("as");
    expect(opts).toContain("stored");
  });

  it("resolves virtual type to the actual type option", () => {
    const td = new TableDefinition("articles");
    const col = td.newColumnDefinition("full_name", "virtual" as any, { type: "string" } as any);
    expect(col.type).toBe("string");
  });
});
