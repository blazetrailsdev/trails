import { describe, expect, it } from "vitest";
import { ActionMethods } from "./app-generator.js";

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    const generator = { options: {}, shebang: () => "#!/usr/bin/env node" };
    class Sub extends ActionMethods {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub(generator as never);
    expect(sub.secret()).toBe(1);
    expect((sub as unknown as { shebang(): string }).shebang()).toBe("#!/usr/bin/env node");
    expect(sub instanceof ActionMethods).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
