import { describe, expect, it } from "vitest";
import { BodyProxy } from "./body-proxy.js";

describe("BodyProxy method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and forward", () => {
    class Sub extends BodyProxy {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const proxy = new Sub(["a"], () => {});
    expect(proxy.tag()).toBe("sub");
    expect((proxy as unknown as { toArray(): string[] }).toArray()).toEqual(["a"]);
    expect(proxy instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(proxy)).toBe(Sub.prototype);
  });
});
