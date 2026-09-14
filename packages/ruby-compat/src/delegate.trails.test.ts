import { describe, expect, it } from "vitest";
import { DelegateClass } from "./delegate.js";

describe("DelegateClass (trails)", () => {
  it("does not construct the delegated superclass", () => {
    let constructed = 0;
    class Required {
      constructor(arg: string) {
        if (arg === undefined) throw new Error("required");
        constructed++;
      }
    }
    const delegator = new (DelegateClass(Required))(new Required("x"));
    expect(constructed).toBe(1);
    expect(delegator).toBeInstanceOf(Required);
  });
});
