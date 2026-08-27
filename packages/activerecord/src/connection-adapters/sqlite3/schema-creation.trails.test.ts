import { it, expect, beforeAll } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import {
  ForeignKeyDefinition,
  CreateIndexDefinition,
  IndexDefinition,
} from "../abstract/schema-definitions.js";
import { TableDefinition } from "./schema-definitions.js";
import { Base } from "../../base.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import type { TableDefinitionConn } from "../abstract/schema-definitions.js";
import type { SchemaCreationConn } from "../abstract/schema-creation.js";

describeIfSqlite("SQLite3::SchemaCreation", () => {
  let conn: TableDefinitionConn & SchemaCreationConn;
  let sc: SchemaCreation;

  beforeAll(async () => {
    conn = (await Base.leaseConnection()) as unknown as TableDefinitionConn & SchemaCreationConn;
    sc = new SchemaCreation(conn);
  });

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
    const index = new IndexDefinition("articles", "index_articles_on_title", false, ["title"], {
      using: "btree",
    });
    expect(await sc.accept(new CreateIndexDefinition(index))).not.toContain("USING");
  });

  it("appends COLLATE clause when collation option is set", async () => {
    const td = new TableDefinition(conn, "articles");
    td.column("title", "string", { collation: "BINARY" } as any);
    expect(await sc.accept(td)).toContain('COLLATE "BINARY"');
  });

  it("appends GENERATED ALWAYS AS VIRTUAL for virtual columns", async () => {
    const td = new TableDefinition(conn, "articles");
    td.column("full_name", "string", { as: "first_name || ' ' || last_name" } as any);
    const sql = await sc.accept(td);
    expect(sql).toContain("GENERATED ALWAYS AS");
    expect(sql).toContain("VIRTUAL");
  });

  it("appends STORED for stored virtual columns", async () => {
    const td = new TableDefinition(conn, "articles");
    td.column("full_name", "string", { as: "first_name || ' ' || last_name", stored: true } as any);
    expect(await sc.accept(td)).toContain("STORED");
  });
});
