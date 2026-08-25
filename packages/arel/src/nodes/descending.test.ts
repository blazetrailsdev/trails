import { describe, it, expect } from "vitest";
import { uniq } from "../test-helpers/uniq.js";
import { Nodes } from "../index.js";

describe("TestDescending", () => {
  it("construct", () => {
    const descending = new Nodes.Descending("zomg");
    expect(descending.expr).toBe("zomg");
  });

  it("reverse", () => {
    const descending = new Nodes.Descending("zomg");
    const ascending = descending.reverse();
    expect(ascending).toBeInstanceOf(Nodes.Ascending);
    expect(ascending.expr).toBe(descending.expr);
  });

  it("direction", () => {
    const descending = new Nodes.Descending("zomg");
    expect(descending.direction).toBe("desc");
  });

  it("ascending?", () => {
    const descending = new Nodes.Descending("zomg");
    expect(descending.isAscending()).toBeFalsy();
  });

  it("descending?", () => {
    const descending = new Nodes.Descending("zomg");
    expect(descending.isDescending()).toBeTruthy();
  });

  it("equality with same ivars", () => {
    const array = [new Nodes.Descending("zomg"), new Nodes.Descending("zomg")];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [new Nodes.Descending("zomg"), new Nodes.Descending("zomg!")];
    expect(uniq(array).length).toBe(2);
  });
});
