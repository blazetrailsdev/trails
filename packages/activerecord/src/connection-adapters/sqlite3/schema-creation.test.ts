import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import {
  ForeignKeyDefinition,
  TableDefinition,
  CreateIndexDefinition,
} from "../abstract/schema-definitions.js";

describe("SQLite3::SchemaCreation", () => {
  const sc = new SchemaCreation("sqlite");

  it("appends DEFERRABLE INITIALLY DEFERRED when deferrable is 'deferred'", async () => {
    const fk = new ForeignKeyDefinition(
      "orders",
      "customers",
      "customer_id",
      "id",
      "fk_orders_customers",
      undefined,
      undefined,
      "deferred",
    );
    expect(await sc.accept(fk)).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("omits DEFERRABLE when not set", async () => {
    const fk = new ForeignKeyDefinition(
      "orders",
      "customers",
      "customer_id",
      "id",
      "fk_orders_customers",
    );
    expect(await sc.accept(fk)).not.toContain("DEFERRABLE");
  });

  it("omits USING clause from CREATE INDEX (no index-using support)", async () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.index(["title"], { using: "btree" });
    expect(await sc.accept(new CreateIndexDefinition(td.indexes[0]))).not.toContain("USING");
  });

  it("appends COLLATE clause when collation option is set", async () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("title", "string", { collation: "BINARY" } as any);
    expect(await sc.accept(td)).toContain('COLLATE "BINARY"');
  });

  it("appends GENERATED ALWAYS AS VIRTUAL for virtual columns", async () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("full_name", "string", { as: "first_name || ' ' || last_name" } as any);
    const sql = await sc.accept(td);
    expect(sql).toContain("GENERATED ALWAYS AS");
    expect(sql).toContain("VIRTUAL");
  });

  it("appends STORED for stored virtual columns", async () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("full_name", "string", { as: "first_name || ' ' || last_name", stored: true } as any);
    expect(await sc.accept(td)).toContain("STORED");
  });
});
