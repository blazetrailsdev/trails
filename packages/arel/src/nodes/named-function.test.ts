import { describe, it, expect } from "vitest";
import { Table, star, Nodes } from "../index.js";

describe("TestNamedFunction", () => {
  const users = new Table("users");
  it("construct", () => {
    const fn = new Nodes.NamedFunction("COUNT", [star]);
    expect(fn.name).toBe("COUNT");
    expect(fn.expressions.length).toBe(1);
  });

  it("function alias", () => {
    const fn = new Nodes.NamedFunction("omg", [new Nodes.SqlLiteral("zomg")]);
    const returned = fn.as("wth");
    expect(returned).toBe(fn);
    expect(fn.name).toBe("omg");
    expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
    expect((fn.alias as Nodes.SqlLiteral).value).toBe("wth");
  });

  it("construct with alias", () => {
    const sum = new Nodes.NamedFunction("SUM", [users.get("age")]);
    expect(users.project(sum.as("total")).toSql()).toBe(
      'SELECT SUM("users"."age") AS total FROM "users"',
    );
  });

  it("equality with same ivars", () => {
    const a = new Nodes.NamedFunction("COUNT", [star]);
    const b = new Nodes.NamedFunction("COUNT", [star]);
    expect(a.name).toBe(b.name);
  });

  it("inequality with different ivars", () => {
    const a = new Nodes.NamedFunction("COUNT", [star]);
    const b = new Nodes.NamedFunction("SUM", [star]);
    expect(a.name).not.toBe(b.name);
  });
});
