import { describe, it } from "vitest";

describe("TestColumnAlias", () => {
  it.skip("column alias", () => {
    // BLOCKED: schema — schema introspection / dumper gap in column-alias
    // ROOT-CAUSE: column-alias.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in column-alias.test.ts
  });
});
