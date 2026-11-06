import { describe, expect, it } from "vitest";
import { ActionMethods } from "./app-generator.js";

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    const generator = { options: {}, gemfileEntries: () => ["trails"] };
    class Sub extends ActionMethods {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub(generator as never);
    expect(sub.secret()).toBe(1);
    expect("gemfileEntries" in ActionMethods.prototype).toBe(false);
    expect((sub as unknown as { gemfileEntries(): string[] }).gemfileEntries()).toEqual(["trails"]);
    expect(sub instanceof ActionMethods).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
