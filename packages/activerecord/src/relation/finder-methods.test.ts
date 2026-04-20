/**
 * Focused tests for the FinderMethods shared id-normalization and
 * not-found helpers (`normalizeFindArgs`, `raiseNotFoundAll`,
 * `raiseNotFoundSingle`). The behavior is exercised transitively
 * through `Relation.find` / `CollectionProxy#find`,
 * but the normalizer's branch matrix (scalar / tuple / variadic /
 * flatten / composite arity / empty) is easier to pin here.
 */

import { describe, it, expect } from "vitest";
import { normalizeFindArgs, raiseNotFoundAll, raiseNotFoundSingle } from "./finder-methods.js";
import { RecordNotFound } from "../errors.js";

describe("normalizeFindArgs — simple primary key", () => {
  const pk = "id";

  it("find(1) → single scalar, not wantArray", () => {
    expect(normalizeFindArgs("Post", pk, [1])).toEqual({
      ids: [1],
      wantArray: false,
      tuples: null,
    });
  });

  it("find(1, 2, 3) → list of scalars, wantArray", () => {
    expect(normalizeFindArgs("Post", pk, [1, 2, 3])).toEqual({
      ids: [1, 2, 3],
      wantArray: true,
      tuples: null,
    });
  });

  it("find([1, 2]) → flattened list of scalars, wantArray", () => {
    expect(normalizeFindArgs("Post", pk, [[1, 2]])).toEqual({
      ids: [1, 2],
      wantArray: true,
      tuples: null,
    });
  });

  it("find([[1, 2]]) → recursively flattened (Rails Array#flatten semantics)", () => {
    expect(normalizeFindArgs("Post", pk, [[[1, 2]]])).toEqual({
      ids: [1, 2],
      wantArray: true,
      tuples: null,
    });
  });

  it("find([1, 2], 3) → flat scalar list via variadic", () => {
    expect(normalizeFindArgs("Post", pk, [[1, 2], 3])).toEqual({
      ids: [1, 2, 3],
      wantArray: true,
      tuples: null,
    });
  });

  it("find() → RecordNotFound with empty-list shape", () => {
    try {
      normalizeFindArgs("Post", pk, []);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RecordNotFound);
      const err = e as RecordNotFound;
      expect(err.message).toBe("Couldn't find Post with an empty list of ids");
      expect(err.model).toBe("Post");
      expect(err.primaryKey).toBe("id");
      expect(err.id).toEqual([]);
    }
  });

  it("find([]) → RecordNotFound with empty-list shape", () => {
    expect(() => normalizeFindArgs("Post", pk, [[]])).toThrow(RecordNotFound);
    expect(() => normalizeFindArgs("Post", pk, [[]])).toThrow(/empty list of ids/);
  });
});

describe("normalizeFindArgs — composite primary key", () => {
  const pk = ["shop_id", "id"];

  it("find([1, 2]) on [shop_id, id] → single tuple", () => {
    expect(normalizeFindArgs("Order", pk, [[1, 2]])).toEqual({
      ids: [[1, 2]],
      wantArray: false,
      tuples: [[1, 2]],
    });
  });

  it("find(1, 2) on 2-arity PK → single tuple via variadic", () => {
    expect(normalizeFindArgs("Order", pk, [1, 2])).toEqual({
      ids: [[1, 2]],
      wantArray: false,
      tuples: [[1, 2]],
    });
  });

  it("find([[1, 2], [3, 4]]) → list of tuples", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [
          [1, 2],
          [3, 4],
        ],
      ]),
    ).toEqual({
      ids: [
        [1, 2],
        [3, 4],
      ],
      wantArray: true,
      tuples: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it("find([1, 2], [3, 4]) → list of tuples via variadic", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [1, 2],
        [3, 4],
      ]),
    ).toEqual({
      ids: [
        [1, 2],
        [3, 4],
      ],
      wantArray: true,
      tuples: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it("find(1) on composite PK → RecordNotFound with arity message", () => {
    try {
      normalizeFindArgs("Order", pk, [1]);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RecordNotFound);
      const err = e as RecordNotFound;
      expect(err.message).toBe("Order: composite primary key requires a 2-element array, got 1");
      expect(err.model).toBe("Order");
      expect(err.primaryKey).toBe("shop_id,id");
      expect(err.id).toBe(1);
    }
  });

  it("find(1, 2, 3) on 2-arity PK → arity error with the whole tuple", () => {
    try {
      normalizeFindArgs("Order", pk, [1, 2, 3]);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe(
        "Order: composite primary key requires a 2-element array, got 1,2,3",
      );
      expect(err.id).toEqual([1, 2, 3]);
    }
  });

  it("find([1, 2, 3]) on 2-arity PK → arity error with the whole tuple", () => {
    try {
      normalizeFindArgs("Order", pk, [[1, 2, 3]]);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe(
        "Order: composite primary key requires a 2-element array, got 1,2,3",
      );
      expect(err.id).toEqual([1, 2, 3]);
    }
  });

  it("find() → empty-list shape, same as simple PK", () => {
    expect(() => normalizeFindArgs("Order", pk, [])).toThrow(/empty list of ids/);
  });
});

describe("raiseNotFoundAll", () => {
  it("simple PK: flatIds.join(', ') + flatIds payload", () => {
    const normalized = { ids: [1, 2, 3], wantArray: true, tuples: null };
    try {
      raiseNotFoundAll("Post", "id", normalized);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe("Couldn't find all Post with 'id': (1, 2, 3)");
      expect(err.id).toEqual([1, 2, 3]);
    }
  });

  it("composite: String(tuples) (comma, no space) + tuples payload", () => {
    const normalized = {
      ids: [
        [1, 2],
        [3, 4],
      ],
      wantArray: true,
      tuples: [
        [1, 2],
        [3, 4],
      ],
    };
    try {
      raiseNotFoundAll("Order", ["shop_id", "id"], normalized);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe("Couldn't find all Order with 'shop_id,id': (1,2,3,4)");
      expect(err.id).toEqual([
        [1, 2],
        [3, 4],
      ]);
    }
  });
});

describe("raiseNotFoundSingle", () => {
  it("matches Relation.performFind's single-id message", () => {
    try {
      raiseNotFoundSingle("Post", "id", 42);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe("Couldn't find Post with 'id'=42");
      expect(err.model).toBe("Post");
      expect(err.primaryKey).toBe("id");
      expect(err.id).toBe(42);
    }
  });
});
