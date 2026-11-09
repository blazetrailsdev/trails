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

  it("default banner lists a nonswitch description", () => {
    const o = new OptionParser();
    o.programName = "foobar";
    o.on("FILE", () => {});
    expect(o.banner).toBe("Usage: foobar [options] [FILE]...");
  });
});

describe("OptionParser DefaultList", () => {
  it("terminates option parsing at --", async () => {
    const o = new OptionParser();
    let seen = false;
    o.on("-v", "--verbose", () => {
      seen = true;
    });
    expect(await o.parse(["a", "--", "-v", "b"])).toEqual(["a", "-v", "b"]);
    expect(seen).toBe(false);
  });

  it("completes an abbreviated long option and raises on an ambiguous one", async () => {
    const o = new OptionParser();
    const got: unknown[] = [];
    o.on("--verbose", (v) => got.push(["verbose", v]));
    o.on("--version", (v) => got.push(["version", v]));
    o.on("--quiet", (v) => got.push(["quiet", v]));
    await o.parse(["--qu", "--verb"]);
    expect(got).toEqual([
      ["quiet", true],
      ["verbose", true],
    ]);
    await expect(o.parse(["--ver"])).rejects.toBeInstanceOf(OptionParser.AmbiguousOption);
  });

  it("passes a bare - through as a non-option", async () => {
    const o = new OptionParser();
    expect(await o.parse(["-"])).toEqual(["-"]);
  });
});
