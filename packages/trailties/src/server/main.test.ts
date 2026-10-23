import { describe, expect, it } from "vitest";
import { parseArgs } from "./main.js";

describe("trails-server argument parsing", () => {
  it("defaults everything, so a bare invocation is valid", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("accepts the short flags `trails server` accepts", () => {
    expect(parseArgs(["-p", "8080", "-b", "0.0.0.0", "-e", "production"])).toEqual({
      port: "8080",
      binding: "0.0.0.0",
      environment: "production",
    });
  });

  it("accepts the long flags, spaced or inline", () => {
    expect(parseArgs(["--port", "8080", "--environment=production", "--binding=::1"])).toEqual({
      port: "8080",
      environment: "production",
      binding: "::1",
    });
  });

  it("rejects a flag with no value rather than serving on a default", () => {
    expect(() => parseArgs(["-p"])).toThrow("trails-server: -p needs a value");
  });

  it("rejects an unknown argument rather than ignoring it", () => {
    expect(() => parseArgs(["--daemon"])).toThrow("trails-server: unknown argument --daemon");
  });

  it("rejects a bare positional, which `trails server` would have taken as a command", () => {
    expect(() => parseArgs(["server"])).toThrow("trails-server: unknown argument server");
  });
});
