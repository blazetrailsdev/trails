import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  Table,
  star,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
  sql,
} from "../index.js";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { buildQuoted } from "../nodes/casted.js";

describe("the to_sql visitor", () => {
  const users = new Table("users");
  // Rails' `before` block and `compile` helper (`to_sql_test.rb:10-18`): the
  // FakeRecord connection is what makes `true` render as `'t'` here.
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const table = new Table("users");
  const attr = table.get("id");
  const compile = (node: unknown): string =>
    visitor.accept(node as Nodes.Node, new Collectors.SQLString()).value;
  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("first_name").isDistinctFrom(users.get("last_name"));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
        `CASE WHEN "users"."first_name" = "users"."last_name" OR ("users"."first_name" IS NULL AND "users"."last_name" IS NULL) THEN 0 ELSE 1 END = 1`,
      );
    });

    it("should handle nil", () => {
      const node = users.get("name").isDistinctFrom(null);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
        `"users"."name" IS NOT NULL`,
      );
    });
  });

  describe("Nodes::NotIn", () => {
    it("can handle subqueries", () => {
      const t = new Table("users");
      const subquery = t.project("id").where(t.get("name").eq("Aaron"));
      const node = attr.notIn(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" NOT IN (SELECT id FROM "users" WHERE "users"."name" = 'Aaron')`),
      );
    });

    it("should know how to visit", () => {
      const node = attr.notIn([1, 2, 3]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" NOT IN (1, 2, 3)`));
    });

    it("can handle two dot ranges", () => {
      const node = attr.notBetween({ begin: 1, end: 3 });
      expect(compile(node)).toBe(`("users"."id" < 1 OR "users"."id" > 3)`);
    });

    it("can handle three dot ranges", () => {
      const node = attr.notBetween({ begin: 1, end: 3, excludeEnd: true });
      expect(compile(node)).toBe(`("users"."id" < 1 OR "users"."id" >= 3)`);
    });

    it("can handle ranges bounded by infinity", () => {
      expect(mustBeLike(compile(attr.notBetween({ begin: 1, end: Infinity })))).toBe(
        mustBeLike(`"users"."id" < 1`),
      );
      expect(mustBeLike(compile(attr.notBetween({ begin: -Infinity, end: 3 })))).toBe(
        mustBeLike(`"users"."id" > 3`),
      );
      expect(
        mustBeLike(compile(attr.notBetween({ begin: -Infinity, end: 3, excludeEnd: true }))),
      ).toBe(mustBeLike(`"users"."id" >= 3`));
      expect(mustBeLike(compile(attr.notBetween({ begin: -Infinity, end: Infinity })))).toBe(
        mustBeLike("1=0"),
      );
    });

    it("is not preparable when an array", () => {
      const node = attr.notIn([1, 2, 3]);
      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(false);
    });

    it("is preparable when a subselect", () => {
      const t = new Table("users");
      const subquery = t.project(t.get("id")).where(t.get("name").eq("Aaron"));
      const node = attr.notIn(subquery);

      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(true);
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("can handle ESCAPE", () => {
      const node = table.get("name").doesNotMatch("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."name" NOT LIKE 'foo!%' ESCAPE '!'`),
      );
    });

    it("should know how to visit", () => {
      const node = table.get("name").doesNotMatch("foo%");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" NOT LIKE 'foo%'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").doesNotMatch("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" NOT LIKE 'foo%')`),
      );
    });
  });

  it("should escape LIMIT", () => {
    const sc = new Nodes.SelectStatement();
    sc.limit = new Nodes.Limit(buildQuoted("omg"));
    expect(compile(sc)).toMatch(/LIMIT 'omg'/);
  });

  it("should not quote sql literals", () => {
    const node = table.get(star());
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users".*`));
  });

  describe("Constants", () => {
    it("should handle false", () => {
      const test = new Table("users").createFalse();
      expect(mustBeLike(compile(test))).toBe(mustBeLike("FALSE"));
    });
  });

  describe("Nodes::InfixOperation", () => {
    const products = new Table("products");

    it("should handle Multiplication", () => {
      const node = products.get("price").multiply(new Table("currency_rates").get("rate"));
      expect(compile(node)).toBe(`"products"."price" * "currency_rates"."rate"`);
    });

    it("should handle Division", () => {
      const node = products.get("price").divide(5);
      expect(compile(node)).toBe(`"products"."price" / 5`);
    });

    it("should handle Addition", () => {
      const node = products.get("price").add(6);
      expect(compile(node)).toBe(`("products"."price" + 6)`);
    });

    it("should handle Subtraction", () => {
      const node = products.get("price").subtract(7);
      expect(compile(node)).toBe(`("products"."price" - 7)`);
    });

    it("should handle Concatenation", () => {
      const node = table.get("name").concat(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" || "users"."name"`);
    });

    it("should handle Contains", () => {
      const node = table.get("name").contains(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" @> "users"."name"`);
    });

    it("should handle Overlaps", () => {
      const node = table.get("name").overlaps(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" && "users"."name"`);
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.InfixOperation("&&", products.get("name"), products.get("name"));
      expect(compile(node)).toBe(`"products"."name" && "products"."name"`);
    });
  });

  describe("Table", () => {
    it("should compile literal SQL", () => {
      const test = new Table(sql("generate_series(4, 2)") as unknown as string);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, 2)"));
    });

    it("should compile Arel nodes", () => {
      const test = new Nodes.NamedFunction("generate_series", [4, 2]);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, 2)"));
    });
  });

  it("can define a dispatch method", () => {
    let visited = false;
    class HelloVisitor extends Visitors.Visitor {
      hello(_node: Table, _c: unknown): string {
        visited = true;
        return "";
      }
      static {
        this.dispatchCache().set(Table, "hello");
      }
    }
    const viz = new HelloVisitor();
    viz.accept(users, new Collectors.SQLString());
    expect(visited).toBeTruthy();
  });

  it("should visit built-in functions", () => {
    expect(compile(new Nodes.Count([star()]))).toBe("COUNT(*)");
    expect(compile(new Nodes.Sum([star()]))).toBe("SUM(*)");
    expect(compile(new Nodes.Max([star()]))).toBe("MAX(*)");
    expect(compile(new Nodes.Min([star()]))).toBe("MIN(*)");
    expect(compile(new Nodes.Avg([star()]))).toBe("AVG(*)");
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted("Aaron Patterson"));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
        `CASE WHEN "users"."name" = 'Aaron Patterson' OR ("users"."name" IS NULL AND 'Aaron Patterson' IS NULL) THEN 0 ELSE 1 END = 0`,
      );
    });

    it("should handle column names on both sides", () => {
      const node = users.get("first_name").isNotDistinctFrom(users.get("last_name"));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
        `CASE WHEN "users"."first_name" = "users"."last_name" OR ("users"."first_name" IS NULL AND "users"."last_name" IS NULL) THEN 0 ELSE 1 END = 0`,
      );
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe(`"users"."name" IS NULL`);
    });
  });

  describe("Nodes::Case", () => {
    it("allows chaining multiple conditions", () => {
      const node = new Nodes.Case(table.get("name"))
        .when("foo")
        .then(1)
        .when("bar")
        .then(2)
        .else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 WHEN 'bar' THEN 2 ELSE 0 END`),
      );
    });
  });

  describe("Nodes::Fragments", () => {
    it("can be built by adding SQL fragments one at a time", () => {
      let fragments = sql("SELECT foo, bar").plus(sql("FROM customers"));
      fragments = fragments.plus(sql("GROUP BY foo"));
      expect(mustBeLike(compile(fragments))).toBe(
        mustBeLike("SELECT foo, bar FROM customers GROUP BY foo"),
      );
    });
  });

  describe("Nodes::Case", () => {
    it("can be chained as a predicate", () => {
      const node = table.get("name").when("foo").then("bar").else("baz");
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 'bar' ELSE 'baz' END`),
      );
    });
  });

  it("does not quote BindParams used as part of a ValuesList", () => {
    const bp = new Nodes.BindParam(1);
    const values = new Nodes.ValuesList([[bp]]);
    expect(mustBeLike(compile(values))).toBe(mustBeLike("VALUES (?)"));
  });

  describe("Nodes::UnionAll", () => {
    it("encloses SELECT statements with parentheses", () => {
      const left = table.where(table.get("name").eq(0)).take(1).ast;
      const right = table.where(table.get("name").eq(1)).take(1).ast;
      const node = new Nodes.UnionAll(left, right);
      expect(compile(node)).toMatch(/LIMIT 1\) UNION ALL \(/);
    });
  });

  describe("Nodes::Cte", () => {
    it("handles CTEs with a MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star()), true);
      expect(mustBeLike(compile(cte))).toBe(
        mustBeLike(`"foo" AS MATERIALIZED (SELECT * FROM "bar")`),
      );
    });

    it("handles CTEs with a NOT MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star()), false);
      expect(mustBeLike(compile(cte))).toBe(
        mustBeLike(`"foo" AS NOT MATERIALIZED (SELECT * FROM "bar")`),
      );
    });

    it("handles CTEs with no MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star()));
      expect(mustBeLike(compile(cte))).toBe(mustBeLike(`"foo" AS (SELECT * FROM "bar")`));
    });
  });

  describe("Nodes::With", () => {
    it("handles table aliases", () => {
      const manager = new Table("foo").project(star()).from(new Nodes.SqlLiteral("expr2"));
      const expr1 = new Table("bar").project(star()).as("expr1");
      const expr2 = new Table("baz").project(star()).as("expr2");
      manager.with(expr1, expr2);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(manager.ast);
      expect(sql).toBe(
        'WITH expr1 AS (SELECT * FROM "bar"), expr2 AS (SELECT * FROM "baz") SELECT * FROM expr2',
      );
    });

    it("handles Cte nodes", () => {
      const cte = new Nodes.Cte("expr1", new Table("bar").project(star()));
      const manager = new Table("foo")
        .project(star())
        .with(cte)
        .from(cte.toTable())
        .where(cte.toTable().get("score").gt(5));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(manager.ast);
      expect(sql).toBe(
        'WITH "expr1" AS (SELECT * FROM "bar") SELECT * FROM "expr1" WHERE "expr1"."score" > 5',
      );
    });
  });

  describe("Nodes::WithRecursive", () => {
    it("handles table aliases", () => {
      const manager = new Table("foo").project(star()).from(new Nodes.SqlLiteral("expr1"));
      const expr1 = new Table("bar").project(star()).as("expr1");
      manager.withRecursive(expr1);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(manager.ast);
      expect(sql).toBe('WITH RECURSIVE expr1 AS (SELECT * FROM "bar") SELECT * FROM expr1');
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("ignores excess named parameters", () => {
      const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1, extra: 2 });
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      // `:id` renders as a `?` placeholder (add_bind), `:extra` is unreferenced
      // and silently ignored — Rails to_sql_test.rb.
      expect(sql).toBe("id = ?");
    });
  });

  describe("Nodes::Fragments", () => {
    it("joins subexpressions", () => {
      const fragments = sql("SELECT foo, bar").plus(sql(" FROM customers"));
      expect(mustBeLike(compile(fragments))).toBe(mustBeLike("SELECT foo, bar FROM customers"));
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("quotes nested arrays", () => {
      // Mirrors Rails to_sql_test.rb — two cases exercise the mixed
      // Arel-node/scalar branch. An Arel node in the list is visited; every other
      // element (including a nested array) is a single `add_bind` → one `?`.
      const innerLiteral = new Nodes.BoundSqlLiteral("? * 2", [4], {});
      const node = new Nodes.BoundSqlLiteral("id IN (?)", [[1, [2, 3], innerLiteral]], {});
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("id IN (?, ?, ? * 2)");

      const node2 = new Nodes.BoundSqlLiteral("id IN (?)", [[1, [2, 3]]], {});
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node2)).toBe("id IN (?, ?)");
    });
  });

  it("unsupported input should raise UnsupportedVisitError", () => {
    // Rails compiles `nil`, whose NilClass handler is aliased to `unsupported`
    // (to_sql.rb:838) — the UnsupportedVisitError terminal. A class with no
    // handler at all is the other terminal and raises TypeError
    // (visitor.rb:38), covered in visitor.test.ts.
    let error: unknown;
    try {
      compile(null);
    } catch (e) {
      error = e;
    }
    expect(() => compile(null)).toThrow(Visitors.UnsupportedVisitError);
    expect((error as Error).message).toMatch(/^Unsupported/);
  });

  describe("distinct on", () => {
    it("raises not implemented error", () => {
      const core = new Nodes.SelectCore();
      core.setQuantifier = new Nodes.DistinctOn(new Nodes.SqlLiteral("aaron"));
      expect(() => new Visitors.ToSql(fakeRecordConnection).compile(core)).toThrow(
        "DISTINCT ON not implemented for this db",
      );
    });
  });

  describe("Nodes::Regexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.Regexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql(fakeRecordConnection).compile(node)).toThrow(
        "~ not implemented for this db",
      );
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.NotRegexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql(fakeRecordConnection).compile(node)).toThrow(
        "!~ not implemented for this db",
      );
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("refuses mixed binds", () => {
      expect(
        () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
      ).toThrow();
    });

    it("requires all named bind params to be supplied", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", [], { foo: 1 })).toThrow();
    });

    it("requires positional binds to match the placeholders", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2], {})).toThrow();
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2, 3, 4], {})).toThrow();
    });
  });

  it("should apply Not to the whole expression", () => {
    const node = new Nodes.And([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(new Nodes.Not(node)))).toBe(
      mustBeLike(`NOT ("users"."id" = 10 AND "users"."id" = 11)`),
    );
  });

  it("should chain predications on named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star()]);
    expect(mustBeLike(compile(fn.eq(2)))).toBe(mustBeLike("omg(*) = 2"));
  });

  describe("Table", () => {
    it("should compile node names", () => {
      const test = new Table("users").alias("zomgusers").get("id").eq("3");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"zomgusers"."id" = '3'`));
    });

    it("should compile nodes with bind params", () => {
      const bp = new Nodes.BindParam(1);
      const test = new Nodes.NamedFunction("generate_series", [4, bp]);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, ?)"));
    });
  });

  it("should contain a single space before ORDER BY", () => {
    const test = table.order(table.get("name"));
    expect(compile(test)).toMatch(/"users" ORDER BY/);
  });

  describe("Nodes::Equality", () => {
    it("should escape strings", () => {
      const test = new Table("users").get("name").eq("Aaron Patterson");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."name" = 'Aaron Patterson'`));
    });

    it("should handle false", () => {
      const t = new Table("users");
      const val = buildQuoted(false, t.get("active"));
      expect(mustBeLike(compile(new Nodes.Equality(val, val)))).toBe(mustBeLike(`'f' = 'f'`));
    });

    it("should handle nil", () => {
      const compiled = compile(new Nodes.Equality(table.get("name"), null));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NULL`));
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle BitwiseAnd", () => {
      const node = new Table("products").get("bitmap").bitwiseAnd(16);
      expect(compile(node)).toBe(`("products"."bitmap" & 16)`);
    });
  });

  describe("Nodes::UnaryOperation", () => {
    it("should handle BitwiseNot", () => {
      const node = new Table("products").get("bitmap").bitwiseNot();
      expect(compile(node)).toBe(` ~ "products"."bitmap"`);
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.UnaryOperation("!", new Table("products").get("active"));
      expect(compile(node)).toBe(` ! "products"."active"`);
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle BitwiseOr", () => {
      const node = new Table("products").get("bitmap").bitwiseOr(16);
      expect(compile(node)).toBe(`("products"."bitmap" | 16)`);
    });

    it("should handle BitwiseShiftLeft", () => {
      const node = new Table("products").get("bitmap").bitwiseShiftLeft(4);
      expect(compile(node)).toBe(`("products"."bitmap" << 4)`);
    });

    it("should handle BitwiseShiftRight", () => {
      const node = new Table("products").get("bitmap").bitwiseShiftRight(4);
      expect(compile(node)).toBe(`("products"."bitmap" >> 4)`);
    });

    it("should handle BitwiseXor", () => {
      const node = new Table("products").get("bitmap").bitwiseXor(16);
      expect(compile(node)).toBe(`("products"."bitmap" ^ 16)`);
    });
  });

  it("should handle nil with named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star()]);
    expect(mustBeLike(compile(fn.eq(null)))).toBe(mustBeLike("omg(*) IS NULL"));
  });

  describe("Nodes::Ordering", () => {
    it("should handle nulls first", () => {
      const node = attr.desc().nullsFirst();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC NULLS FIRST`));
    });

    it("should handle nulls first reversed", () => {
      const node = attr.desc().nullsFirst().reverse();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" ASC NULLS LAST`));
    });

    it("should handle nulls last", () => {
      const node = attr.desc().nullsLast();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC NULLS LAST`));
    });

    it("should handle nulls last reversed", () => {
      const node = attr.desc().nullsLast().reverse();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" ASC NULLS FIRST`));
    });

    it("should know how to visit", () => {
      const node = attr.desc();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC`));
    });
  });

  describe("Constants", () => {
    it("should handle true", () => {
      const test = new Table("users").createTrue();
      expect(mustBeLike(compile(test))).toBe(mustBeLike("TRUE"));
    });
  });

  it("should mark collector as non-retryable if SQL literal is not retryable", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      lit,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting SQL literal", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      lit,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting bound SQL literal", () => {
    const lit = new Nodes.BoundSqlLiteral("id = ?", [1], null);
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      lit,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting delete statement node", () => {
    const stmt = new DeleteManager().from(users).ast;
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      stmt,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting insert statement node", () => {
    const stmt = new InsertManager(users).insert([[users.get("name"), "dean"]]).ast;
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      stmt,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting named function", () => {
    const fn = users.get("name").lower();
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      fn,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting update statement node", () => {
    const stmt = new UpdateManager().table(users).set([[users.get("name"), "sam"]]).ast;
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      stmt,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(false);
  });

  it("should not change retryable if SQL literal is marked as retryable", () => {
    const node = new Nodes.SqlLiteral("COUNT(*)", { retryable: true });
    const collector = new Collectors.SQLString();
    collector.retryable = true;
    visitor.accept(node, collector);

    expect(collector.retryable).toBeTruthy();
  });

  it("should quote LIMIT without column type coercion", () => {
    const sc = table.where(table.get("name").eq(0)).take(1).ast;
    expect(compile(sc)).toMatch(/WHERE "users"."name" = 0 LIMIT 1/);
  });

  describe("Nodes::In", () => {
    it("should return 1=0 when empty right which is always false", () => {
      const node = users.get("id").in([]);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe("1=0");
    });

    it("should know how to visit", () => {
      const node = attr.in([1, 2, 3]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" IN (1, 2, 3)`));
    });

    it("can handle two dot ranges", () => {
      const node = attr.between({ begin: 1, end: 3 });
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" BETWEEN 1 AND 3`));
    });

    it("can handle three dot ranges", () => {
      const node = attr.between({ begin: 1, end: 3, excludeEnd: true });
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" >= 1 AND "users"."id" < 3`));
    });

    it("can handle ranges bounded by infinity", () => {
      expect(mustBeLike(compile(attr.between({ begin: 1, end: Infinity })))).toBe(
        mustBeLike(`"users"."id" >= 1`),
      );
      expect(mustBeLike(compile(attr.between({ begin: -Infinity, end: 3 })))).toBe(
        mustBeLike(`"users"."id" <= 3`),
      );
      expect(
        mustBeLike(compile(attr.between({ begin: -Infinity, end: 3, excludeEnd: true }))),
      ).toBe(mustBeLike(`"users"."id" < 3`));
      expect(mustBeLike(compile(attr.between({ begin: -Infinity, end: Infinity })))).toBe(
        mustBeLike("1=1"),
      );
    });

    it("can handle subqueries", () => {
      const t = new Table("users");
      const subquery = t.project("id").where(t.get("name").eq("Aaron"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" = 'Aaron')`),
      );
    });

    it("is not preparable when an array", () => {
      const node = attr.in([1, 2, 3]);
      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(false);
    });

    it("is preparable when a subselect", () => {
      const t = new Table("users");
      const subquery = t.project(t.get("id")).where(t.get("name").eq("Aaron"));
      const node = attr.in(subquery);

      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(true);
    });
  });

  describe("Nodes::NotIn", () => {
    it("should return 1=1 when empty right which is always true", () => {
      const node = users.get("id").notIn([]);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe("1=1");
    });
  });

  describe("TableAlias", () => {
    it("should use the underlying table for checking columns", () => {
      const test = new Table("users").alias("zomgusers").get("id").eq("3");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"zomgusers"."id" = '3'`));
    });
  });

  it("should visit_Arel_Nodes_And", () => {
    const node = new Nodes.And([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" = 10 AND "users"."id" = 11`));
  });

  it("should visit_Arel_Nodes_Assignment", () => {
    const column = table.get("id");
    const node = new Nodes.Assignment(
      new Nodes.UnqualifiedColumn(column),
      new Nodes.UnqualifiedColumn(column),
    );
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"id" = "id"`));
  });

  it("should visit_Arel_Nodes_Or", () => {
    const node = new Nodes.Or([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" = 10 OR "users"."id" = 11`));
  });

  it("should visit_Arel_SelectManager, which is a subquery", () => {
    const mgr = new Table("foo").project("bar");
    expect(mustBeLike(compile(mgr))).toBe(mustBeLike(`(SELECT bar FROM "foo")`));
  });

  it("should visit_As", () => {
    const as = new Nodes.As(sql("foo"), sql("bar"));
    expect(mustBeLike(compile(as))).toBe(mustBeLike("foo AS bar"));
  });

  it("should visit_BigDecimal", () => {
    // Rails exercises the visitor without asserting (to_sql_test.rb:344-346):
    // reaching the end of the body is the assertion.
    compile(buildQuoted({ toString: () => "2.14" }));
  });

  it("should visit_Class", () => {
    // Ruby `Class#to_s` is the class name, so `build_quoted(DateTime)` quotes
    // `'DateTime'`. JS `String(klass)` is the constructor's source text, so the
    // faithful analogue of Ruby's `to_s` here is the constructor's `name`.
    class DateTime {}
    expect(compile(buildQuoted(DateTime.name))).toBe("'DateTime'");
  });

  it("should visit_Date", () => {
    const dt = Temporal.PlainDate.from("2020-01-02");
    const test = table.get("created_at").eq(dt);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."created_at" = '2020-01-02'`));
  });

  it("should visit_DateTime", () => {
    const dt = Temporal.PlainDateTime.from("2020-01-02T03:04:05");
    const test = table.get("created_at").eq(dt);
    expect(mustBeLike(compile(test))).toBe(
      mustBeLike(`"users"."created_at" = '2020-01-02 03:04:05'`),
    );
  });

  it("should visit_Float", () => {
    const test = new Table("products").get("price").eq(2.14);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"products"."price" = 2.14`));
  });

  it("should visit_Hash", () => {
    compile(buildQuoted({ a: 1 }));
  });

  it("should visit_Integer", () => {
    compile(8787878092);
  });

  it("should visit_NilClass", () => {
    expect(mustBeLike(compile(buildQuoted(null)))).toBe(mustBeLike("NULL"));
  });

  it("should visit_Not", () => {
    expect(mustBeLike(compile(new Nodes.Not(sql("foo"))))).toBe(mustBeLike("NOT (foo)"));
  });

  it("should visit_Set", () => {
    compile(buildQuoted(new Set([1, 2])));
  });

  it("should visit_TrueClass", () => {
    const test = table.get("bool").eq(true);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."bool" = 't'`));
  });

  it("should visit named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star()]);
    expect(compile(fn)).toBe("omg(*)");
  });

  it("should visit string subclass", () => {
    class StringSubclass extends String {}
    class StringSubSubclass extends StringSubclass {}
    for (const obj of [new StringSubclass(":'("), new StringSubSubclass(":'(")]) {
      const val = buildQuoted(obj, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" != ':\\'('`));
    }
  });

  it("should visit built-in functions operating on distinct values", () => {
    const count = new Nodes.Count([star()]);
    count.distinct = true;
    expect(compile(count)).toBe("COUNT(DISTINCT *)");
    const sum = new Nodes.Sum([star()]);
    sum.distinct = true;
    expect(compile(sum)).toBe("SUM(DISTINCT *)");
    const max = new Nodes.Max([star()]);
    max.distinct = true;
    expect(compile(max)).toBe("MAX(DISTINCT *)");
    const min = new Nodes.Min([star()]);
    min.distinct = true;
    expect(compile(min)).toBe("MIN(DISTINCT *)");
    const avg = new Nodes.Avg([star()]);
    avg.distinct = true;
    expect(compile(avg)).toBe("AVG(DISTINCT *)");
  });

  describe("Nodes::UnionAll", () => {
    it("squashes parenthesis on multiple union alls", () => {
      let subnode = new Nodes.UnionAll(sql("left"), sql("right"));
      let node = new Nodes.UnionAll(subnode, sql("topright"));
      expect(compile(node)).toBe("( left UNION ALL right UNION ALL topright )");
      subnode = new Nodes.UnionAll(sql("left"), sql("right"));
      node = new Nodes.UnionAll(sql("topleft"), subnode);
      expect(compile(node)).toBe("( topleft UNION ALL left UNION ALL right )");
    });
  });

  describe("Nodes::Union", () => {
    it("squashes parenthesis on multiple unions", () => {
      let subnode = new Nodes.Union(sql("left"), sql("right"));
      let node = new Nodes.Union(subnode, sql("topright"));
      expect(compile(node)).toBe("( left UNION right UNION topright )");
      subnode = new Nodes.Union(sql("left"), sql("right"));
      node = new Nodes.Union(sql("topleft"), subnode);
      expect(compile(node)).toBe("( topleft UNION left UNION right )");
    });

    it("encloses SELECT statements with parentheses", () => {
      const left = table.where(table.get("name").eq(0)).take(1).ast;
      const right = table.where(table.get("name").eq(1)).take(1).ast;
      const node = new Nodes.Union(left, right);
      expect(compile(node)).toMatch(/LIMIT 1\) UNION \(/);
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("supports other bound literals as binds", () => {
      const node = sql("?", [1, 2, sql("?", 3)]);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("?, ?, ?");
    });
  });

  describe("Nodes::Case", () => {
    it("supports simple case expressions", () => {
      const node = new Nodes.Case(table.get("name")).when("foo").then(1).else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 ELSE 0 END`),
      );
    });

    it("supports extended case expressions", () => {
      const node = new Nodes.Case()
        .when(table.get("name").in(["foo", "bar"]))
        .then(1)
        .else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE WHEN "users"."name" IN ('foo', 'bar') THEN 1 ELSE 0 END`),
      );
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("will only consider named binds starting with a letter", () => {
      const node = new Nodes.BoundSqlLiteral("id = :0abc", [], { "0abc": 1 });
      expect(mustBeLike(compile(node))).toBe(mustBeLike("id = :0abc"));
    });
  });

  it("works with BindParams", () => {
    const node = new Nodes.BindParam(1);
    expect(mustBeLike(compile(node))).toBe(mustBeLike("?"));
  });

  it("works with lists", () => {
    const fn = new Nodes.NamedFunction("omg", [star(), star()]);
    expect(compile(fn)).toBe("omg(*, *)");
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("works with positional binds", () => {
      const node = new Nodes.BoundSqlLiteral("id = ?", [1], null);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      // Rails: `add_bind` emits the placeholder (BIND_BLOCK = proc { "?" }) into
      // a plain SQLString collector, so `compile` renders `id = ?`, not the
      // inlined value (to_sql_test.rb).
      expect(sql).toBe("id = ?");
    });

    it("works with named binds", () => {
      const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1 });
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe("id = ?");
    });

    it("works with array values", () => {
      // Rails to_sql_test.rb: a single positional `?` bound to an array expands
      // through `add_binds` to one placeholder per element.
      const node = new Nodes.BoundSqlLiteral("id IN (?)", [[1, 2, 3]], {});
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe("id IN (?, ?, ?)");
    });
  });

  describe("Nodes::Grouping", () => {
    it("wraps nested groupings in brackets only once", () => {
      const compiled = compile(new Nodes.Grouping(new Nodes.Grouping(buildQuoted("foo"))));
      expect(compiled).toBe("('foo')");
    });
  });

  describe("Nodes::Case", () => {
    it("works without default branch", () => {
      const node = new Nodes.Case(table.get("name")).when("foo").then(1);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 END`),
      );
    });

    it("supports #when with two arguments and no #then", () => {
      const node = new Nodes.Case(table.get("name"));
      for (const [condition, result] of Object.entries({ foo: 1, bar: 0 })) {
        node.when(condition, result);
      }
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 WHEN 'bar' THEN 0 END`),
      );
    });
  });

  describe("Nodes::Matches", () => {
    it("should know how to visit", () => {
      const node = table.get("name").matches("foo%");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" LIKE 'foo%'`));
    });

    it("can handle ESCAPE", () => {
      const node = table.get("name").matches("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" LIKE 'foo!%' ESCAPE '!'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").matches("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" LIKE 'foo%')`),
      );
    });
  });

  describe("Nodes::NotEqual", () => {
    it("should handle false", () => {
      const val = buildQuoted(false, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("active"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."active" != 'f'`));
    });

    it("should handle nil", () => {
      const val = buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NOT NULL`));
    });
  });
});
