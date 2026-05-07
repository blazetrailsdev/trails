import { describe, it } from "vitest";

describe("TableMetadataTest", () => {
  it.skip("#associated_table creates the right type caster for joined table with different association name", () => {
    // BLOCKED: schema — TableMetadata feature gap
    // ROOT-CAUSE: table-metadata.ts#TableMetadata not fully implementing column/binding metadata
    // SCOPE: ~20 LOC fix in table-metadata.ts; affects ~1 test in table-metadata.test.ts
  });
});
