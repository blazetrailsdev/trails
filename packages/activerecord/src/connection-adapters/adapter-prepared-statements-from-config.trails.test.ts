import { describe, it, expect } from "vitest";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

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
