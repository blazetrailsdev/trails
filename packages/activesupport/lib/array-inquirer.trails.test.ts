import { describe, expect, it } from "vitest";
import { ArrayInquirer } from "./array-inquirer.js";

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends ArrayInquirer<string> {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub("phone", "tablet") as Sub & Record<string, () => boolean>;
    expect(sub.secret()).toBe(1);
    expect(sub["phone?"]()).toBe(true);
    expect(sub["desktop?"]()).toBe(false);
    expect("phone?" in sub).toBe(true);
    expect(sub instanceof ArrayInquirer).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
