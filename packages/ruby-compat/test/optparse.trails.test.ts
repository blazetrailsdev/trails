import { describe, expect, it } from "vitest";
import { OptionParser } from "../lib/optparse.js";

describe("TestOptionParserSummaryTest", () => {
  it("banner", () => {
    const o = new OptionParser("foo bar");
    expect(o.banner).toBe("foo bar");
  });

  it("banner from progname", () => {
    const o = new OptionParser();
    o.programName = "foobar";
    expect(o.toString()).toBe("Usage: foobar [options]\n");
  });
});
