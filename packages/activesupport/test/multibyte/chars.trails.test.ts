import { describe, expect, it } from "vitest";
import { Chars } from "../../lib/multibyte/chars.js";

describe("Chars method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and forward", () => {
    class Sub extends Chars {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const chars = new Sub("héllo");
    expect(chars.tag()).toBe("sub");
    expect((chars as unknown as { upcase(): Chars }).upcase().toS()).toBe("HÉLLO");
    expect(chars instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(chars)).toBe(Sub.prototype);
  });
});
