import { describe, it, expect, vi } from "vitest";
import {
  normalizeFindArgs,
  raiseNotFoundAll,
  raiseNotFoundSingle,
  findOne,
  findSome,
  findSomeOrdered,
  findTake,
  findTakeWithLimit,
  raiseRecordNotFoundExceptionBang,
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

  it("normalizeFindArgs zero-arg → RecordNotFound 'without an ID' shape", () => {
    try {
      normalizeFindArgs("Post", pk, []);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RecordNotFound);
      const err = e as RecordNotFound;
      expect(err.message).toBe("Couldn't find Post without an ID");
      expect(err.model).toBe("Post");
      expect(err.primaryKey).toBe("id");
    }
  });

  it("find([]) → empty-array short-circuit (no RecordNotFound)", () => {
    expect(normalizeFindArgs("Post", pk, [[]])).toEqual({
      ids: [],
      wantArray: true,
      tuples: null,
      emptyArray: true,
    });
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

  it("find([[1, 2], [1, 2]]) → uniq'd to a single tuple", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [
          [1, 2],
          [1, 2],
        ],
      ]),
    ).toEqual({
      ids: [[1, 2]],
      wantArray: true,
      tuples: [[1, 2]],
    });
  });

  it("find([1, 2], [1, 2]) via variadic → uniq'd to a single tuple, unwrapped", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [1, 2],
        [1, 2],
      ]),
    ).toEqual({
      ids: [[1, 2]],
      wantArray: false,
      tuples: [[1, 2]],
    });
  });

  it("find([[1, 2], null, [3, 4]]) → nil outer entry dropped by compact", () => {
    expect(normalizeFindArgs("Order", pk, [[[1, 2], null, [3, 4]]])).toEqual({
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

  it("find([[1n, 2], [1, 2]]) → bigint/number components fold, tuple uniq'd", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [
          [1n, 2],
          [1, 2],
        ],
      ]),
    ).toEqual({
      ids: [[1n, 2]],
      wantArray: true,
      tuples: [[1n, 2]],
    });
  });

  it("find([[1, null], [1, null]]) → nil components preserved, tuple uniq'd", () => {
    expect(
      normalizeFindArgs("Order", pk, [
        [
          [1, null],
          [1, null],
        ],
      ]),
    ).toEqual({
      ids: [[1, null]],
      wantArray: true,
      tuples: [[1, null]],
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

  it("find() → without-an-ID shape, same as simple PK", () => {
    expect(() => normalizeFindArgs("Order", pk, [])).toThrow(/without an ID/);
  });
});

describe("raiseNotFoundAll", () => {
  it("simple PK: pluralized name + found/expected suffix + flatIds payload", () => {
    const normalized = { ids: [1, 2, 3], wantArray: true, tuples: null };
    try {
      raiseNotFoundAll("Post", "id", normalized, 2, 3);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe(
        "Couldn't find all Posts with 'id': (1, 2, 3) (found 2 results, but was looking for 3).",
      );
      expect(err.id).toEqual([1, 2, 3]);
    }
  });

  it("composite: String(tuples) (comma, no space) + suffix + tuples payload", () => {
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
      raiseNotFoundAll("Order", ["shop_id", "id"], normalized, 1, 2);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err.message).toBe(
        "Couldn't find all Orders with 'shop_id,id': (1,2,3,4) (found 1 results, but was looking for 2).",
      );
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

const postModelStub = {
  primaryKey: "id",
  name: "Post",
  typeForAttribute: (_col: string) => ({ cast: (v: unknown) => v }),
  arelTable: { get: (col: string) => col },
};

const carModelStub = { name: "Car", primaryKey: "id" };

const mercedesModelStub = {
  name: "MercedesCar",
  primaryKey: "name",
  typeForAttribute: (_col: string) => ({ cast: (v: unknown) => v }),
  arelTable: { get: (col: string) => col },
};

function makeFindSomeRel(
  records: any[],
  opts: { limit?: number; offset?: number; ordered?: boolean } = {},
): any {
  return {
    _model: postModelStub,
    model: postModelStub,
    table: postModelStub.arelTable,
    primaryKey: postModelStub.primaryKey,
    limitValue: opts.limit ?? null,
    offsetValue: opts.offset ?? null,
    orderValues: opts.ordered !== false ? ["id ASC"] : [],
    selectValues: [],
    raiseRecordNotFoundExceptionBang,
    whereClause: { isEmpty: () => true },
    findSomeOrdered(ids: unknown[]) {
      return findSomeOrdered.call(this, ids);
    },
    except(..._skips: string[]) {
      return this;
    },
    where(_cond: any) {
      const rel: any = {
        toArray: async () => records,
        records: async () => records,
        select: () => rel,
      };
      return rel;
    },
  };
}

describe("findSome — expected_size respects limit and offset", () => {
  it("succeeds when result count equals ids.length with no limit/offset", async () => {
    const rel = makeFindSomeRel([{ id: 1 }, { id: 2 }]);
    const result = await findSome.call(rel, [1, 2]);
    expect(result).toHaveLength(2);
  });

  it("succeeds when limit clips expected_size and result matches limit", async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const rel = makeFindSomeRel(rows, { limit: 3 });
    const result = await findSome.call(rel, [1, 2, 3, 4, 5]);
    expect(result).toHaveLength(3);
  });

  it("succeeds when offset + limit produce expected_size=2 from 11 ids", async () => {
    const rows = [{ id: 10 }, { id: 11 }];
    const rel = makeFindSomeRel(rows, { limit: 3, offset: 9 });
    const result = await findSome.call(rel, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(result).toHaveLength(2);
  });

  it("throws when result count mismatches expected_size", async () => {
    const rel = makeFindSomeRel([{ id: 1 }]);
    await expect(findSome.call(rel, [1, 2])).rejects.toBeInstanceOf(RecordNotFound);
  });
});

describe("findSome — narrows to pk column when select_values non-empty (ordered path)", () => {
  it("calls .select(pk) when the relation has select values", async () => {
    let selectedCol: string | undefined;
    const rel: any = {
      _model: postModelStub,
      model: postModelStub,
      table: postModelStub.arelTable,
      primaryKey: postModelStub.primaryKey,
      limitValue: null,
      offsetValue: null,
      orderValues: ["id ASC"],
      selectValues: ["title"],
      where(_cond: any) {
        const inner: any = {
          toArray: async () => [{ id: 1 }],
          select(col: string) {
            selectedCol = col;
            return inner;
          },
        };
        return inner;
      },
    };
    await findSome.call(rel, [1]);
    expect(selectedCol).toBe("id");
  });
});

describe("findSome — dispatches to findSomeOrdered when relation has no order values", () => {
  it("returns records in requested id order for an unordered relation", async () => {
    const dbRows = [{ id: 3 }, { id: 5 }, { id: 1 }];
    const rel = makeFindSomeRel(dbRows, { ordered: false });
    const result = await findSome.call(rel, [5, 1, 3]);
    expect(result.map((r: any) => r.id)).toEqual([5, 1, 3]);
  });
});

function makeFindSomeOrderedRel(
  records: any[],
  opts: { limit?: number; offset?: number } = {},
): any {
  return {
    _model: postModelStub,
    model: postModelStub,
    table: postModelStub.arelTable,
    primaryKey: postModelStub.primaryKey,
    limitValue: opts.limit ?? null,
    offsetValue: opts.offset ?? null,
    orderValues: [],
    selectValues: [],
    raiseRecordNotFoundExceptionBang,
    whereClause: { isEmpty: () => true },
    except(..._skips: string[]) {
      return this;
    },
    where(_cond: any) {
      const rel: any = {
        toArray: async () => records,
        records: async () => records,
        select: () => rel,
      };
      return rel;
    },
  };
}

describe("findSomeOrdered — slices ids by offset and limit before querying", () => {
  it("returns records in requested id order with no limit/offset", async () => {
    const dbRows = [{ id: 3 }, { id: 1 }, { id: 5 }];
    const rel = makeFindSomeOrderedRel(dbRows);
    const result = await findSomeOrdered.call(rel, [5, 1, 3]);
    expect(result.map((r: any) => r.id)).toEqual([5, 1, 3]);
  });

  it("slices to first limit ids when limit is set", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    const dbRows = ids.slice(0, 10).map((id) => ({ id }));
    let queriedIds: unknown[] | undefined;
    const rel = {
      ...makeFindSomeOrderedRel(dbRows, { limit: 10 }),
      where(cond: any) {
        queriedIds = cond["id"];
        const r: any = {
          toArray: async () => dbRows,
          records: async () => dbRows,
          select: () => r,
        };
        return r;
      },
    };
    const result = await findSomeOrdered.call(rel, ids);
    expect(queriedIds).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(1);
  });

  it("slices ids by offset and limit (11 ids, limit 3, offset 9 → 2 records)", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    const dbRows = [{ id: 11 }, { id: 10 }];
    let queriedIds: unknown[] | undefined;
    const rel = {
      ...makeFindSomeOrderedRel(dbRows, { limit: 3, offset: 9 }),
      where(cond: any) {
        queriedIds = cond["id"];
        const r: any = {
          toArray: async () => dbRows,
          records: async () => dbRows,
          select: () => r,
        };
        return r;
      },
    };
    const result = await findSomeOrdered.call(rel, ids);
    expect(queriedIds).toEqual([10, 11]);
    expect(result.map((r: any) => r.id)).toEqual([10, 11]);
  });

  it("throws when DB returns fewer records than sliced ids", async () => {
    const rel = makeFindSomeOrderedRel([{ id: 1 }], { limit: 3 });
    await expect(findSomeOrdered.call(rel, [1, 2, 3])).rejects.toBeInstanceOf(RecordNotFound);
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
          records: async () => dbRows,
          select(col: unknown) {
            selectArg = col;
            return inner;
          },
        };
        return inner;
      },
    };
    const result = await findSomeOrdered.call(rel, [1, 2]);
    expect(selectArg).toBe("id");
    expect(result.map((r: any) => r.id)).toEqual([1, 2]);
  });
});

