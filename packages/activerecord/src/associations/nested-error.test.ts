import { describe, it } from "vitest";

describe("AssociationsNestedErrorInAssociationOrderTest", () => {
  it.skip("index in association order", () => {
    // BLOCKED: associations — nested-attributes feature gap
    // ROOT-CAUSE: associations/nested-error.ts or preloader.ts missing nested-attributes semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in nested-error.test.ts
    /* needs NestedError class and index_errors support */
  });
});

describe("AssociationsNestedErrorInNestedAttributesOrderTest", () => {
  it.skip("index in nested attributes order", () => {
    // BLOCKED: associations — nested-attributes feature gap
    // ROOT-CAUSE: associations/nested-error.ts or preloader.ts missing nested-attributes semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in nested-error.test.ts
    /* needs NestedError class and index_errors support */
  });

  it.skip("index unaffected by reject_if", () => {
    // BLOCKED: associations — nested-attributes feature gap
    // ROOT-CAUSE: associations/nested-error.ts or preloader.ts missing nested-attributes semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in nested-error.test.ts
    /* needs NestedError class and index_errors support */
  });

  describe("AssociationsNestedErrorWithSingularAssociationTest", () => {
    it.skip("no index when singular association", () => {
      // BLOCKED: associations — nested-attributes feature gap
      // ROOT-CAUSE: associations/nested-error.ts or preloader.ts missing nested-attributes semantics
      // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in nested-error.test.ts
    });
  });
});
