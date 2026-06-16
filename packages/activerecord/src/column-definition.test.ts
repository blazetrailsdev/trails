import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
import { ColumnDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import type {
  ColumnType,
  ColumnOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

// Mirrors Rails' ColumnDefinitionTest::DummyAdapter: native_database_types
// maps `string` to "varchar" and quote_column_name is the identity. The visitor
// under test is the adapter's schema_creation.
class DummyCreation extends SchemaCreation {
  constructor() {
    super("sqlite", {
      quoteIdentifier: (name: string) => name,
      quoteTableName: (name: string) => name,
      quoteDefaultExpression,
    });
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    if (type === "string") return `varchar(${options.limit ?? 255})`;
    return super.typeToSql(type, options);
  }
}

describe("ColumnDefinitionTest", () => {
  const viz = new DummyCreation();

  it("should not include default clause when default is null", () => {
    const columnDef = new ColumnDefinition("title", "string", { limit: 20 });
    expect(viz.accept(columnDef)).toBe("title varchar(20)");
  });

  it("should include default clause when default is present", () => {
    const columnDef = new ColumnDefinition("title", "string", { limit: 20, default: "Hello" });
    expect(viz.accept(columnDef)).toBe("title varchar(20) DEFAULT 'Hello'");
  });

  it("should specify not null if null option is false", () => {
    const columnDef = new ColumnDefinition("title", "string", {
      limit: 20,
      default: "Hello",
      null: false,
    });
    expect(viz.accept(columnDef)).toBe("title varchar(20) DEFAULT 'Hello' NOT NULL");
  });
});
