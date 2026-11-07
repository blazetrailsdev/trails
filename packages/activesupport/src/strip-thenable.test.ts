import { describe, expect, it } from "vitest";
import { stripThenable } from "./strip-thenable.js";

class Lazy {
  #secret = 42;
  then(onfulfilled: (value: string) => unknown) {
    return Promise.resolve("loaded").then(onfulfilled);
  }
  get secret() {
    return this.#secret;
  }
}

describe("stripThenable", () => {
  it("returns its argument without a Proxy", () => {
    const obj = new Lazy();
    const stripped = stripThenable(obj);
    expect(stripped).toBe(obj);
    expect((stripped as Lazy).secret).toBe(42);
  });

  it("resolves an await to the object itself", async () => {
    const obj = new Lazy();
    expect(await Promise.resolve(stripThenable(obj))).toBe(obj);
    expect(await (async () => stripThenable(obj))()).toBe(obj);
  });

  it("leaves the object awaitable once resolved", async () => {
    const obj = new Lazy();
    await Promise.resolve(stripThenable(obj));
    expect(Object.hasOwn(obj, "then")).toBe(false);
    expect(await obj).toBe("loaded");
  });

  it("is idempotent", async () => {
    const obj = new Lazy();
    stripThenable(stripThenable(obj));
    expect(await Promise.resolve(obj)).toBe(obj);
    expect(await obj).toBe("loaded");
  });

  it("is consumed by the first read of then, incidental or not", async () => {
    const obj = stripThenable(new Lazy()) as Lazy;
    expect(typeof obj.then).toBe("undefined");
    expect(await Promise.resolve(obj)).toBe("loaded");
  });

  it("raises on a non-extensible object", () => {
    expect(() => stripThenable(Object.freeze(new Lazy()))).toThrow(TypeError);
  });

  it("raises on an object with its own then", () => {
    expect(() => stripThenable({ then: () => undefined })).toThrow(TypeError);
  });
});
