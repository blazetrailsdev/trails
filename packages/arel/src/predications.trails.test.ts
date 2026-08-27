import { describe, it, expect } from "vitest";
import { fakeRecordConnection, testConnection } from "./test-helpers/connection.js";
import { Temporal } from "@blazetrails/date";
import { Table, Nodes, Visitors } from "./index.js";

// The Enumerable-arm distinctions below are trails-only: in Ruby a Set, a Hash
// and a lazy enumerator are all simply `Enumerable`, so there is no Rails test
// to mirror. See attribute.trails.test.ts for the same coverage on Attribute.
describe("PredicationsMixin in/notIn Enumerable arm", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql(testConnection);
  const expr = () => users.get("bitmap").bitwiseAnd(16);

  describe("#in", () => {
    it("expands a Set through the Enumerable arm", () => {
      expect(visitor.compile(expr().in(new Set([1, 2, 3])))).toBe(
        '("users"."bitmap" & 16) IN (1, 2, 3)',
      );
    });

    it("expands a generator through the Enumerable arm", () => {
      function* ids(): Generator<number> {
        yield 1;
        yield 2;
      }
      expect(visitor.compile(expr().in(ids()))).toBe('("users"."bitmap" & 16) IN (1, 2)');
    });

    it("expands an iterator taken off a Map through the Enumerable arm", () => {
      expect(visitor.compile(expr().in(new Map([[1, 2]]).keys()))).toBe(
        '("users"."bitmap" & 16) IN (1)',
      );
    });

    // The Hash half of the decided split (see isEnumerable in predications.ts):
    // a Map is the Ruby Hash analogue, so the Map ITSELF expands into pairs the
    // way Rails' `in({a: 1})` does — not just an iterator taken off it.
    it("expands a Map into pairs, matching Ruby's Enumerable Hash", () => {
      const node = expr();
      const map = new Map<string, number>([["a", 1]]);
      expect(node.in(map)).toEqual(new Nodes.In(node, [new Nodes.Quoted(["a", 1])]));
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const node = expr();
      const randomObject = {};
      expect(node.in(randomObject)).toEqual(new Nodes.In(node, new Nodes.Quoted(randomObject)));
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const node = expr();
      expect(node.in("abc")).toEqual(new Nodes.In(node, new Nodes.Quoted("abc")));
    });

    it("takes the SelectManager arm ahead of the Enumerable arm", () => {
      const mgr = users.project(users.get("id"));
      const node = expr();
      expect(node.in(mgr)).toEqual(new Nodes.In(node, mgr.ast));
    });
  });

  describe("#not_in", () => {
    it("expands a Set through the Enumerable arm", () => {
      expect(visitor.compile(expr().notIn(new Set([1, 2])))).toBe(
        '("users"."bitmap" & 16) NOT IN (1, 2)',
      );
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const node = expr();
      expect(node.notIn("abc")).toEqual(new Nodes.NotIn(node, new Nodes.Quoted("abc")));
    });

    it("takes the SelectManager arm ahead of the Enumerable arm", () => {
      const mgr = users.project(users.get("id"));
      const node = expr();
      expect(node.notIn(mgr)).toEqual(new Nodes.NotIn(node, mgr.ast));
    });
  });
});

describe("PredicationsMixin", () => {
  const users = new Table("users");

  describe("on InfixOperation (Math chain)", () => {
    it("Division#subtract chains via the Math mixin", () => {
      const expr = users.get("age").divide(3).subtract(users.get("other"));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe('("users"."age" / 3 - "users"."other")');
    });

    it("BitwiseAnd#gt produces a GROUP BY / HAVING-style comparison", () => {
      const expr = users.get("bitmap").bitwiseAnd(16).gt(0);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe('("users"."bitmap" & 16) > 0');
    });

    it("BitwiseShiftLeft#gt chains through Predications", () => {
      const expr = users.get("bitmap").bitwiseShiftLeft(1).gt(0);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe('("users"."bitmap" << 1) > 0');
    });
  });

  describe("on UnaryOperation (via NodeExpression mixin)", () => {
    it("BitwiseNot#gt produces a predicate", () => {
      const expr = new Nodes.BitwiseNot(users.get("bitmap")).gt(0);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe(' ~ "users"."bitmap" > 0');
    });

    it("BitwiseNot#eq produces an equality predicate", () => {
      const expr = new Nodes.BitwiseNot(users.get("flags")).eq(0);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe(' ~ "users"."flags" = 0');
    });
  });

  describe("edge cases (via the mixin, not Attribute's inline predications)", () => {
    const bn = new Nodes.BitwiseNot(users.get("flags"));

    it("eqAny([]) does not crash and renders as NULL (Rails 3-valued logic)", () => {
      // Rails' `Or.inject` on [] returns nil and the visitor renders
      // NULL — we preserve that, since NULL is not the same as FALSE
      // under SQL three-valued logic.
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(bn.eqAny([]));
      expect(sql).toBe("(NULL)");
    });

    it("eqAll([]) does not crash and renders as an empty grouped AND", () => {
      // Matches Attribute#groupedAll: an empty And inside a Grouping
      // visits to `()`, the same as Rails' empty-And rendering.
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(bn.eqAll([]));
      expect(sql).toBe("()");
    });

    it("in(scalar) wraps the scalar (Rails quoted_node fallthrough)", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(bn.in(7));
      expect(sql).toBe(' ~ "users"."flags" IN (7)');
    });
  });

  describe("on NamedFunction (via Function → NodeExpression mixin)", () => {
    it("count().gt(n) produces HAVING-ready comparison", () => {
      const expr = users.get("id").count().gt(5);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
      expect(sql).toBe('COUNT("users"."id") > 5');
    });

    it("NamedFunction#in accepts a value list", () => {
      const fn = new Nodes.NamedFunction("LOWER", [users.get("name")]);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(fn.in(["a", "b"]));
      expect(sql).toBe("LOWER(\"users\".\"name\") IN ('a', 'b')");
    });
  });
});

