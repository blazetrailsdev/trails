import { describe, expect, it } from "vitest";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { TimezoneInfo } from "../../lib/index.js";

function assertRaises(
  klass: abstract new (...args: never[]) => Error,
  block: () => unknown,
): Error {
  let error: unknown;
  try {
    block();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(klass);
  return error as Error;
}

describe("TCTimezoneInfo", () => {
  it("initialize nil identifier", () => {
    const error = assertRaises(ArgumentError, () => new TimezoneInfo(null as unknown as string));
    expect(error.message).toMatch(/\bidentifier\b/);
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
    const error = assertRaises(NotImplementedError, () => ti.createTimezone());
    expect(error.message).toBe("Subclasses must override create_timezone");
  });
});
