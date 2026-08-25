// Regression guard for the `postgresql/schema-definitions.ts ->
// postgresql-adapter.ts` edge.
//
// `PostgreSQL::TableDefinition#initialize` names
// `PostgreSQLAdapter.create_unlogged_tables`
// (postgresql/schema_definitions.rb:254), so the TS ctor imports
// `PostgreSQLAdapter`. `postgresql-adapter.ts` already value-imports
// `postgresql/schema-definitions.ts`, so that edge closes a cycle, and entering
// it at the definitions module is the direction that would observe a partial
// `postgresql-adapter.ts`.
//
// `adapter-graph-import-tdz.test.ts` enters through `SchemaStatements` and does
// not reach this cycle, so the edge needs its own entry point. Like that guard,
// this file lives in the `other` vitest project (no adapter-graph preload), so
// its import evaluates the graph fresh with `TableDefinition` as the entry.
//
// The import below is deliberately the first thing this module touches.
import { TableDefinition } from "../../packages/activerecord/src/connection-adapters/postgresql/schema-definitions.js";
import { describe, it, expect } from "vitest";

describe("postgresql schema-definitions circular-init", () => {
  it("imports TableDefinition (value) without a TDZ ReferenceError", () => {
    expect(typeof TableDefinition).toBe("function");
  });
});
