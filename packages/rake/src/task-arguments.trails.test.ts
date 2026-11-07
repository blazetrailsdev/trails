import { describe, expect, it } from "vitest";
import { TaskArguments } from "./task-arguments.js";

describe("TaskArguments method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and answer argument names", () => {
    class Sub extends TaskArguments {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const args = new Sub(["a"], [1]);
    expect(args.tag()).toBe("sub");
    expect(args.a).toBe(1);
    expect(args instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(args)).toBe(Sub.prototype);
  });
});
