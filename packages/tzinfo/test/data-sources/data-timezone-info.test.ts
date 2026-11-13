import { describe, expect, it } from "vitest";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { DataTimezone, DataTimezoneInfo, Timestamp } from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";

describe("TCDataTimezoneInfo", () => {
  it("initialize nil identifier", () => {
    const error = assertRaises(
      ArgumentError,
      () => new DataTimezoneInfo(null as unknown as string),
    );
    expect(error.message).toMatch(/\bidentifier\b/);
  });

  it("identifier", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    expect(ti.identifier).toBe("Test/Zone");
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("identifier frozen", () => {
    const identifier = "Test/Zone";
    const lti = new DataTimezoneInfo(identifier);
    expect(lti.identifier).toBe(identifier);
    expect(Object.isFrozen(lti.identifier)).toBe(true);
  });

  it("construct timezone", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    const tz = ti.createTimezone();
    expect(tz).toBeInstanceOf(DataTimezone);
    expect(tz.identifier).toBe("Test/Zone");
  });

  it("period for", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    const ts = Timestamp.utc(1480291200);
    const error = assertRaises(NotImplementedError, () => ti.periodFor(ts));
    expect(error.message).toBe("Subclasses must override period_for");
  });

  it("periods for local", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    const ts = new Timestamp(1480291200);
    const error = assertRaises(NotImplementedError, () => ti.periodsForLocal(ts));
    expect(error.message).toBe("Subclasses must override periods_for_local");
  });

  it("transitions up to", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    const ts = Timestamp.utc(1480291200);
    const error = assertRaises(NotImplementedError, () => ti.transitionsUpTo(ts));
    expect(error.message).toBe("Subclasses must override transitions_up_to");
  });

  it("inspect", () => {
    const ti = new DataTimezoneInfo("Test/Zone");
    expect(ti.inspect()).toBe("#<TZInfo::DataSources::DataTimezoneInfo: Test/Zone>");
  });
});
