import { describe, expect, it } from "vitest";
import { Session } from "./session.js";

describe("Session::Options without a returned Proxy", () => {
  it("lets a subclass with a #private field construct and answer its members", () => {
    class Sub extends Session.Options {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const options = new Sub(null, { a: 1, b: 2 });
    expect(options.tag()).toBe("sub");
    options.set("c", 3);
    expect(options.get("a")).toBe(1);
    expect(options.valuesAt("a", "c")).toEqual([1, 3]);
    expect(options.toHash()).toEqual({ a: 1, b: 2, c: 3 });
    expect((options as unknown as Record<string, unknown>).a).toBeUndefined();
  });
});
