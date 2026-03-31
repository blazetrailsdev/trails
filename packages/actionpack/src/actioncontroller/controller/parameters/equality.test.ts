import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersAccessorsTest", () => {
  it("parameters are not equal to the hash", () => {
    const params = new Parameters({ a: "1" });
    expect(params.equals({ a: "1" } as any)).toBe(false);
  });

  it("not eql? to equivalent hash", () => {
    const params = new Parameters({ a: "1" });
    expect(params.eql({ a: "1" } as any)).toBe(false);
  });

  it("not eql? to equivalent nested hash", () => {
    const params = new Parameters({ a: { b: "1" } });
    expect(params.eql({ a: { b: "1" } } as any)).toBe(false);
  });

  it("not eql? when permitted is different", () => {
    const a = new Parameters({ x: "1" }).permitAll();
    const b = new Parameters({ x: "1" });
    expect(a.eql(b)).toBe(false);
  });

  it("eql? when equivalent", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "1" });
    expect(a.eql(b)).toBe(true);
  });

  it("has_value? converts hashes to parameters", () => {
    const params = new Parameters({ a: { nested: "value" } });
    // After accessing, the internal hash should be converted
    params.get("a");
    expect(params.hasValue(params.get("a"))).toBe(true);
  });

  it("has_value? works with parameters", () => {
    const inner = new Parameters({ x: "1" });
    const params = new Parameters({ a: inner });
    expect(params.hasValue(inner)).toBe(true);
  });
});
