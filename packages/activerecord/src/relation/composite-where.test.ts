/**
 * Composite-key WHERE: `Relation#where(cols, tuples)` and the
 * underlying `PredicateBuilder.buildComposite(cols, tuples)`.
 *
 * Rails uses `where({[col1, col2] => [[v1, v2], ...]})` for
 * composite-key matching, routing through PredicateBuilder. JS object
 * keys can't be arrays, so we expose the same shape as a positional
 * overload — `where(['c1', 'c2'], [[v1a, v1b], ...])` — and a
 * matching `PredicateBuilder.buildComposite` method.
 *
 * Mirrors: ActiveRecord predicate-builder composite-key handling.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("Relation#where — composite-key form", () => {
  let adapter: DatabaseAdapter;

  class CompOrder extends Base {
    static {
      this._tableName = "comp_orders";
      this.primaryKey = ["shop_id", "order_number"];
      this.attribute("shop_id", "integer");
      this.attribute("order_number", "integer");
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CompOrder.adapter = adapter;
    // No registerModel() — this test only exercises where /
    // whereNot / PredicateBuilder directly; nothing resolves
    // associations through the global modelRegistry. Skipping
    // registration also avoids the stale-entry leak across the
    // suite that registerModel would otherwise create.
  });

  it("compiles `where(['c1','c2'], [[v1a,v1b], [v2a,v2b]])` to OR-of-AND of column equalities", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "match-1" });
    await CompOrder.create({ shop_id: 2, order_number: 200, name: "match-2" });
    await CompOrder.create({ shop_id: 1, order_number: 999, name: "no-match" });

    const matched = await (CompOrder as any)
      .where(
        ["shop_id", "order_number"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.name).sort()).toEqual(["match-1", "match-2"]);
  });

  it("returns no rows when all tuples are filtered (empty after null-strip → none())", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "exists" });
    const matched = await (CompOrder as any)
      .where(
        ["shop_id", "order_number"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched).toEqual([]);
  });

  it("filters null/undefined-bearing tuples instead of emitting IS NULL (SQL tuple-equality semantics)", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "valid" });
    await CompOrder.create({ shop_id: 2, order_number: 200, name: "also-valid" });
    // [1, null] is filtered out; [2, 200] remains.
    const matched = await (CompOrder as any)
      .where(
        ["shop_id", "order_number"],
        [
          [1, null],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.name)).toEqual(["also-valid"]);
  });

  it("single-column case (cols.length === 1) still works (degenerate composite)", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "a" });
    await CompOrder.create({ shop_id: 1, order_number: 200, name: "b" });
    const matched = await (CompOrder as any).where(["shop_id"], [[1]]).toArray();
    expect(matched.map((r: any) => r.name).sort()).toEqual(["a", "b"]);
  });

  it("PredicateBuilder.buildComposite returns null on empty input (caller short-circuits with none())", async () => {
    const rel = (CompOrder as any).all();
    const node = rel.predicateBuilder.buildComposite(["shop_id", "order_number"], []);
    expect(node).toBeNull();
  });

  it("PredicateBuilder.buildComposite throws on empty column list", () => {
    const rel = (CompOrder as any).all();
    expect(() => rel.predicateBuilder.buildComposite([], [[1, 2]])).toThrow(/empty column list/);
  });

  it("PredicateBuilder.buildComposite throws on tuple arity mismatch (caller bug, not silent filter)", () => {
    const rel = (CompOrder as any).all();
    expect(() => rel.predicateBuilder.buildComposite(["shop_id", "order_number"], [[1]])).toThrow(
      /tuple arity 1 does not match column count 2/,
    );
  });

  it("PredicateBuilder.buildComposite throws on non-array tuple", () => {
    const rel = (CompOrder as any).all();
    expect(() =>
      rel.predicateBuilder.buildComposite(
        ["shop_id", "order_number"],
        [42 as unknown as unknown[]],
      ),
    ).toThrow(/tuple must be an array/);
  });

  it("PredicateBuilder.buildComposite throws ArgumentError when tuples itself is not an array (null/object)", () => {
    const rel = (CompOrder as any).all();
    expect(() =>
      rel.predicateBuilder.buildComposite(["shop_id"], null as unknown as unknown[][]),
    ).toThrow(/tuples must be an array, got null/);
    expect(() =>
      rel.predicateBuilder.buildComposite(["shop_id"], { 0: [1] } as unknown as unknown[][]),
    ).toThrow(/tuples must be an array, got object/);
  });

  it("composite predicate values flow through QueryAttribute (bind params, not inlined Casted)", () => {
    // Regression: an earlier draft used `attribute.eq(rawValue)`,
    // which wraps as Arel::Nodes::Casted and inlines values into SQL.
    // That breaks compileWithBinds / prepared-statement caching.
    // Switching to buildBindAttribute makes each value a
    // QueryAttribute → BindParam at SQL emission. Inspect the node
    // tree: the AND's right-hand sides should be QueryAttribute
    // instances (carrying `name` / `type`), not raw literals or
    // Casted nodes.
    const rel = (CompOrder as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["shop_id", "order_number"], [[1, 100]]);
    // Single-tuple path returns Grouping(And([eq, eq])). Arel wraps
    // QueryAttribute in BindParam at `attribute.eq()`, so the Eq's
    // right-hand side is BindParam(QueryAttribute(name, value, type)).
    const and = node.expr;
    const firstEq = and.children[0];
    const rhs = firstEq.right;
    expect(rhs?.constructor?.name).toBe("BindParam");
    expect(rhs?.value?.name).toBe("shop_id");
    expect(rhs?.value?.constructor?.name).toBe("QueryAttribute");
  });

  it("single-column composite uses IN(...) (not OR-chain) for compactness", () => {
    const rel = (CompOrder as any).all();
    const node = rel.predicateBuilder.buildComposite(["shop_id"], [[1], [2], [3]]);
    // The Arel In node renders as `shop_id IN (1, 2, 3)`; OR-chain
    // would render as `shop_id = 1 OR shop_id = 2 OR shop_id = 3`.
    const sql = (CompOrder as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2,\s*3\)/);
    expect(sql).not.toMatch(/OR/);
  });

  it("Relation#where(cols) without tuples arg throws a clear error", () => {
    expect(() => (CompOrder as any).all().where(["shop_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Relation#whereNot(cols) without tuples arg throws a clear error", () => {
    expect(() => (CompOrder as any).all().whereNot(["shop_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Base.where(cols) without tuples arg throws a clear error", () => {
    expect(() => (CompOrder as any).where(["shop_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Base.whereNot(cols, tuples) routes through Relation#whereNot composite form", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "exclude" });
    await CompOrder.create({ shop_id: 2, order_number: 200, name: "keep" });
    const matched = await (CompOrder as any)
      .whereNot(["shop_id", "order_number"], [[1, 100]])
      .toArray();
    expect(matched.map((r: any) => r.name)).toEqual(["keep"]);
  });

  it("Base.whereNot(cols) without tuples arg throws a clear ArgumentError", () => {
    expect(() => (CompOrder as any).whereNot(["shop_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("whereNot(cols, tuples) negates the OR-of-AND grouping", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "exclude-me" });
    await CompOrder.create({ shop_id: 2, order_number: 200, name: "exclude-me-2" });
    await CompOrder.create({ shop_id: 3, order_number: 300, name: "keep" });

    const matched = await (CompOrder as any)
      .all()
      .whereNot(
        ["shop_id", "order_number"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.name)).toEqual(["keep"]);
  });

  it("whereNot(cols, tuples) on all-filtered tuples is a no-op (matches Rails' empty-hash behavior)", async () => {
    await CompOrder.create({ shop_id: 1, order_number: 100, name: "a" });
    await CompOrder.create({ shop_id: 2, order_number: 200, name: "b" });
    // All tuples have a null component → filtered out → no predicate
    // added → all rows returned.
    const matched = await (CompOrder as any)
      .all()
      .whereNot(
        ["shop_id", "order_number"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.name).sort()).toEqual(["a", "b"]);
  });
});
