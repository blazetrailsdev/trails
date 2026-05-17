import { describe, it, expect, afterEach } from "vitest";
import { RequestUtils } from "./utils.js";

describe("RequestUtils", () => {
  const initialPerformDeepMunge = RequestUtils.performDeepMunge;
  afterEach(() => {
    RequestUtils.performDeepMunge = initialPerformDeepMunge;
  });

  describe("deepMunge", () => {
    it("strips null entries from arrays", () => {
      expect(RequestUtils.deepMunge(["a", null, "b"])).toEqual(["a", "b"]);
    });

    it("recurses into nested arrays", () => {
      expect(RequestUtils.deepMunge({ a: { b: [null] } })).toEqual({ a: { b: [] } });
    });

    it("preserves null leaves on hash values (only arrays are compacted)", () => {
      expect(RequestUtils.deepMunge({ a: { b: null } })).toEqual({ a: { b: null } });
    });

    it("preserves nested hashes inside arrays after compaction", () => {
      expect(RequestUtils.deepMunge({ a: { b: [{ c: null }, null, { d: "1" }] } })).toEqual({
        a: { b: [{ c: null }, { d: "1" }] },
      });
    });

    it("leaves string and null leaves alone", () => {
      expect(RequestUtils.deepMunge("foo")).toBe("foo");
      expect(RequestUtils.deepMunge(null)).toBe(null);
    });
  });

  describe("normalizeEncodeParams", () => {
    it("compacts arrays when performDeepMunge is true (default)", () => {
      RequestUtils.performDeepMunge = true;
      expect(RequestUtils.normalizeEncodeParams({ x: [null, "1"] })).toEqual({ x: ["1"] });
    });

    it("preserves arrays when performDeepMunge is false", () => {
      RequestUtils.performDeepMunge = false;
      expect(RequestUtils.normalizeEncodeParams({ x: [null, "1"] })).toEqual({
        x: [null, "1"],
      });
    });

    it("always clones output hashes with a null prototype (defangs __proto__ keys)", () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}, "ok": "1"}');
      const out = RequestUtils.normalizeEncodeParams(malicious);
      expect(Object.getPrototypeOf(out)).toBe(null);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });
  });

  describe("eachParamValue", () => {
    it("yields every string leaf", () => {
      const leaves = Array.from(RequestUtils.eachParamValue({ a: "1", b: ["2", { c: "3" }] }));
      expect(leaves).toEqual(["1", "2", "3"]);
    });

    it("skips null leaves", () => {
      const leaves = Array.from(RequestUtils.eachParamValue({ a: null, b: ["x"] }));
      expect(leaves).toEqual(["x"]);
    });
  });
});
