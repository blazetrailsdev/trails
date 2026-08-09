import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
import type { NativeDatabaseTypes } from "./connection-adapters/abstract/native-database-types.js";
import { ColumnDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type {
  ColumnType,
  ColumnOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

// Mirrors Rails' ColumnDefinitionTest::DummyAdapter (column_definition_test.rb:8-18):
// `native_database_types` maps `string` to "varchar", `quote_column_name` is the
// identity on the singleton class, and everything else — including the
// `quote_default_expression` → `quote` self-send — comes from AbstractAdapter.
class DummyAdapter extends AbstractAdapter {
  static quoteColumnName(columnName: string): string {
    return String(columnName);
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return { string: "varchar" };
  }
}

class DummyCreation extends SchemaCreation {
  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    if (type === "string") return `varchar(${options.limit ?? 255})`;
    return super.typeToSql(type, options);
  }
}

describe("ColumnDefinitionTest", () => {
  const viz = new DummyCreation(new DummyAdapter());

  it("should not include default clause when default is null", async () => {
    const columnDef = new ColumnDefinition("title", "string", { limit: 20 });
    expect(await viz.accept(columnDef)).toBe("title varchar(20)");
  });

  it("should include default clause when default is present", async () => {
    const columnDef = new ColumnDefinition("title", "string", { limit: 20, default: "Hello" });
    expect(await viz.accept(columnDef)).toBe("title varchar(20) DEFAULT 'Hello'");
  });

  it("should specify not null if null option is false", async () => {
    const columnDef = new ColumnDefinition("title", "string", {
      limit: 20,
      default: "Hello",
      null: false,
    });
    expect(await viz.accept(columnDef)).toBe("title varchar(20) DEFAULT 'Hello' NOT NULL");
  });
});
