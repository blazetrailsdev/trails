import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Nodes, Visitors } from "../index.js";
import type { Node } from "./node.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

const words = (...names: string[]): Node[] => names as unknown as Node[];

describe("TestSelectCore", () => {
  it("clone", () => {
    const core = new Nodes.SelectCore();
    core.froms = words("a", "b", "c") as unknown as Node;
    core.projections = words("d", "e", "f");
    core.wheres = words("g", "h", "i");

    const dolly = core.clone();

    expect(dolly.froms).toEqual(core.froms);
    expect(dolly.projections).toEqual(core.projections);
    expect(dolly.wheres).toEqual(core.wheres);

    assertNotSame(core.froms, dolly.froms);
    assertNotSame(core.projections, dolly.projections);
    assertNotSame(core.wheres, dolly.wheres);
  });

  it("set quantifier", () => {
    const core = new Nodes.SelectCore();
    core.setQuantifier = new Nodes.Distinct();
    const viz = new Visitors.ToSql(fakeRecordConnection);
    expect(viz.compile(core)).toMatch("DISTINCT");
  });

  it("equality with same ivars", () => {
    const core1 = new Nodes.SelectCore();
    core1.froms = words("a", "b", "c") as unknown as Node;
    core1.projections = words("d", "e", "f");
    core1.wheres = words("g", "h", "i");
    core1.groups = words("j", "k", "l");
    core1.windows = words("m", "n", "o");
    core1.havings = words("p", "q", "r");
    core1.comment = new Nodes.Comment(["comment"]);
    const core2 = new Nodes.SelectCore();
    core2.froms = words("a", "b", "c") as unknown as Node;
    core2.projections = words("d", "e", "f");
    core2.wheres = words("g", "h", "i");
    core2.groups = words("j", "k", "l");
    core2.windows = words("m", "n", "o");
    core2.havings = words("p", "q", "r");
    core2.comment = new Nodes.Comment(["comment"]);
    const array = [core1, core2];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const core1 = new Nodes.SelectCore();
    core1.froms = words("a", "b", "c") as unknown as Node;
    core1.projections = words("d", "e", "f");
    core1.wheres = words("g", "h", "i");
    core1.groups = words("j", "k", "l");
    core1.windows = words("m", "n", "o");
    core1.havings = words("p", "q", "r");
    core1.comment = new Nodes.Comment(["comment"]);
    const core2 = new Nodes.SelectCore();
    core2.froms = words("a", "b", "c") as unknown as Node;
    core2.projections = words("d", "e", "f");
    core2.wheres = words("g", "h", "i");
    core2.groups = words("j", "k", "l");
    core2.windows = words("m", "n", "o");
    core2.havings = words("l", "o", "l");
    core2.comment = new Nodes.Comment(["comment"]);
    let array = [core1, core2];
    expect(uniq(array).length).toBe(2);
    core2.havings = words("p", "q", "r");
    core2.comment = new Nodes.Comment(["other"]);
    array = [core1, core2];
    expect(uniq(array).length).toBe(2);
  });
});
