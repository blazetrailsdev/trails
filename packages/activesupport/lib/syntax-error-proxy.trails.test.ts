import { describe, expect, it } from "vitest";
import { SyntaxErrorProxy } from "./syntax-error-proxy.js";

describe("SyntaxErrorProxy (trails)", () => {
  it("prefixes an eval syntax error's trace with the eval caller's location", () => {
    const error = new SyntaxError("(eval at foo):1: unexpected end");
    error.stack = "SyntaxError: (eval at foo):1: unexpected end\n    at render (/app/a.js:5:7)";
    const proxy = new SyntaxErrorProxy(error);
    expect(proxy.backtrace()).toEqual([
      "/app/a.js:5: (eval at foo):1: unexpected end",
      "at render (/app/a.js:5:7)",
    ]);
  });

  it("answers nil backtrace locations for an exception never raised", () => {
    const error = new SyntaxError("a.tse:3: unexpected end");
    error.stack = undefined;
    expect(new SyntaxErrorProxy(error).backtraceLocations()).toBeNull();
  });

  it("prepends a location parsed from each message line", () => {
    const error = new SyntaxError("a.tse:3: unexpected end");
    error.stack = "SyntaxError: a.tse:3: unexpected end\n    at render (/app/a.js:5:7)";
    const [first, second] = new SyntaxErrorProxy(error).backtraceLocations()! as {
      path?: string;
      lineno?: number;
    }[];
    expect([first.path, first.lineno]).toEqual(["a.tse", 3]);
    expect(String(first)).toBe("a.tse:3: unexpected end");
    expect(String(second)).toBe("at render (/app/a.js:5:7)");
  });
});
