import { describe, expect, it } from "vitest";
import { include, rbCallSuper } from "./include.js";
import { prepend } from "./prepend.js";

describe("prepend then include", () => {
  it("seats a module included after a prepend beneath the prepended method", () => {
    const calls: string[] = [];
    class Parent {
      run(): void {
        calls.push("parent");
      }
    }
    class Host extends Parent {}
    prepend(Host.prototype, {
      run(super_: () => unknown) {
        calls.push("prepended");
        return super_();
      },
    });
    function run(this: object): unknown {
      calls.push("included");
      return rbCallSuper(this, run);
    }
    include(Host, { run });
    new Host().run();
    expect(calls).toEqual(["prepended", "included", "parent"]);
  });
});
