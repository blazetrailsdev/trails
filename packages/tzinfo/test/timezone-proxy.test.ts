import { Time } from "@blazetrails/date";
import { Marshal } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { InvalidTimezoneIdentifier, Timezone, TimezoneProxy } from "../lib/index.js";
import { assertRaises } from "./support/test-utils.js";

function assertRaisesInvalidTimezoneIdentifier(identifier: string, block: () => unknown) {
  const error = assertRaises(InvalidTimezoneIdentifier, block);
  expect(error.message).toMatch(
    new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\b`),
  );
}

describe("TCTimezoneProxy", () => {
  for (const encoding of ["iso_8859_1", "utf_8", "utf_16"]) {
    it(`not exist with ${encoding} encoded identifier`, () => {
      const identifier = "Nothing/Special";
      const proxy = new TimezoneProxy(identifier);
      const t = Time.utc(2006, 1, 1, 0, 0, 0);
      expect(proxy.identifier).toBe(identifier);
      expect(proxy.name).toBe(identifier);
      expect(proxy.friendlyIdentifier()).toBe("Nothing - Special");
      expect(proxy.toString()).toBe("Nothing - Special");

      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.canonicalIdentifier);
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.canonicalZone());
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.localToUtc(t));
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.periodFor(t));
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.periodForLocal(t));
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.periodsForLocal(t));
      assertRaisesInvalidTimezoneIdentifier("Nothing/Special", () => proxy.transitionsUpTo(t));
    });

    // BLOCKED: tzinfo-timezone-reads-the-data-source
    it.skip(`valid with ${encoding} encoded identifier`, () => {});
  }

  // BLOCKED: tzinfo-data-definitions-generated
  it.skip("canonical linked", () => {});

  it("after freeze", () => {
    const proxy = new TimezoneProxy("Europe/London");
    const real = Timezone.get("Europe/London");
    const t = Time.utc(2017, 6, 1);
    Object.freeze(proxy);
    expect(proxy.identifier).toBe("Europe/London");
    expect(proxy.utcToLocal(t).equals(real.utcToLocal(t))).toBe(true);
  });

  it("equals", () => {
    expect(new TimezoneProxy("Europe/London").equals(new TimezoneProxy("Europe/London"))).toBe(
      true,
    );
    expect(new TimezoneProxy("Europe/London").equals(new TimezoneProxy("Europe/Paris"))).toBe(
      false,
    );
    expect(!new TimezoneProxy("Europe/London").equals({})).toBeTruthy();
  });

  // BLOCKED: tzinfo-timezone-reads-the-data-source
  it.skip("compare", () => {});

  it("kind", () => {
    expect(new TimezoneProxy("America/New_York")).toBeInstanceOf(Timezone);
  });

  it("marshal", () => {
    const tp = new TimezoneProxy("Europe/London");
    const tp2 = Marshal.load(Marshal.dump(tp)) as TimezoneProxy;

    expect(tp2).toBeInstanceOf(TimezoneProxy);
    expect(tp2.identifier).toBe("Europe/London");
  });

  it("inspect", () => {
    const tp = new TimezoneProxy("Europe/London");
    expect(tp.inspect()).toBe("#<TZInfo::TimezoneProxy: Europe/London>");
  });
});
