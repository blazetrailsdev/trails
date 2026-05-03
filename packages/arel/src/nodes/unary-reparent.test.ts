import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

// Pins Rails-faithful inheritance for nodes that previously extended
// Node directly. Rails (unary.rb): `Not < Unary`. Rails (window.rb):
// `Rows < Unary`, `Range < Unary`, `Preceding < Unary`, `Following < Unary`.
// Inheritance from Unary → NodeExpression brings the Predications/Math
// /AliasPredication mixins along — pinned indirectly via .as() / .eq().
describe("Unary reparenting (Rails fidelity)", () => {
  describe("Not extends Unary", () => {
    it("instanceof Unary", () => {
      const n = new Nodes.Not(new Nodes.Quoted(true));
      expect(n).toBeInstanceOf(Nodes.Unary);
    });

    it("inherits Predications mixin (.eq)", () => {
      const n = new Nodes.Not(new Nodes.Quoted(true));
      expect(typeof (n as unknown as { eq?: unknown }).eq).toBe("function");
    });

    it("inherits AliasPredication mixin (.as)", () => {
      const n = new Nodes.Not(new Nodes.Quoted(true));
      const aliased = (n as unknown as { as: (s: string) => unknown }).as("flag");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });
  });

  describe("Lateral extends Unary", () => {
    const inner = new Nodes.Quoted(1);
    it("instanceof Unary", () => {
      expect(new Nodes.Lateral(inner)).toBeInstanceOf(Nodes.Unary);
    });

    it("stores the subquery in expr (Rails: visit reads o.expr)", () => {
      const lat = new Nodes.Lateral(inner);
      expect(lat.expr).toBe(inner);
    });

    it("subquery getter returns expr (back-compat)", () => {
      const lat = new Nodes.Lateral(inner);
      expect(lat.subquery).toBe(lat.expr);
    });
  });

  describe("GroupingElement / Cube / RollUp / GroupingSet extend Unary", () => {
    it.each([
      ["GroupingElement", (vs: Nodes.Node[]) => new Nodes.GroupingElement(vs)],
      ["Cube", (vs: Nodes.Node[]) => new Nodes.Cube(vs)],
      ["RollUp", (vs: Nodes.Node[]) => new Nodes.RollUp(vs)],
      ["GroupingSet", (vs: Nodes.Node[]) => new Nodes.GroupingSet(vs)],
    ])("%s instanceof Unary", (_name, build) => {
      const node = build([new Nodes.Quoted(1), new Nodes.Quoted(2)]);
      expect(node).toBeInstanceOf(Nodes.Unary);
    });

    it("stores children in expr (Rails: visit reads o.expr)", () => {
      const a = new Nodes.Quoted(1);
      const b = new Nodes.Quoted(2);
      const ge = new Nodes.GroupingElement([a, b]);
      expect(ge.expr).toEqual([a, b]);
    });

    it("expressions getter returns expr (back-compat)", () => {
      const ge = new Nodes.GroupingElement([new Nodes.Quoted(1)]);
      expect(ge.expressions).toBe(ge.expr);
    });

    it("normalises a single Node into an array (preserved behaviour)", () => {
      const single = new Nodes.Quoted(1);
      const ge = new Nodes.GroupingElement(single);
      expect(ge.expressions).toEqual([single]);
    });
  });

  describe("Window framing nodes extend Unary", () => {
    it.each([
      ["Rows", () => new Nodes.Rows(new Nodes.Quoted(1))],
      ["Range", () => new Nodes.Range(new Nodes.Quoted(1))],
      ["Preceding", () => new Nodes.Preceding(new Nodes.Quoted(1))],
      ["Following", () => new Nodes.Following(new Nodes.Quoted(1))],
    ])("%s instanceof Unary", (_name, build) => {
      expect(build()).toBeInstanceOf(Nodes.Unary);
    });

    it("CurrentRow stays Node-only (Rails: CurrentRow < Node)", () => {
      const cr = new Nodes.CurrentRow();
      expect(cr).toBeInstanceOf(Nodes.Node);
      expect(cr).not.toBeInstanceOf(Nodes.Unary);
    });
  });
});
