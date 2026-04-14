import { describe, it, expect } from "vitest";
import { PostgreSQLDatabaseTasks } from "./postgresql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "postgresql",
    database: "trails_test",
    ...overrides,
  });
}

describe("PostgreSQLDatabaseTasks", () => {
  it("test_charset_defaults_to_utf8", () => {
    expect(new PostgreSQLDatabaseTasks(config()).charset()).toBe("utf8");
  });

  it("test_charset_reads_encoding_from_config", () => {
    expect(new PostgreSQLDatabaseTasks(config({ encoding: "UTF8" })).charset()).toBe("UTF8");
  });

  it("test_collation_reads_from_config", () => {
    expect(new PostgreSQLDatabaseTasks(config({ collation: "C" })).collation()).toBe("C");
  });

  it("test_collation_returns_null_when_unset", () => {
    expect(new PostgreSQLDatabaseTasks(config()).collation()).toBeNull();
  });

  it("test_using_database_configurations_is_true", () => {
    expect(PostgreSQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    PostgreSQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("postgresql")).toBeDefined();
  });
});
