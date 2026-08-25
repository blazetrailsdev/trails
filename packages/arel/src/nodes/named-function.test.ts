import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("TestNamedFunction", () => {
  it("construct", () => {
    const fn = new Nodes.NamedFunction("omg", "zomg" as unknown as Node[]);
    expect(fn.name).toBe("omg");
    expect(fn.expressions).toBe("zomg");
  });

  it("function alias", () => {
    let fn = new Nodes.NamedFunction("omg", "zomg" as unknown as Node[]);
    fn = fn.as("wth");
    expect(fn.name).toBe("omg");
    expect(fn.expressions).toBe("zomg");
    expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
    expect(String(fn.alias)).toBe("wth");
  });

  it("construct with alias", () => {
    const fn = new Nodes.NamedFunction("omg", "zomg" as unknown as Node[], "wth");
    expect(fn.name).toBe("omg");
    expect(fn.expressions).toBe("zomg");
    expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
    expect(String(fn.alias)).toBe("wth");
  });

  it("equality with same ivars", () => {
    const array = [
      new Nodes.NamedFunction("omg", "zomg" as unknown as Node[], "wth"),
      new Nodes.NamedFunction("omg", "zomg" as unknown as Node[], "wth"),
    ];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [
      new Nodes.NamedFunction("omg", "zomg" as unknown as Node[], "wth"),
      new Nodes.NamedFunction("zomg", "zomg" as unknown as Node[], "wth"),
    ];
    expect(uniq(array).length).toBe(2);
  });
});
