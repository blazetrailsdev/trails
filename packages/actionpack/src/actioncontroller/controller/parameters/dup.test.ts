import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersDupTest", () => {
  it("a duplicate maintains the original's permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const dup = params.deepDup();
    expect(dup.permitted).toBe(true);
  });

  it("a duplicate maintains the original's parameters", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const dup = params.deepDup();
    expect(dup._toRawHash()).toEqual({ a: "1", b: "2" });
  });

  it("changes to a duplicate's parameters do not affect the original", () => {
    const params = new Parameters({ a: "1" });
    const dup = params.deepDup();
    dup.set("a", "2");
    expect(params.get("a")).toBe("1");
  });

  it("changes to a duplicate's permitted status do not affect the original", () => {
    const params = new Parameters({ a: "1" });
    const dup = params.deepDup();
    dup.permitBang();
    expect(params.permitted).toBe(false);
  });

  it("deep_dup content", () => {
    const params = new Parameters({ a: { nested: "value" } });
    const dup = params.deepDup();
    (dup._toRawHash().a as any).nested = "changed";
    expect((params._toRawHash().a as any).nested).toBe("value");
  });

  it("deep_dup @permitted", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.deepDup().permitted).toBe(true);
  });

  it("deep_dup @permitted is being copied", () => {
    const params = new Parameters({ a: "1" });
    expect(params.deepDup().permitted).toBe(false);
    const permitted = params.permitAll();
    expect(permitted.deepDup().permitted).toBe(true);
  });
});
