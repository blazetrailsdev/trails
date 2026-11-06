import { describe, expect, it } from "vitest";
import { XmlMarkup } from "./xmlmarkup.js";
import { XmlBase } from "./xmlbase.js";

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends XmlMarkup {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const target = {
      out: "",
      append(text: string) {
        this.out += text;
        return this;
      },
    };
    const sub = new Sub({ target }) as Sub & Record<string, (...args: unknown[]) => unknown>;
    expect(sub.secret()).toBe(1);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
    sub.hello("world");
    expect(target.out).toBe("<hello>world</hello>");
    expect(sub instanceof XmlBase).toBe(true);
  });
});
