import { describe, it, expect } from "vitest";
import { MySQLDatabaseTasks } from "../../../lib/tasks/mysql-database-tasks.js";
import { DatabaseTasks } from "../../../lib/tasks/database-tasks.js";
import { HashConfig } from "../../../lib/database-configurations/hash-config.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "mysql2",
    database: "trails_test",
    ...overrides,
  });
}

describe("MySQLDatabaseTasks", () => {
  it("test_using_database_configurations_is_true", () => {
    expect(MySQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_mysql_and_trilogy_patterns", () => {
    expect(DatabaseTasks["classForAdapter"]("mysql2")).toBeDefined();
    expect(DatabaseTasks["classForAdapter"]("trilogy")).toBeDefined();
  });
});
