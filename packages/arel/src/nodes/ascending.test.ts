import { describe, it, expect } from "vitest";
import { uniq } from "../test-helpers/uniq.js";
import { Nodes } from "../index.js";

describe("TestAscending", () => {
  it("construct", () => {
    const ascending = new Nodes.Ascending("zomg");
    expect(ascending.expr).toBe("zomg");
  });

  it("reverse", () => {
    const ascending = new Nodes.Ascending("zomg");
    const descending = ascending.reverse();
    expect(descending).toBeInstanceOf(Nodes.Descending);
    expect(descending.expr).toBe(ascending.expr);
  });

  it("direction", () => {
    const ascending = new Nodes.Ascending("zomg");
    expect(ascending.direction).toBe("asc");
  });

  it("ascending?", () => {
    const ascending = new Nodes.Ascending("zomg");
    expect(ascending.isAscending()).toBeTruthy();
  });

  it("descending?", () => {
    const ascending = new Nodes.Ascending("zomg");
    expect(ascending.isDescending()).toBeFalsy();
  });

  it("equality with same ivars", () => {
    const array = [new Nodes.Ascending("zomg"), new Nodes.Ascending("zomg")];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [new Nodes.Ascending("zomg"), new Nodes.Ascending("zomg!")];
    expect(uniq(array).length).toBe(2);
  });
});
