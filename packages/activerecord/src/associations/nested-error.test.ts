import { describe, it } from "vitest";

describe("AssociationsNestedErrorInAssociationOrderTest", () => {
  it.skip("index in association order", () => {
    // BLOCKED: Phase G — error indexing requires in-memory nested attribute
    // records built at assignment time; trails defers nested attribute processing
    // to save. Also needs index_errors association option and NestedError class.
  });
});

describe("AssociationsNestedErrorInNestedAttributesOrderTest", () => {
  it.skip("index in nested attributes order", () => {
    // BLOCKED: Phase G — error indexing requires in-memory nested attribute
    // records built at assignment time; trails defers nested attribute processing
    // to save. Also needs index_errors association option and NestedError class.
  });

  it.skip("index unaffected by reject_if", () => {
    // BLOCKED: Phase G — error indexing requires in-memory nested attribute
    // records built at assignment time; trails defers nested attribute processing
    // to save. Also needs index_errors association option and NestedError class.
  });

  describe("AssociationsNestedErrorWithSingularAssociationTest", () => {
    it.skip("no index when singular association", () => {
      // BLOCKED: Phase G — error indexing requires in-memory nested attribute
      // records built at assignment time; trails defers nested attribute processing
      // to save. Also needs index_errors association option and NestedError class.
    });
  });
});
