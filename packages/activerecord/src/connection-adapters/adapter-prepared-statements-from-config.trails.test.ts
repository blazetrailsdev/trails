import { describe, it, expect } from "vitest";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

// abstract_adapter.rb:159 reads `@prepared_statements` in the common tail of
// `initialize`, so EVERY construction path gets it — including the ones trails
// splits into a connection-string branch that returns early. The default comes
// from `default_prepared_statements` (abstract_adapter.rb:1223 → true;
// mysql2_adapter.rb:186 → false).
describe("adapter prepared_statements from config", () => {
  it("applies default_prepared_statements to connection-string configs", () => {
    expect(new PostgreSQLAdapter("postgres://localhost:59999/none").preparedStatements).toBe(true);
    expect(new Mysql2Adapter("mysql2://localhost:59999/none").preparedStatements).toBe(false);
  });

  it("applies default_prepared_statements to hash configs", () => {
    expect(new PostgreSQLAdapter({ database: "none" }).preparedStatements).toBe(true);
    expect(new Mysql2Adapter({ database: "none" }).preparedStatements).toBe(false);
  });

  it("lets the config override the default", () => {
    expect(
      new PostgreSQLAdapter({ database: "none", preparedStatements: false }).preparedStatements,
    ).toBe(false);
    expect(
      new Mysql2Adapter({ database: "none", preparedStatements: true }).preparedStatements,
    ).toBe(true);
  });
});
