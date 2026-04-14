import { describe, it, expect } from "vitest";
import { MySQLDatabaseTasks } from "./mysql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "mysql2",
    database: "trails_test",
    ...overrides,
  });
}

describe("MySQLDatabaseTasks", () => {
  it("test_charset_defaults_to_utf8mb4", () => {
    expect(new MySQLDatabaseTasks(config()).charset()).toBe("utf8mb4");
  });

  it("test_charset_reads_encoding_from_config", () => {
    expect(new MySQLDatabaseTasks(config({ encoding: "latin1" })).charset()).toBe("latin1");
  });

  it("test_collation_reads_from_config", () => {
    expect(new MySQLDatabaseTasks(config({ collation: "utf8mb4_general_ci" })).collation()).toBe(
      "utf8mb4_general_ci",
    );
  });

  it("test_collation_returns_null_when_unset", () => {
    expect(new MySQLDatabaseTasks(config()).collation()).toBeNull();
  });

  it("test_using_database_configurations_is_true", () => {
    expect(MySQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_mysql_and_trilogy_patterns", () => {
    DatabaseTasks.clearRegisteredTasks();
    MySQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("mysql2")).toBeDefined();
    expect(DatabaseTasks.resolveTask("trilogy")).toBeDefined();
  });
});
