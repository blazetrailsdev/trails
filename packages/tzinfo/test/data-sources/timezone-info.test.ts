import { describe, expect, it } from "vitest";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { TimezoneInfo } from "../../lib/index.js";

describe("TCTimezoneInfo", () => {
  it("initialize nil identifier", () => {
    expect(() => new TimezoneInfo(null as unknown as string)).toThrow(ArgumentError);
    expect(() => new TimezoneInfo(null as unknown as string)).toThrow(/\bidentifier\b/);
  });

  it("identifier", () => {
    const ti = new TimezoneInfo("Test/Zone");
    expect(ti.identifier).toBe("Test/Zone");
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("identifier frozen", () => {
    const identifier = "Test/Zone";
    const ti = new TimezoneInfo(identifier);
    expect(ti.identifier).toBe(identifier);
    expect(Object.isFrozen(ti.identifier)).toBe(true);
  });

  it("inspect", () => {
    const ti = new TimezoneInfo("Test/Zone");
    expect(ti.inspect()).toBe("#<TZInfo::DataSources::TimezoneInfo: Test/Zone>");
  });

  it("create timezone", () => {
    const ti = new TimezoneInfo("Test/Zone");
    const error = (() => {
      try {
        ti.createTimezone();
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(NotImplementedError);
    expect((error as Error).message).toBe("Subclasses must override create_timezone");
  });
});
