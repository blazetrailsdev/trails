import { describe, it, expect } from "vitest";
import { Nodes, Visitors } from "../index.js";

describe("TestBin", () => {
  it("new", () => {
    const node = new Nodes.Bin("zomg");
    expect(node).toBeInstanceOf(Nodes.Bin);
  });

  it("equality with same ivars", () => {
    const a = new Nodes.Bin("zomg");
    const b = new Nodes.Bin("zomg");
    expect(a).toEqual(b);
  });

  it("inequality with different ivars", () => {
    const a = new Nodes.Bin("zomg");
    const b = new Nodes.Bin("zomg!");
    expect(a).not.toEqual(b);
  });

  it("default to sql", () => {
    const node = new Nodes.Bin(new Nodes.SqlLiteral("zomg"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("zomg");
  });

  it("mysql to sql", () => {
    const node = new Nodes.Bin(new Nodes.SqlLiteral("zomg"));
    const sql = new Visitors.MySQL().compile(node);
    expect(sql).toBe("BINARY zomg");
  });
});
