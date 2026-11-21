import { describe, it, expect } from "vitest";
import { Nodes } from "../../lib/index.js";
import { uniq } from "../support/uniq.js";

describe("TestInfixOperation", () => {
  it("construct", () => {
    const operation = new Nodes.InfixOperation("+", 1, 2);
    expect(operation.operator).toBe("+");
    expect(operation.left).toBe(1);
    expect(operation.right).toBe(2);
  });

  it("operation alias", () => {
    const operation = new Nodes.InfixOperation("+", 1, 2);
    const aliaz = operation.as("zomg");
    expect(aliaz).toBeInstanceOf(Nodes.As);
    expect(aliaz.left).toBe(operation);
    expect(String(aliaz.right)).toBe("zomg");
  });

  it("operation ordering", () => {
    const operation = new Nodes.InfixOperation("+", 1, 2);
    const ordering = operation.desc();
    expect(ordering).toBeInstanceOf(Nodes.Descending);
    expect(ordering.expr).toBe(operation);
    expect(ordering.isDescending()).toBeTruthy();
  });

  it("equality with same ivars", () => {
    const array = [new Nodes.InfixOperation("+", 1, 2), new Nodes.InfixOperation("+", 1, 2)];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [new Nodes.InfixOperation("+", 1, 2), new Nodes.InfixOperation("+", 1, 3)];
    expect(uniq(array).length).toBe(2);
  });
});
