import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
import { ColumnDefinition } from "./connection-adapters/abstract/schema-definitions.js";

describe("ColumnDefinitionTest", () => {
  const sc = new SchemaCreation("sqlite");

  it("should not include default clause when default is null", () => {
    const col = new ColumnDefinition("title", "string", { limit: 20 });
    expect(sc.accept(col)).not.toContain("DEFAULT");
  });
  it("should include default clause when default is present", () => {
    const col = new ColumnDefinition("title", "string", { limit: 20, default: "Hello" });
    expect(sc.accept(col)).toContain("DEFAULT 'Hello'");
  });
  it("should specify not null if null option is false", () => {
    const col = new ColumnDefinition("title", "string", {
      limit: 20,
      default: "Hello",
      null: false,
    });
    const sql = sc.accept(col);
    expect(sql).toContain("DEFAULT 'Hello'");
    expect(sql).toContain("NOT NULL");
  });
});
