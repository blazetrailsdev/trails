import { describe, expect, it } from "vitest";
import { OptionParser } from "../lib/optparse.js";

describe("OptionParser", () => {
  it("banner defaults to Usage: program_name [options]", () => {
    const opts = new OptionParser();
    opts.programName = "rackup";
    expect(opts.banner).toBe("Usage: rackup [options]");
    expect(opts.toString().split("\n")[0]).toBe("Usage: rackup [options]");
  });

  it("banner keeps an explicit value", () => {
    const opts = new OptionParser("custom");
    expect(opts.banner).toBe("custom");
    opts.banner = "other";
    expect(opts.banner).toBe("other");
  });
});
