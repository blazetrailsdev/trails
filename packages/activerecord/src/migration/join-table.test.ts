import { describe, it, expect } from "vitest";
import { findJoinTableName, joinTableName } from "./join-table.js";
import { deriveJoinTableName } from "../model-schema.js";

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

describe("JoinTable#joinTableName duplication guard", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["assemblies", "parts"],
    ["parts", "assemblies"],
    ["catalog_categories", "catalog_products"],
    ["users", "roles"],
    ["music_artists", "music_records"],
    ["music.artists", "music.records"],
    ["public.users", "posts"],
  ];

  it.each(cases)("matches deriveJoinTableName for (%s, %s)", (table1, table2) => {
    expect(joinTableName(table1, table2)).toBe(deriveJoinTableName(table1, table2));
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
