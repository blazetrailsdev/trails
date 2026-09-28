import { describe, it, expect } from "vitest";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { GeneratorBase } from "./base.js";

class GeneratorWithHook extends GeneratorBase {
  static {
    this.hookFor("testFramework");
  }
}

class GeneratorWithoutHook extends GeneratorWithHook {
  static {
    this.removeHookFor("testFramework");
  }
}

describe("HookGeneratorTest", () => {
  it("hook added", () => {
    expect(rbObjRespondTo(GeneratorWithHook, "testFrameworkGenerator")).toBeTruthy();
    expect(Object.hasOwn(GeneratorWithHook.hooks(), "testFramework")).toBeTruthy();
  });

  it("hook removed", () => {
    expect(rbObjRespondTo(GeneratorWithoutHook, "testFrameworkGenerator")).toBeFalsy();
    expect(Object.hasOwn(GeneratorWithoutHook.hooks(), "testFramework")).toBeFalsy();
  });
});
