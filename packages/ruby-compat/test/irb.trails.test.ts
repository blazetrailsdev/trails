import { describe, expect, it } from "vitest";
import { IRB } from "../lib/repl-adapter.js";

describe("IRB", () => {
  it("setup seeds the default prompts and IRB_NAME", () => {
    IRB.setup(null);
    expect(IRB.conf.IRB_NAME).toBe("irb");
    expect(Object.keys(IRB.conf.PROMPT as object)).toContain("DEFAULT");
    expect(["DEFAULT", "NULL"]).toContain(IRB.conf.PROMPT_MODE);
  });

  it("setup raises UndefinedPromptMode for an unknown prompt mode", () => {
    const initConfig = IRB.initConfig;
    IRB.initConfig = (apPath) => {
      initConfig(apPath);
      IRB.conf.PROMPT_MODE = "NOPE";
    };
    try {
      expect(() => IRB.setup(null)).toThrow("Undefined prompt mode(NOPE).");
    } finally {
      IRB.initConfig = initConfig;
    }
  });

  it("format_prompt expands %N, %m, %03n and %l", () => {
    IRB.setup(null);
    IRB.conf.IRB_NAME = "app";
    const irb = new IRB.Irb();
    expect(irb.formatPrompt("%N(%m):%03n%l ", '"', 0, 7)).toBe('app(main):007" ');
  });

  it("helper methods are singletons registered by name", () => {
    class Hello extends IRB.HelperMethod.Base {
      execute(): string {
        return "hi";
      }
    }
    IRB.HelperMethod.register("hello", Hello);
    expect(IRB.HelperMethod.helperMethods.hello).toBe(Hello);
    expect(Hello.instance()).toBe(Hello.instance());
  });
});
