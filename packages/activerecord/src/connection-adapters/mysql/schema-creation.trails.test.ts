import { describe, it, expect } from "vitest";
import { SchemaCreation, type VisitorHostAdapter } from "./schema-creation.js";
import { TableDefinition as MyTd } from "./schema-definitions.js";
import { schemaConn } from "../../support/schema-conn.js";

const mysqlConn = (overrides: Record<string, unknown> = {}): VisitorHostAdapter =>
  Object.assign(Object.create(schemaConn("mysql")), overrides) as VisitorHostAdapter;

// `TableDefinition#index` stores the caller's options untouched
// (schema_definitions.rb:518) and `index_in_create` normalizes them through
// `@conn.add_index_options` (mysql/schema_creation.rb:99). Before that
// convergence the visitor hand-copied a subset of the option keys, so an inline
// `length:` (a MySQL prefix index) was silently dropped from the CREATE.
describe("MySQL::SchemaCreation inline index options (trails)", () => {
  const sc = new SchemaCreation(mysqlConn());

  it("routes an inline index's length option through addIndexOptions", async () => {
    const td = new MyTd("users", { adapter: mysqlConn() });
    td.string("email");
    td.index(["email"], { length: 10 });
    expect(await sc.accept(td)).toContain("INDEX `index_users_on_email` (`email`(10))");
  });
});
