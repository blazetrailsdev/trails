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
