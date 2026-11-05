import { types } from "node:util";
import { describe, it, expect } from "vitest";
import { StringInquirer } from "./string-inquirer.js";
import { EnvironmentInquirer } from "./environment-inquirer.js";

describe("StringInquirer method_missing in the prototype chain", () => {
  it("constructs a plain String instance, not a Proxy", () => {
    expect(types.isProxy(new StringInquirer("x"))).toBe(false);
    expect(types.isProxy(new EnvironmentInquirer("production"))).toBe(false);
  });

  it("lets a subclass store its own state on the instance", () => {
    expect(new EnvironmentInquirer("production")["local?"]()).toBe(false);
    expect(new EnvironmentInquirer("test")["local?"]()).toBe(true);
  });

  it("reads undefined for JS protocol probes Ruby never answers", async () => {
    const inquirer = new StringInquirer("x");
    expect((inquirer as any).then).toBeUndefined();
    expect(await inquirer).toBe(inquirer);
    expect(JSON.stringify(inquirer)).toBe('"x"');
  });
});
