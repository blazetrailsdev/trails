/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Table, Nodes } from "@blazetrails/arel";
import { WhereClause } from "./where-clause.js";

// Mirrors Rails' private helpers in WhereClauseTest
function table(): Table {
  return new Table("table");
}

function bindParam(value: unknown): Nodes.BindParam {
  return new Nodes.BindParam(value);
}

function concat(a: WhereClause, b: WhereClause): WhereClause {
  return new WhereClause([...a.predicates, ...b.predicates]);
}

function eql(a: WhereClause, b: WhereClause): boolean {
  return (
    a.predicates.length === b.predicates.length &&
    a.predicates.every((p, i) => p.eql(b.predicates[i]))
  );
}

describe("ActiveRecord::Relation", () => {
  describe("WhereClauseTest", () => {
    it("+ combines two where clauses", () => {
      const t = table();
      const firstClause = new WhereClause([t.get("id").eq(bindParam(1))]);
      const secondClause = new WhereClause([t.get("name").eq(bindParam("Sean"))]);
      const combined = new WhereClause([
        t.get("id").eq(bindParam(1)),
        t.get("name").eq(bindParam("Sean")),
      ]);
      expect(eql(concat(firstClause, secondClause), combined)).toBe(true);
    });

    it("+ is associative, but not commutative", () => {
      const a = new WhereClause([new Nodes.SqlLiteral("a")]);
      const b = new WhereClause([new Nodes.SqlLiteral("b")]);
      const c = new WhereClause([new Nodes.SqlLiteral("c")]);
      expect(eql(concat(a, concat(b, c)), concat(concat(a, b), c))).toBe(true);
      expect(eql(concat(a, b), concat(b, a))).toBe(false);
    });

    it("an empty where clause is the identity value for +", () => {
      const t = table();
      const clause = new WhereClause([t.get("id").eq(bindParam(1))]);
      expect(eql(concat(clause, WhereClause.empty()), clause)).toBe(true);
    });

    it("merge combines two where clauses", () => {
      const t = table();
      const a = new WhereClause([t.get("id").eq(1)]);
      const b = new WhereClause([t.get("name").eq("Sean")]);
      const expected = new WhereClause([t.get("id").eq(1), t.get("name").eq("Sean")]);
      expect(eql(a.merge(b), expected)).toBe(true);
    });

    it("merge keeps the right side, when two equality clauses reference the same column", () => {
      const t = table();
      const a = new WhereClause([t.get("id").eq(1), t.get("name").eq("Sean")]);
      const b = new WhereClause([t.get("name").eq("Jim")]);
      const expected = new WhereClause([t.get("id").eq(1), t.get("name").eq("Jim")]);
      expect(eql(a.merge(b), expected)).toBe(true);
    });

    it("merge removes bind parameters matching overlapping equality clauses", () => {
      const t = table();
      const a = new WhereClause([
        t.get("id").eq(bindParam(1)),
        t.get("name").eq(bindParam("Sean")),
      ]);
      const b = new WhereClause([t.get("name").eq(bindParam("Jim"))]);
      const expected = new WhereClause([
        t.get("id").eq(bindParam(1)),
        t.get("name").eq(bindParam("Jim")),
      ]);
      expect(eql(a.merge(b), expected)).toBe(true);
    });

    it("merge allows for columns with the same name from different tables", () => {
      const t = table();
      const t2 = new Table("table2");
      const a = new WhereClause([t.get("id").eq(bindParam(1)), t2.get("id").eq(bindParam(2))]);
      const b = new WhereClause([t.get("id").eq(bindParam(3))]);
      const expected = new WhereClause([
        t2.get("id").eq(bindParam(2)),
        t.get("id").eq(bindParam(3)),
      ]);
      expect(eql(a.merge(b), expected)).toBe(true);
    });

    it("a clause knows if it is empty", () => {
      expect(WhereClause.empty().isEmpty()).toBe(true);
      expect(new WhereClause([new Nodes.SqlLiteral("anything")]).isEmpty()).toBe(false);
    });

    it("invert cannot handle nil", () => {
      const whereClause = new WhereClause([null as unknown as Nodes.Node]);
      expect(() => whereClause.invert()).toThrow();
    });

    it("invert wraps the ast inside a NAND node", () => {
      const t = table();
      const original = new WhereClause([
        t.get("id").in([1, 2, 3]),
        t.get("id").notIn([1, 2, 3]),
        t.get("id").eq(1),
        t.get("id").notEq(2),
        t.get("id").gt(1),
        t.get("id").gteq(2),
        t.get("id").lt(1),
        t.get("id").lteq(2),
        t.get("id").isNotDistinctFrom(1),
        t.get("id").isDistinctFrom(2),
        new Nodes.SqlLiteral("sql literal"),
      ]);
      const expected = new WhereClause([
        new Nodes.Not(
          new Nodes.And([
            t.get("id").in([1, 2, 3]),
            t.get("id").notIn([1, 2, 3]),
            t.get("id").eq(1),
            t.get("id").notEq(2),
            t.get("id").gt(1),
            t.get("id").gteq(2),
            t.get("id").lt(1),
            t.get("id").lteq(2),
            t.get("id").isNotDistinctFrom(1),
            t.get("id").isDistinctFrom(2),
            new Nodes.Grouping(new Nodes.SqlLiteral("sql literal")),
          ]),
        ),
      ]);
      expect(eql(original.invert(), expected)).toBe(true);
    });

    it("except removes binary predicates referencing a given column", () => {
      const t = table();
      const whereClause = new WhereClause([
        t.get("id").in([1, 2, 3]),
        t.get("name").eq(bindParam("Sean")),
        t.get("age").gteq(bindParam(30)),
      ]);
      const expected = new WhereClause([t.get("age").gteq(bindParam(30))]);
      expect(eql(whereClause.except("id", "name"), expected)).toBe(true);
    });

    it("except jumps over unhandled binds (like with OR) correctly", () => {
      const t = table();
      const wcs = Array.from(
        { length: 10 },
        (_, i) => new WhereClause([t.get(`id${i}`).eq(bindParam(i))]),
      );
      // wcs[0] + wcs[1] + wcs[2].or(wcs[3]) + wcs[4] + wcs[5] + wcs[6].or(wcs[7]) + wcs[8] + wcs[9]
      const wc = [
        wcs[1],
        wcs[2].or(wcs[3]),
        wcs[4],
        wcs[5],
        wcs[6].or(wcs[7]),
        wcs[8],
        wcs[9],
      ].reduce((acc, c) => concat(acc, c), wcs[0]);
      // wcs[0] + wcs[2].or(wcs[3]) + wcs[5] + wcs[6].or(wcs[7]) + wcs[9]
      const expected = [wcs[2].or(wcs[3]), wcs[5], wcs[6].or(wcs[7]), wcs[9]].reduce(
        (acc, c) => concat(acc, c),
        wcs[0],
      );
      const actual = wc.except("id1", "id2", "id4", "id7", "id8");
      expect(eql(actual, expected)).toBe(true);
    });

    it("ast groups its predicates with AND", () => {
      const t = table();
      const predicates = [t.get("id").in([1, 2, 3]), t.get("name").eq(bindParam(null))];
      const whereClause = new WhereClause(predicates);
      const expected = new Nodes.And(predicates);
      expect(whereClause.ast.eql(expected)).toBe(true);
    });

    it("ast wraps any SQL literals in parenthesis", () => {
      const t = table();
      const whereClause = new WhereClause([
        t.get("id").in([1, 2, 3]),
        new Nodes.SqlLiteral("foo = bar"),
      ]);
      const ast = whereClause.ast;
      expect(ast).toBeInstanceOf(Nodes.And);
      const children = (ast as Nodes.And).children;
      expect(children[1]).toBeInstanceOf(Nodes.Grouping);
    });

    it("ast removes any empty strings", () => {
      const t = table();
      const whereClause = new WhereClause([t.get("id").in([1, 2, 3])]);
      const whereClauseWithEmpty = new WhereClause([
        t.get("id").in([1, 2, 3]),
        new Nodes.SqlLiteral(""),
      ]);
      expect(whereClause.ast.eql(whereClauseWithEmpty.ast)).toBe(true);
    });

    it("or joins the two clauses using OR", () => {
      const t = table();
      const whereClause = new WhereClause([t.get("id").eq(bindParam(1))]);
      const otherClause = new WhereClause([t.get("name").eq(bindParam("Sean"))]);
      const expectedAst = new Nodes.Grouping(
        new Nodes.Or([t.get("id").eq(bindParam(1)), t.get("name").eq(bindParam("Sean"))]),
      );
      expect(whereClause.or(otherClause).ast.toSql()).toBe(expectedAst.toSql());
    });

    it("or returns an empty where clause when either side is empty", () => {
      const t = table();
      const whereClause = new WhereClause([t.get("id").eq(bindParam(1))]);
      expect(whereClause.or(WhereClause.empty()).isEmpty()).toBe(true);
      expect(WhereClause.empty().or(whereClause).isEmpty()).toBe(true);
    });

    it("or places common conditions before the OR", () => {
      const t = table();
      const a = new WhereClause([
        t.get("id").eq(bindParam(1)),
        t.get("name").eq(bindParam("Sean")),
      ]);
      const b = new WhereClause([
        t.get("id").eq(bindParam(1)),
        t.get("hair_color").eq(bindParam("black")),
      ]);
      const common = new WhereClause([t.get("id").eq(bindParam(1))]);
      const orClause = new WhereClause([t.get("name").eq(bindParam("Sean"))]).or(
        new WhereClause([t.get("hair_color").eq(bindParam("black"))]),
      );
      expect(eql(a.or(b), concat(common, orClause))).toBe(true);
    });

    it("or can detect identical or as being a common condition", () => {
      const t = table();
      const commonOr = new WhereClause([t.get("name").eq(bindParam("Sean"))]).or(
        new WhereClause([t.get("hair_color").eq(bindParam("black"))]),
      );
      const a = concat(commonOr, new WhereClause([t.get("id").eq(bindParam(1))]));
      const b = concat(commonOr, new WhereClause([t.get("foo").eq(bindParam("bar"))]));
      const newOr = new WhereClause([t.get("id").eq(bindParam(1))]).or(
        new WhereClause([t.get("foo").eq(bindParam("bar"))]),
      );
      expect(eql(a.or(b), concat(commonOr, newOr))).toBe(true);
    });

    it("or will use only common conditions if one side only has common conditions", () => {
      const t = table();
      const onlyCommon = new WhereClause([
        t.get("id").eq(bindParam(1)),
        new Nodes.SqlLiteral("foo = bar"),
      ]);
      const commonWithExtra = concat(
        onlyCommon,
        new WhereClause([t.get("extra").eq(bindParam("pluto"))]),
      );
      expect(eql(onlyCommon.or(commonWithExtra), onlyCommon)).toBe(true);
      expect(eql(commonWithExtra.or(onlyCommon), onlyCommon)).toBe(true);
    });

    it("supports hash equality", () => {
      // Ruby Hash equality (eql?/hash) has no direct JS equivalent.
      // Verify structural equality via predicates instead.
      const a1 = new WhereClause([new Nodes.SqlLiteral("a")]);
      const a2 = new WhereClause([new Nodes.SqlLiteral("a")]);
      const b = new WhereClause([new Nodes.SqlLiteral("b")]);
      expect(eql(a1, a2)).toBe(true);
      expect(eql(a1, b)).toBe(false);
    });
  });
});
