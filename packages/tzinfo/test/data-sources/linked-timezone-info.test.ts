import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { LinkedTimezoneInfo } from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";

describe("TCLinkedTimezoneInfo", () => {
  it("initialize nil identifier", () => {
    const error = assertRaises(
      ArgumentError,
      () => new LinkedTimezoneInfo(null as unknown as string, "Test/Linked"),
    );
    expect(error.message).toMatch(/\bidentifier\b/);
  });

  it("initialize nil link to identifier", () => {
    const error = assertRaises(
      ArgumentError,
      () => new LinkedTimezoneInfo("Test/Zone", null as unknown as string),
    );
    expect(error.message).toMatch(/\blink_to_identifier\b/);
  });

  it("identifier", () => {
    const lti = new LinkedTimezoneInfo("Test/Zone", "Test/Linked");
    expect(lti.identifier).toBe("Test/Zone");
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("identifier frozen", () => {
    const identifier = "Test/Zone";
    const lti = new LinkedTimezoneInfo(identifier, "Test/Linked");
    expect(lti.identifier).toBe(identifier);
    expect(Object.isFrozen(lti.identifier)).toBe(true);
  });

  it("link to identifier", () => {
    const lti = new LinkedTimezoneInfo("Test/Zone", "Test/Linked");
    expect(lti.linkToIdentifier).toBe("Test/Linked");
    expect(Object.isFrozen(lti.linkToIdentifier)).toBeTruthy();
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("link to identifier frozen", () => {
    const linkToIdentifier = "Test/Linked";
    const lti = new LinkedTimezoneInfo("Test/Zone", linkToIdentifier);
    expect(lti.linkToIdentifier).toBe(linkToIdentifier);
    expect(Object.isFrozen(lti.linkToIdentifier)).toBe(true);
  });

  // BLOCKED: tzinfo-timezone-subclasses
  it.skip("construct timezone", () => {
    const lti = new LinkedTimezoneInfo("Test/Zone", "Europe/London");
    const tz = lti.createTimezone();
    expect(tz.identifier).toBe("Test/Zone");
  });

  it("inspect", () => {
    const lti = new LinkedTimezoneInfo("Test/Zone", "Europe/London");
    expect(lti.inspect()).toBe("#<TZInfo::DataSources::LinkedTimezoneInfo: Test/Zone>");
  });
});
