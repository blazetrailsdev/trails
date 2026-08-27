import { describe, it, expect } from "vitest";
import { findJoinTableName, joinTableName } from "./join-table.js";
import { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";

describe("JoinTable#joinTableName", () => {
  it("sorts table names alphabetically", () => {
    expect(joinTableName("assemblies", "parts")).toBe("assemblies_parts");
    expect(joinTableName("parts", "assemblies")).toBe("assemblies_parts");
  });

  it("deduplicates common prefix", () => {
    expect(joinTableName("catalog_categories", "catalog_products")).toBe(
      "catalog_categories_products",
    );
  });

  it("handles plain names without common prefix", () => {
    expect(joinTableName("users", "roles")).toBe("roles_users");
  });
});

describe("JoinTable#findJoinTableName", () => {
  it("uses options.tableName when provided", () => {
    expect(findJoinTableName("assemblies", "parts", { tableName: "custom" })).toBe("custom");
  });

  it("falls back to joinTableName", () => {
    expect(findJoinTableName("assemblies", "parts")).toBe("assemblies_parts");
  });

  it("deletes tableName from the hash it is given", () => {
    // join_table.rb:7-9 is `options.delete(:table_name)`, which REMOVES the key
    // so the caller can splat the rest into create_table/drop_table.
    const options: { tableName?: string; ifExists?: boolean } = {
      tableName: "custom",
      ifExists: true,
    };
    expect(findJoinTableName("assemblies", "parts", options)).toBe("custom");
    expect(options).toEqual({ ifExists: true });
  });
});

describe("SchemaStatements#dropJoinTable", () => {
  it("does not delete tableName from the caller's options", async () => {
    // Ruby's `**options` (schema_statements.rb:427) collects a fresh hash, so
    // `find_join_table_name`'s delete never reaches the caller's — verified
    // against MRI. A TS object is passed by reference, so `dropJoinTable` has
    // to copy before handing it over.
    const dropped: Array<[string, unknown]> = [];
    const adapter = {
      findJoinTableName,
      dropTable: async (name: string, options: unknown) => {
        dropped.push([name, options]);
      },
      dropJoinTable: SchemaStatements.prototype.dropJoinTable,
    };

    const options = { tableName: "custom", ifExists: true };
    await adapter.dropJoinTable("assemblies", "parts", options);

    expect(dropped).toEqual([["custom", { ifExists: true }]]);
    expect(options).toEqual({ tableName: "custom", ifExists: true });
  });
});
