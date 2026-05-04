import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import {
  ForeignKeyDefinition,
  TableDefinition,
  CreateIndexDefinition,
} from "../abstract/schema-definitions.js";

describe("SQLite3::SchemaCreation", () => {
  const sc = new SchemaCreation("sqlite");

  it("appends DEFERRABLE INITIALLY DEFERRED when deferrable is 'deferred'", () => {
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
    expect(sc.accept(fk)).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("omits DEFERRABLE when not set", () => {
    const fk = new ForeignKeyDefinition(
      "orders",
      "customers",
      "customer_id",
      "id",
      "fk_orders_customers",
    );
    expect(sc.accept(fk)).not.toContain("DEFERRABLE");
  });

  it("omits USING clause from CREATE INDEX (no index-using support)", () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.index(["title"], { using: "btree" });
    expect(sc.accept(new CreateIndexDefinition(td.indexes[0]))).not.toContain("USING");
  });

  it("appends COLLATE clause when collation option is set", () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("title", "string", { collation: "BINARY" } as any);
    expect(sc.accept(td)).toContain('COLLATE "BINARY"');
  });

  it("appends GENERATED ALWAYS AS VIRTUAL for virtual columns", () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("full_name", "string", { as: "first_name || ' ' || last_name" } as any);
    const sql = sc.accept(td);
    expect(sql).toContain("GENERATED ALWAYS AS");
    expect(sql).toContain("VIRTUAL");
  });

  it("appends STORED for stored virtual columns", () => {
    const td = new TableDefinition("articles", { adapterName: "sqlite" });
    td.column("full_name", "string", { as: "first_name || ' ' || last_name", stored: true } as any);
    expect(sc.accept(td)).toContain("STORED");
  });
});
