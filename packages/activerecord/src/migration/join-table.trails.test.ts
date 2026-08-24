import { describe, it, expect } from "vitest";
import { findJoinTableName, joinTableName } from "./join-table.js";

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
});
