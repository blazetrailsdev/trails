/**
 * Focused tests for the FinderMethods shared id-normalization and
 * not-found helpers (`normalizeFindArgs`, `raiseNotFoundAll`,
 * `raiseNotFoundSingle`). The behavior is exercised transitively
 * through `Relation.find` / `CollectionProxy#find`,
 * but the normalizer's branch matrix (scalar / tuple / variadic /
 * flatten / composite arity / empty) is easier to pin here.
 */

import { describe, it, expect, vi } from "vitest";
import {
  normalizeFindArgs,
  raiseNotFoundAll,
  raiseNotFoundSingle,
  findSome,
  findSomeOrdered,
  findTake,
  findTakeWithLimit,
  _orderColumns,
} from "./finder-methods.js";
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

// ---------------------------------------------------------------------------
// findSome — expected_size accounting (Gap 1)
// ---------------------------------------------------------------------------

function makeFindSomeRel(
  records: any[],
  opts: { limit?: number; offset?: number; ordered?: boolean } = {},
): any {
  return {
    _modelClass: {
      primaryKey: "id",
      name: "Post",
      typeForAttribute: (_col: string) => ({ cast: (v: unknown) => v }),
      arelTable: { get: (col: string) => col },
    },
    _limitValue: opts.limit ?? null,
    _offsetValue: opts.offset ?? null,
    // ordered=true simulates a relation with ORDER BY (findSome stays in the accounting path)
    _orderClauses: opts.ordered !== false ? ["id ASC"] : [],
    _rawOrderClauses: [],
    selectValues: [],
    where(_cond: any) {
      const rel: any = { toArray: async () => records, select: () => rel };
      return rel;
    },
  };
}

