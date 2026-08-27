import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("BindParam", () => {
  describe("toSql emits the ? placeholder", () => {
    it("renders a scalar value as ?", () => {
      expect(new Nodes.BindParam(1).toSql()).toBe("?");
    });

    it("renders a null value as ?", () => {
      expect(new Nodes.BindParam(null).toSql()).toBe("?");
    });

    it("renders a valueless bind param as ?", () => {
      expect(new Nodes.BindParam().toSql()).toBe("?");
    });
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

  describe("isNil", () => {
    it("is true when wrapping a bare null", () => {
      expect(new Nodes.BindParam(null).isNil()).toBe(true);
    });

    it("is false for a valueless positional-bind placeholder", () => {
      expect(new Nodes.BindParam().isNil()).toBe(false);
    });

    it("is false when wrapping a non-nil scalar", () => {
      expect(new Nodes.BindParam(42).isNil()).toBe(false);
    });

    it("delegates to value.isNil when present — true", () => {
      const bp = new Nodes.BindParam({ isNil: () => true });
      expect(bp.isNil()).toBe(true);
    });

    it("delegates to value.isNil when present — false", () => {
      const bp = new Nodes.BindParam({ isNil: () => false });
      expect(bp.isNil()).toBe(false);
    });
  });

  describe("isInfinite", () => {
    it("returns false when value has no isInfinite", () => {
      const bp = new Nodes.BindParam(42);
      expect(bp.isInfinite()).toBe(false);
    });

    it("delegates to value.isInfinite when present — positive", () => {
      const bp = new Nodes.BindParam({ isInfinite: () => 1 });
      expect(bp.isInfinite()).toBe(1);
    });

    it("delegates to value.isInfinite when present — negative", () => {
      const bp = new Nodes.BindParam({ isInfinite: () => -1 });
      expect(bp.isInfinite()).toBe(-1);
    });

    it("reports the sign for a bare ±Infinity value, which Float answers in Ruby", () => {
      expect(new Nodes.BindParam(Infinity).isInfinite()).toBe(1);
      expect(new Nodes.BindParam(-Infinity).isInfinite()).toBe(-1);
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
