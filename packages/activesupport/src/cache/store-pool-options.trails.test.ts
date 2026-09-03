import { describe, expect, it } from "vitest";
import { Store } from "./store.js";

describe("Store.retrievePoolOptions", () => {
  it("defaults to the default pool options when :pool is absent", () => {
    expect(Store.retrievePoolOptions({})).toEqual({ size: 5, timeout: 5 });
  });

  it("returns false for pool: false and for a stored nil", () => {
    expect(Store.retrievePoolOptions({ pool: false })).toBe(false);
    expect(Store.retrievePoolOptions({ pool: null })).toBe(false);
  });

  it("merges a Hash over the default pool options, coercing size and timeout", () => {
    expect(Store.retrievePoolOptions({ pool: { size: "12", timeout: "1.5" } })).toEqual({
      size: 12,
      timeout: 1.5,
    });
  });

  it("raises for a non-Hash :pool argument", () => {
    expect(() => Store.retrievePoolOptions({ pool: "12" })).toThrow(
      'Invalid :pool argument, expected Hash, got: "12"',
    );
  });

  it("raises for pool size and timeout that cannot be converted", () => {
    expect(() => Store.retrievePoolOptions({ pool: { size: [] } })).toThrow(
      "can't convert Array into Integer",
    );
    expect(() => Store.retrievePoolOptions({ pool: { timeout: [] } })).toThrow(
      "can't convert Array into Float",
    );
    expect(() => Store.retrievePoolOptions({ pool: { size: "" } })).toThrow(
      'invalid value for Integer(): ""',
    );
    expect(() => Store.retrievePoolOptions({ pool: { size: " " } })).toThrow(
      'invalid value for Integer(): " "',
    );
    expect(() => Store.retrievePoolOptions({ pool: { size: "1.5" } })).toThrow(
      'invalid value for Integer(): "1.5"',
    );
    expect(() => Store.retrievePoolOptions({ pool: { timeout: "" } })).toThrow(
      'invalid value for Float(): ""',
    );
  });

  it("accepts the Float literal forms Kernel#Float does", () => {
    expect(Store.retrievePoolOptions({ pool: { timeout: ".5" } })).toEqual({
      size: 5,
      timeout: 0.5,
    });
    expect(Store.retrievePoolOptions({ pool: { timeout: ".5e2" } })).toEqual({
      size: 5,
      timeout: 50,
    });
    expect(Store.retrievePoolOptions({ pool: { timeout: "0x1.8p1" } })).toEqual({
      size: 5,
      timeout: 3,
    });
    expect(() => Store.retrievePoolOptions({ pool: { timeout: "1." } })).toThrow(
      'invalid value for Float(): "1."',
    );
  });

  it("converts pool size and timeout the way Kernel#Integer and Kernel#Float do", () => {
    expect(Store.retrievePoolOptions({ pool: { size: "012" } })).toEqual({ size: 10, timeout: 5 });
    expect(Store.retrievePoolOptions({ pool: { size: "1_000" } })).toEqual({
      size: 1000,
      timeout: 5,
    });
    expect(Store.retrievePoolOptions({ pool: { size: 3.7, timeout: " 1.5 " } })).toEqual({
      size: 3,
      timeout: 1.5,
    });
  });

  it("deletes the :pool key from the options it is given", () => {
    const options = { pool: false, namespace: "foo" };
    Store.retrievePoolOptions(options);
    expect("pool" in options).toBe(false);
  });
});