// Mirrors Rails' Arel attribute_test.rb #between / #not_between blocks.
// The Trails port accepts `[begin, end]`, `{ begin, end, excludeEnd? }`,
// and `(begin, end, excludeEnd?)` call shapes; the decision tree
// (predications.rb) is the same in all cases.
describe("Predications range semantics", () => {
  const users = new Table("users");
  const id = users.get("id");

  describe("#between", () => {
    it("inclusive standard range builds Between(And(Casted, Casted))", () => {
      const node = id.between({ begin: 1, end: 3 });
      expect(node).toBeInstanceOf(Nodes.Between);
    });

    it("range begin == end collapses to Equality", () => {
      const node = id.between({ begin: 5, end: 5 });
      expect(node).toBeInstanceOf(Nodes.Equality);
    });

    it("range begin == end collapses to Equality for equal-valued Dates", () => {
      // predications.rb:56 compares the bounds with Ruby `==`, so two distinct
      // but equal Date objects collapse — the shape AR's RangeHandler builds.
      const node = id.between({
        begin: Temporal.PlainDate.from("2002-03-19"),
        end: Temporal.PlainDate.from("2002-03-19"),
      });
      expect(node).toBeInstanceOf(Nodes.Equality);
    });

    it("exclusive range builds And(GreaterThanOrEqual, LessThan)", () => {
      const node = id.between({ begin: 1, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.And);
      const and = node as Nodes.And;
      expect(and.children[0]).toBeInstanceOf(Nodes.GreaterThanOrEqual);
      expect(and.children[1]).toBeInstanceOf(Nodes.LessThan);
    });

    it("-Infinity..end inclusive becomes LessThanOrEqual", () => {
      const node = id.between({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("-Infinity...end exclusive becomes LessThan", () => {
      const node = id.between({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("begin..Infinity becomes GreaterThanOrEqual", () => {
      const node = id.between({ begin: 1, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("-Infinity..Infinity becomes NotIn([])", () => {
      const node = id.between({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
      expect(((node as Nodes.NotIn).right as unknown[]).length).toBe(0);
    });

    // A bare ±Infinity is open-ended, not unboundable: Float has no
    // `unboundable?` (predications.rb:252-253), so Rails skips the `in([])` arm
    // and treats the bound as absent (predications.rb:38-51). Rails' own
    // `Float::INFINITY..` → `In([])` case (attribute_test.rb:679-684) reaches
    // `in([])` through the nested `infinity?` check at predications.rb:42,
    // which only applies when *both* bounds are open-ended.
    it("Infinity..end (open-ended begin) becomes LessThanOrEqual on the real end", () => {
      const node = id.between({ begin: Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("begin..-Infinity (open-ended end) becomes GreaterThanOrEqual on the real begin", () => {
      const node = id.between({ begin: 1, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("Infinity.. (both bounds open-ended) still collapses to In([]) via infinity?", () => {
      const node = id.between({ begin: Infinity, end: null });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    it("..-Infinity (both bounds open-ended) still collapses to In([]) via infinity?", () => {
      const node = id.between({ begin: null, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    const unboundable = (sign: 1 | -1) => ({ isUnboundable: () => sign });

    it("unboundable begin (+1) collapses to In([])", () => {
      const node = id.between({ begin: unboundable(1), end: 3 });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    it("unboundable end (-1) collapses to In([])", () => {
      const node = id.between({ begin: 1, end: unboundable(-1) });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    it("negative-unboundable begin becomes LessThanOrEqual on the real end", () => {
      const node = id.between({ begin: unboundable(-1), end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("positive-unboundable end becomes GreaterThanOrEqual on the real begin", () => {
      const node = id.between({ begin: 1, end: unboundable(1) });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("both bounds unboundable (-1 begin, +1 end) becomes NotIn([])", () => {
      const node = id.between({ begin: unboundable(-1), end: unboundable(1) });
      expect(node).toBeInstanceOf(Nodes.NotIn);
      expect(((node as Nodes.NotIn).right as unknown[]).length).toBe(0);
    });

    it("null..end (open begin) collapses to LessThanOrEqual", () => {
      const node = id.between({ begin: null, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("begin..null (open end) collapses to GreaterThanOrEqual", () => {
      const node = id.between({ begin: 1, end: null });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });
  });

  describe("#between SQL output", () => {
    const sql = (n: Nodes.Node) => new Visitors.ToSql(fakeRecordConnection).compile(n);

    it("inclusive standard range → BETWEEN", () => {
      expect(sql(id.between({ begin: 1, end: 3 }))).toBe('"users"."id" BETWEEN 1 AND 3');
    });

    it("exclusive range → >= AND <", () => {
      expect(sql(id.between({ begin: 1, end: 3, excludeEnd: true }))).toBe(
        '"users"."id" >= 1 AND "users"."id" < 3',
      );
    });

    it("begin == end → equality", () => {
      expect(sql(id.between({ begin: 5, end: 5 }))).toBe('"users"."id" = 5');
    });

    it("-Infinity..Infinity → 1=1", () => {
      expect(sql(id.between({ begin: -Infinity, end: Infinity }))).toBe("1=1");
    });

    it("Infinity..end (open-ended begin) → col <= end", () => {
      expect(sql(id.between({ begin: Infinity, end: 3 }))).toBe('"users"."id" <= 3');
    });
  });

  describe("#not_between SQL output", () => {
    const sql = (n: Nodes.Node) => new Visitors.ToSql(fakeRecordConnection).compile(n);

    it("inclusive range → (col < b OR col > e)", () => {
      expect(sql(id.notBetween({ begin: 1, end: 3 }))).toBe(
        '("users"."id" < 1 OR "users"."id" > 3)',
      );
    });

    it("exclusive range → (col < b OR col >= e)", () => {
      expect(sql(id.notBetween({ begin: 1, end: 3, excludeEnd: true }))).toBe(
        '("users"."id" < 1 OR "users"."id" >= 3)',
      );
    });

    it("-Infinity..end → > end (no NOT wrapper)", () => {
      expect(sql(id.notBetween({ begin: -Infinity, end: 3 }))).toBe('"users"."id" > 3');
    });

    it("-Infinity..Infinity → 1=0", () => {
      expect(sql(id.notBetween({ begin: -Infinity, end: Infinity }))).toBe("1=0");
    });
  });

  describe("#not_between", () => {
    it("inclusive standard range builds Grouping(Or(LessThan, GreaterThan))", () => {
      const node = id.notBetween({ begin: 1, end: 3 });
      expect(node).toBeInstanceOf(Nodes.Grouping);
      const inner = (node as Nodes.Grouping).expr as Nodes.Or;
      expect(inner).toBeInstanceOf(Nodes.Or);
      expect(inner.children[0]).toBeInstanceOf(Nodes.LessThan);
      expect(inner.children[1]).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("exclusive range builds Grouping(Or(LessThan, GreaterThanOrEqual))", () => {
      const node = id.notBetween({ begin: 1, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.Grouping);
      const inner = (node as Nodes.Grouping).expr as Nodes.Or;
      expect(inner.children[0]).toBeInstanceOf(Nodes.LessThan);
      expect(inner.children[1]).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("-Infinity..end (open begin) becomes GreaterThan", () => {
      const node = id.notBetween({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("-Infinity...end (open begin, exclusive end) becomes GreaterThanOrEqual", () => {
      const node = id.notBetween({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("begin..Infinity (open end) becomes LessThan", () => {
      const node = id.notBetween({ begin: 1, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("-Infinity..Infinity becomes In([])", () => {
      const node = id.notBetween({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
    });

    // Same split as #between: a bare ±Infinity is open-ended, not unboundable,
    // so it falls to the `gt(other.end)` / `lt(other.begin)` arms rather than
    // the `not_in([])` arm (predications.rb:85-100).
    it("Infinity..end (open-ended begin) becomes GreaterThan on the real end", () => {
      const node = id.notBetween({ begin: Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("begin..-Infinity (open-ended end) becomes LessThan on the real begin", () => {
      const node = id.notBetween({ begin: 1, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("Infinity.. (both bounds open-ended) still becomes NotIn([]) via infinity?", () => {
      const node = id.notBetween({ begin: Infinity, end: null });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("..-Infinity (both bounds open-ended) still becomes NotIn([]) via infinity?", () => {
      // Covers the second disjunct of predications.rb:89,
      // `infinity?(other.end) == -1`.
      const node = id.notBetween({ begin: null, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });
  });
});