describe("findSome — expected_size respects limit and offset", () => {
  it("succeeds when result count equals ids.length with no limit/offset", async () => {
    const rel = makeFindSomeRel([{ id: 1 }, { id: 2 }]);
    const result = await findSome(rel, [1, 2]);
    expect(result).toHaveLength(2);
  });

  it("succeeds when limit clips expected_size and result matches limit", async () => {
    // 5 ids, limit 3 → expected 3; DB returns 3 rows → no error
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const rel = makeFindSomeRel(rows, { limit: 3 });
    const result = await findSome(rel, [1, 2, 3, 4, 5]);
    expect(result).toHaveLength(3);
  });

  it("succeeds when offset + limit produce expected_size=2 from 11 ids", async () => {
    // 11 ids, limit 3, offset 9 → expected = min(3, 11-9) = 2
    const rows = [{ id: 10 }, { id: 11 }];
    const rel = makeFindSomeRel(rows, { limit: 3, offset: 9 });
    const result = await findSome(rel, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(result).toHaveLength(2);
  });

  it("throws when result count mismatches expected_size", async () => {
    const rel = makeFindSomeRel([{ id: 1 }]);
    await expect(findSome(rel, [1, 2])).rejects.toBeInstanceOf(RecordNotFound);
  });
});

// ---------------------------------------------------------------------------
// findSome → findSomeOrdered dispatch (Story I-followup gap 1)
// ---------------------------------------------------------------------------

describe("findSome — dispatches to findSomeOrdered when relation has no order values", () => {
  it("returns records in requested id order for an unordered relation", async () => {
    // DB returns them in arbitrary order; we expect [5, 1, 3] back
    const dbRows = [{ id: 3 }, { id: 5 }, { id: 1 }];
    const rel = makeFindSomeRel(dbRows, { ordered: false });
    const result = await findSome(rel, [5, 1, 3]);
    expect(result.map((r: any) => r.id)).toEqual([5, 1, 3]);
  });
});

// ---------------------------------------------------------------------------
// findSomeOrdered — id slicing by offset/limit + result ordering (Story I-followup gap 2)
// ---------------------------------------------------------------------------

function makeFindSomeOrderedRel(
  records: any[],
  opts: { limit?: number; offset?: number } = {},
): any {
  return {
    _modelClass: {
      primaryKey: "id",
      name: "Post",
      typeForAttribute: (_col: string) => ({ cast: (v: unknown) => v }),
      arelTable: { get: (col: string) => col },
    },
    _limitValue: opts.limit ?? null,
    _offsetValue: opts.offset ?? null,
    _orderClauses: [],
    _rawOrderClauses: [],
    selectValues: [],
    where(_cond: any) {
      const rel: any = { toArray: async () => records, select: () => rel };
      return rel;
    },
  };
}

describe("findSomeOrdered — slices ids by offset and limit before querying", () => {
  it("returns records in requested id order with no limit/offset", async () => {
    const dbRows = [{ id: 3 }, { id: 1 }, { id: 5 }];
    const rel = makeFindSomeOrderedRel(dbRows);
    const result = await findSomeOrdered(rel, [5, 1, 3]);
    expect(result.map((r: any) => r.id)).toEqual([5, 1, 3]);
  });

  it("slices to first limit ids when limit is set", async () => {
    // 50 ids requested but limit 10 → only first 10 ids are queried
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    const dbRows = ids.slice(0, 10).map((id) => ({ id }));
    let queriedIds: unknown[] | undefined;
    const rel = {
      ...makeFindSomeOrderedRel(dbRows, { limit: 10 }),
      where(cond: any) {
        queriedIds = cond["id"];
        const r: any = { toArray: async () => dbRows, select: () => r };
        return r;
      },
    };
    const result = await findSomeOrdered(rel, ids);
    expect(queriedIds).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(1);
  });

  it("slices ids by offset and limit (11 ids, limit 3, offset 9 → 2 records)", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    // ids.slice(9, 9+3) = [10, 11]
    const dbRows = [{ id: 11 }, { id: 10 }];
    let queriedIds: unknown[] | undefined;
    const rel = {
      ...makeFindSomeOrderedRel(dbRows, { limit: 3, offset: 9 }),
      where(cond: any) {
        queriedIds = cond["id"];
        const r: any = { toArray: async () => dbRows, select: () => r };
        return r;
      },
    };
    const result = await findSomeOrdered(rel, ids);
    expect(queriedIds).toEqual([10, 11]);
    expect(result.map((r: any) => r.id)).toEqual([10, 11]);
  });

  it("throws when DB returns fewer records than sliced ids", async () => {
    const rel = makeFindSomeOrderedRel([{ id: 1 }], { limit: 3 });
    await expect(findSomeOrdered(rel, [1, 2, 3])).rejects.toBeInstanceOf(RecordNotFound);
  });

  it("adds PK to select when selectValues are present", async () => {
    const dbRows = [{ id: 2 }, { id: 1 }];
    let selectArg: unknown;
    const rel = {
      ...makeFindSomeOrderedRel(dbRows),
      selectValues: ["name"],
      where(_cond: any) {
        const inner: any = {
          toArray: async () => dbRows,
          select(col: unknown) {
            selectArg = col;
            return inner;
          },
        };
        return inner;
      },
    };
    const result = await findSomeOrdered(rel, [1, 2]);
    expect(selectArg).toBe("id"); // arelTable.get("id") returns "id" in the mock
    expect(result.map((r: any) => r.id)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// findTake / findTakeWithLimit — loaded? fast-path (Gap 3)
// ---------------------------------------------------------------------------

function makeLoadedRel(records: any[]): any {
  return {
    _loaded: true,
    _records: records,
    limit: (_n: number) => ({ toArray: async () => records.slice(0, _n) }),
  };
}

describe("findTake — returns first record from loaded relation without querying", () => {
  it("returns first record when loaded", async () => {
    const rel = makeLoadedRel([{ id: 1 }, { id: 2 }]);
    const spy = vi.spyOn(rel, "limit");
    const result = await findTake(rel);
    expect(result).toEqual({ id: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null from empty loaded relation", async () => {
    const rel = makeLoadedRel([]);
    const result = await findTake(rel);
    expect(result).toBeNull();
  });
});

describe("findTakeWithLimit — slices loaded relation without querying", () => {
  it("returns first N records when loaded", async () => {
    const rel = makeLoadedRel([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const spy = vi.spyOn(rel, "limit");
    const result = await findTakeWithLimit(rel, 2);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// _orderColumns — implicit_order_column + query_constraints_list (Gap 2)
// ---------------------------------------------------------------------------

function makeRelForOrder(mc: {
  primaryKey?: string | string[];
  implicitOrderColumn?: string | null;
  _queryConstraintsList?: string[] | null;
}): any {
  return { _modelClass: mc };
}

describe("_orderColumns — Rails _order_columns precedence", () => {
  it("returns [pk] when no implicit_order_column or query_constraints_list", () => {
    const rel = makeRelForOrder({ primaryKey: "id" });
    expect(_orderColumns(rel)).toEqual(["id"]);
  });

  it("puts implicit_order_column first, then pk", () => {
    const rel = makeRelForOrder({ primaryKey: "id", implicitOrderColumn: "created_at" });
    expect(_orderColumns(rel)).toEqual(["created_at", "id"]);
  });

  it("deduplicates when implicit_order_column equals pk", () => {
    const rel = makeRelForOrder({ primaryKey: "id", implicitOrderColumn: "id" });
    expect(_orderColumns(rel)).toEqual(["id"]);
  });

  it("uses _queryConstraintsList instead of pk when set", () => {
    const rel = makeRelForOrder({ primaryKey: "id", _queryConstraintsList: ["shop_id", "id"] });
    expect(_orderColumns(rel)).toEqual(["shop_id", "id"]);
  });

  it("puts implicit_order_column before _queryConstraintsList", () => {
    const rel = makeRelForOrder({
      primaryKey: "id",
      implicitOrderColumn: "created_at",
      _queryConstraintsList: ["shop_id", "id"],
    });
    expect(_orderColumns(rel)).toEqual(["created_at", "shop_id", "id"]);
  });
});
