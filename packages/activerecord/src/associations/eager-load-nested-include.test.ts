import { describe, it } from "vitest";

describe("EagerLoadPolyAssocsTest", () => {
  it.skip("include query", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager-load-nested-include.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager-load-nested-include.test.ts
  });
});

describe("EagerLoadNestedIncludeWithMissingDataTest", () => {
  it.skip("missing data in a nested include should not cause errors when constructing objects", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager-load-nested-include.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager-load-nested-include.test.ts
  });
});
