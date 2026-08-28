import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "./test-helpers/connection.js";
import { Table, Nodes, Visitors } from "./index.js";

describe("TestFactoryMethods (trails)", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql(fakeRecordConnection);

  it("lower wraps non-Node arguments via buildQuoted", () => {
    const fn = users.lower("name");
    expect((fn.expressions as Nodes.NodeOrValue[])[0]).toBeInstanceOf(Nodes.Quoted);
    expect(visitor.compile(fn)).toBe("LOWER('name')");
  });

  it("coalesce compiles both expressions", () => {
    const fn = users.coalesce(users.get("name"), new Nodes.Quoted("default"));
    expect(visitor.compile(fn)).toBe('COALESCE("users"."name", \'default\')');
  });

  it("cast compiles the column and the target type", () => {
    const fn = users.cast(users.get("age"), "VARCHAR");
    expect(visitor.compile(fn)).toBe('CAST("users"."age" AS VARCHAR)');
  });

  it("cast delegates to .as(type) for a retryable alias", () => {
    const fn = users.cast(users.get("age"), "VARCHAR");
    const asNode = (fn.expressions as Nodes.NodeOrValue[])[0] as Nodes.As;
    expect(asNode).toBeInstanceOf(Nodes.As);
    const right = asNode.right as Nodes.SqlLiteral;
    expect(right).toBeInstanceOf(Nodes.SqlLiteral);
    expect(right.retryable).toBe(true);
  });

  it("createTrue and createFalse compile to TRUE and FALSE", () => {
    expect(visitor.compile(users.createTrue())).toBe("TRUE");
    expect(visitor.compile(users.createFalse())).toBe("FALSE");
  });

  describe("FactoryMethods is mixed into every Node subclass", () => {
    const eq = users.get("id").eq(1);
    it("createTrue available on Equality", () => {
      expect(eq.createTrue()).toBeInstanceOf(Nodes.True);
    });
    it("grouping available on Equality", () => {
      expect(eq.grouping(eq)).toBeInstanceOf(Nodes.Grouping);
    });
    it("createAnd available on Equality", () => {
      const and = eq.createAnd([eq, eq]);
      expect(and).toBeInstanceOf(Nodes.And);
      expect(and.children.length).toBe(2);
    });
  });
});