function makeLoadedRel(records: any[]): any {
  return {
    isLoaded: true,
    records: async () => records,
    limit: (_n: number) => ({
      records: async () => records.slice(0, _n),
      toArray: async () => records.slice(0, _n),
    }),
  };
}

describe("findTake — returns first record from loaded relation without querying", () => {
  it("returns first record when loaded", async () => {
    const rel = makeLoadedRel([{ id: 1 }, { id: 2 }]);
    const spy = vi.spyOn(rel, "limit");
    const result = await findTake.call(rel);
    expect(result).toEqual({ id: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null from empty loaded relation", async () => {
    const rel = makeLoadedRel([]);
    const result = await findTake.call(rel);
    expect(result).toBeNull();
  });
});

describe("findTakeWithLimit — slices loaded relation without querying", () => {
  it("returns first N records when loaded", async () => {
    const rel = makeLoadedRel([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const spy = vi.spyOn(rel, "limit");
    const result = await findTakeWithLimit.call(rel, 2);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(spy).not.toHaveBeenCalled();
  });
});

function makeRelForOrder(mc: {
  primaryKey?: string | string[];
  implicitOrderColumn?: string | null;
  _queryConstraintsList?: string[] | null;
}): any {
  return { _model: mc, model: mc, primaryKey: mc.primaryKey };
}

describe("_orderColumns — Rails _order_columns precedence", () => {
  it("returns [pk] when no implicit_order_column or query_constraints_list", () => {
    const rel = makeRelForOrder({ primaryKey: "id" });
    expect(_orderColumns.call(rel)).toEqual(["id"]);
  });

  it("puts implicit_order_column first, then pk", () => {
    const rel = makeRelForOrder({ primaryKey: "id", implicitOrderColumn: "created_at" });
    expect(_orderColumns.call(rel)).toEqual(["created_at", "id"]);
  });

  it("deduplicates when implicit_order_column equals pk", () => {
    const rel = makeRelForOrder({ primaryKey: "id", implicitOrderColumn: "id" });
    expect(_orderColumns.call(rel)).toEqual(["id"]);
  });

  it("uses _queryConstraintsList instead of pk when set", () => {
    const rel = makeRelForOrder({ primaryKey: "id", _queryConstraintsList: ["shop_id", "id"] });
    expect(_orderColumns.call(rel)).toEqual(["shop_id", "id"]);
  });

  it("puts implicit_order_column before _queryConstraintsList", () => {
    const rel = makeRelForOrder({
      primaryKey: "id",
      implicitOrderColumn: "created_at",
      _queryConstraintsList: ["shop_id", "id"],
    });
    expect(_orderColumns.call(rel)).toEqual(["created_at", "shop_id", "id"]);
  });
});

describe("finder not-found message fidelity", () => {
  it("test_find_one_message_on_primary_key", async () => {
    const rel: any = {
      _model: carModelStub,
      model: carModelStub,
      primaryKey: carModelStub.primaryKey,
      raiseRecordNotFoundExceptionBang,
      whereClause: { isEmpty: () => true },
      where: () => ({ take: async () => null }),
    };
    try {
      await findOne.call(rel, 0);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err).toBeInstanceOf(RecordNotFound);
      expect(err.message).toBe("Couldn't find Car with 'id'=0");
      expect(err.id).toBe(0);
      expect(err.primaryKey).toBe("id");
      expect(err.model).toBe("Car");
    }
  });

  it("test_find_some_message_with_custom_primary_key", async () => {
    const rel: any = {
      _model: mercedesModelStub,
      model: mercedesModelStub,
      primaryKey: mercedesModelStub.primaryKey,
      limitValue: null,
      offsetValue: null,
      selectValues: [],
      raiseRecordNotFoundExceptionBang,
      whereClause: { isEmpty: () => true },
      except(..._skips: string[]) {
        return this;
      },
      where(_cond: any) {
        const inner: any = {
          toArray: async () => [],
          records: async () => [],
          select: () => inner,
        };
        return inner;
      },
    };
    try {
      await findSomeOrdered.call(rel, ["Hello", "World!"]);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err).toBeInstanceOf(RecordNotFound);
      expect(err.message).toBe(
        "Couldn't find all MercedesCars with 'name': (Hello, World!) (found 0 results, but was looking for 2).",
      );
      expect(err.model).toBe("MercedesCar");
      expect(err.primaryKey).toBe("name");
    }
  });
});
