import { describe, it, expect, afterEach } from "vitest";
import { NoNilParamEncoder, Utils } from "./utils.js";

describe("Utils", () => {
  const initialPerformDeepMunge = Utils.performDeepMunge;
  afterEach(() => {
    Utils.performDeepMunge = initialPerformDeepMunge;
  });

  describe("NoNilParamEncoder.normalizeEncodeParams", () => {
    it("strips null entries from arrays", () => {
      expect(NoNilParamEncoder.normalizeEncodeParams(["a", null, "b"])).toEqual(["a", "b"]);
    });

    it("recurses into nested arrays", () => {
      expect(NoNilParamEncoder.normalizeEncodeParams({ a: { b: [null] } })).toEqual({
        a: { b: [] },
      });
    });

    it("preserves null leaves on hash values (only arrays are compacted)", () => {
      expect(NoNilParamEncoder.normalizeEncodeParams({ a: { b: null } })).toEqual({
        a: { b: null },
      });
    });

    it("preserves nested hashes inside arrays after compaction", () => {
      expect(
        NoNilParamEncoder.normalizeEncodeParams({ a: { b: [{ c: null }, null, { d: "1" }] } }),
      ).toEqual({
        a: { b: [{ c: null }, { d: "1" }] },
      });
    });

    it("leaves string and null leaves alone", () => {
      expect(NoNilParamEncoder.normalizeEncodeParams("foo")).toBe("foo");
      expect(NoNilParamEncoder.normalizeEncodeParams(null)).toBe(null);
    });
  });

  describe("normalizeEncodeParams", () => {
    it("compacts arrays when performDeepMunge is true (default)", () => {
      Utils.performDeepMunge = true;
      expect(Utils.normalizeEncodeParams({ x: [null, "1"] })).toEqual({ x: ["1"] });
    });

    it("preserves arrays when performDeepMunge is false", () => {
      Utils.performDeepMunge = false;
      expect(Utils.normalizeEncodeParams({ x: [null, "1"] })).toEqual({
        x: [null, "1"],
      });
    });

    it("always clones output hashes with a null prototype (defangs __proto__ keys)", () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}, "ok": "1"}');
      const out = Utils.normalizeEncodeParams(malicious);
      expect(Object.getPrototypeOf(out)).toBe(null);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });
  });

  describe("eachParamValue", () => {
    it("yields every string leaf", () => {
      const leaves: string[] = [];
      Utils.eachParamValue({ a: "1", b: ["2", { c: "3" }] }, (p) => void leaves.push(p));
      expect(leaves).toEqual(["1", "2", "3"]);
    });

    it("skips null leaves", () => {
      const leaves: string[] = [];
      Utils.eachParamValue({ a: null, b: ["x"] }, (p) => void leaves.push(p));
      expect(leaves).toEqual(["x"]);
    });
  });
});
