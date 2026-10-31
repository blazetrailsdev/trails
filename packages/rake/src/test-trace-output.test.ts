import { describe, expect, it } from "vitest";
import { TraceOutput } from "./trace-output.js";

class PrintSpy {
  result = "";
  calls = 0;

  print(string: string): void {
    this.result += string;
    this.calls += 1;
  }
}

describe("TestTraceOutput", () => {
  const traceOn = TraceOutput.prototype.traceOn;

  it("trace issues single io for args with empty args", () => {
    const spy = new PrintSpy();
    traceOn(spy);
    expect(spy.result).toBe("\n");
    expect(spy.calls).toBe(1);
  });

  it("trace issues single io for args multiple strings", () => {
    const spy = new PrintSpy();
    traceOn(spy, "HI\n", "LO");
    expect(spy.result).toBe("HI\nLO\n");
    expect(spy.calls).toBe(1);
  });

  it("trace handles nil objects", () => {
    const spy = new PrintSpy();
    traceOn(spy, "HI\n", null, "LO");
    expect(spy.result).toBe("HI\nLO\n");
    expect(spy.calls).toBe(1);
  });

  // PERMANENT-SKIP: Node has no `$\\`, so `trace_on`'s separator is always "\n" (CLAUDE.md § "Runtime facts Node does not expose").
  it.skip("trace issues single io for args multiple strings and alternate sep", () => {});
});
