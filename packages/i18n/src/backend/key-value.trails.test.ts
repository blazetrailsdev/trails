import { describe, expect, it } from "vitest";
import { SubtreeProxy } from "./key-value.js";

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    const store = {
      get: (key: string) => (key === "en.foo.bar" ? JSON.stringify("baz") : null),
      set: () => {},
      keys: () => [],
    };
    class Sub extends SubtreeProxy {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub("en.foo", store as never);
    expect(sub.secret()).toBe(1);
    expect(sub.isNil()).toBe(true);
    expect(sub.get("bar")).toBe("baz");
    expect(sub.hasKey("bar")).toBe(true);
    expect(sub.hasKey("missing")).toBe(false);
    expect(sub.isNil()).toBe(false);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
