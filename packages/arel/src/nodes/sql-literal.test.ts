import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { sql, Nodes, Visitors } from "../index.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { uniq } from "../test-helpers/uniq.js";

describe("SqlLiteralTest", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const compile = (node: Nodes.Node): string => visitor.compile(node);

  describe("sql", () => {
    it("makes a sql literal node", () => {
      const literal = sql("foo");
      expect(literal).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });

  describe("count", () => {
    it("makes a count node", () => {
      const node = new Nodes.SqlLiteral("*").count();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(` COUNT(*) `));
    });

    it("makes a distinct node", () => {
      const node = new Nodes.SqlLiteral("*").count(true);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(` COUNT(DISTINCT *) `));
    });
  });

  describe("equality", () => {
    it("makes an equality node", () => {
      const node = new Nodes.SqlLiteral("foo").eq(1);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(` foo = 1 `));
    });

    it("is equal with equal contents", () => {
      const array = [new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("foo")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different contents", () => {
      const array = [new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe('grouped "or" equality', () => {
    it("makes a grouping node with an or node", () => {
      const node = new Nodes.SqlLiteral("foo").eqAny([1, 2]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(` (foo = 1 OR foo = 2) `));
    });
  });

  describe('grouped "and" equality', () => {
    it("makes a grouping node with an and node", () => {
      const node = new Nodes.SqlLiteral("foo").eqAll([1, 2]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(` (foo = 1 AND foo = 2) `));
    });
  });

  describe("serialization", () => {
    it("serializes into YAML", () => {
      const coder = { scalar: "" };
      new Nodes.SqlLiteral("foo").encodeWith(coder);
      expect(coder.scalar).toBe("foo");
    });
  });

  describe("addition", () => {
    it("generates a Fragments node", () => {
      const sql1 = sql("SELECT *");
      const sql2 = sql("FROM users");
      const fragments = sql1.plus(sql2);
      expect(fragments).toBeInstanceOf(Nodes.Fragments);
      expect(fragments.values).toEqual([sql1, sql2]);
    });

    it("fails if joined with something that is not an Arel node", () => {
      const literal = sql("SELECT *");
      expect(() => literal.plus("Not a node")).toThrow(ArgumentError);
    });
  });
});
