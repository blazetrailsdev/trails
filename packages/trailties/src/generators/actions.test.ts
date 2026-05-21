import { describe, it, expect } from "vitest";
import { GeneratorBase } from "./base.js";

class TestGenerator extends GeneratorBase {}

describe("ActionsTest", () => {
  it("generate should queue a sub-generator invocation", () => {
    const lines: string[] = [];
    const gen = new TestGenerator({ cwd: "/tmp", output: (m) => lines.push(m) });
    gen.generate("scaffold", "Post", "title:string", "body:text");
    expect(gen.pendingGenerators).toEqual([
      { what: "scaffold", args: ["Post", "title:string", "body:text"] },
    ]);
    expect(lines.some((l) => l.includes("generate") && l.includes("scaffold"))).toBe(true);
  });
});
