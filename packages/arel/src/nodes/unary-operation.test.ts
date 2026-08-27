import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("TestUnaryOperation", () => {
  it("construct", () => {
    const operation = new Nodes.UnaryOperation("-", 1 as unknown as Node);
    expect(operation.operator).toBe("-");
    expect(operation.expr).toBe(1);
  });

  it("operation alias", () => {
    const operation = new Nodes.UnaryOperation("-", 1 as unknown as Node);
    const aliaz = operation.as("zomg") as Nodes.As;
    expect(aliaz).toBeInstanceOf(Nodes.As);
    expect(aliaz.left).toBe(operation);
    expect(String(aliaz.right)).toBe("zomg");
  });

  it("operation ordering", () => {
    const operation = new Nodes.UnaryOperation("-", 1 as unknown as Node);
    const ordering = operation.desc();
    expect(ordering).toBeInstanceOf(Nodes.Descending);
    expect(ordering.expr).toBe(operation);
    expect(ordering.isDescending()).toBeTruthy();
  });

  it("equality with same ivars", () => {
    const array = [
      new Nodes.UnaryOperation("-", 1 as unknown as Node),
      new Nodes.UnaryOperation("-", 1 as unknown as Node),
    ];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [
      new Nodes.UnaryOperation("-", 1 as unknown as Node),
      new Nodes.UnaryOperation("-", 2 as unknown as Node),
    ];
    expect(uniq(array).length).toBe(2);
  });
});
