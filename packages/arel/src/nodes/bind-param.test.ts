import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("BindParam", () => {
  it("is equal to other bind params with the same value", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.BindParam(42);
    expect(a.value).toBe(b.value);
  });

  it("is not equal to other nodes", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.Quoted(42);
    expect(a).not.toBeInstanceOf(Nodes.Quoted);
    expect(b).not.toBeInstanceOf(Nodes.BindParam);
  });

  it("is not equal to bind params with different values", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.BindParam(99);
    expect(a.value).not.toBe(b.value);
  });

  describe("valueBeforeTypeCast", () => {
    it("returns value when value has no valueBeforeTypeCast", () => {
      const bp = new Nodes.BindParam(42);
      expect(bp.valueBeforeTypeCast()).toBe(42);
    });

    it("delegates to value.valueBeforeTypeCast when present", () => {
      const bp = new Nodes.BindParam({ valueBeforeTypeCast: () => "raw" });
      expect(bp.valueBeforeTypeCast()).toBe("raw");
    });
  });

  describe("isInfinite", () => {
    it("returns null when value has no isInfinite", () => {
      const bp = new Nodes.BindParam(42);
      expect(bp.isInfinite()).toBeNull();
    });

    it("delegates to value.isInfinite when present — positive", () => {
      const bp = new Nodes.BindParam({ isInfinite: () => 1 });
      expect(bp.isInfinite()).toBe(1);
    });

    it("delegates to value.isInfinite when present — negative", () => {
      const bp = new Nodes.BindParam({ isInfinite: () => -1 });
      expect(bp.isInfinite()).toBe(-1);
    });
  });

  describe("isUnboundable", () => {
    it("returns false when value has no isUnboundable", () => {
      const bp = new Nodes.BindParam(42);
      expect(bp.isUnboundable()).toBe(false);
    });

    it("delegates to value.isUnboundable when present", () => {
      const bp = new Nodes.BindParam({ isUnboundable: () => 1 });
      expect(bp.isUnboundable()).toBe(1);
    });

    it("propagates negative unboundable sign", () => {
      const bp = new Nodes.BindParam({ isUnboundable: () => -1 });
      expect(bp.isUnboundable()).toBe(-1);
    });
  });
});
