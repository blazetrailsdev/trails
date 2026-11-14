import { beforeEach, describe, expect, it } from "vitest";
import { TimezoneIndexDefiner } from "../../lib/format2/timezone-index-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";

describe("TCTimezoneIndexDefiner", () => {
  let stringDeduper: StringDeduper;
  let definer: TimezoneIndexDefiner;

  beforeEach(() => {
    stringDeduper = new StringDeduper();
    definer = new TimezoneIndexDefiner(stringDeduper);
  });

  it("mixed", () => {
    definer.dataTimezone("Test/One");
    definer.dataTimezone("Test/Two");
    definer.linkedTimezone("Test/Three");
    definer.dataTimezone("Another/Zone");
    definer.linkedTimezone("And/Yet/Another");

    expect(definer.dataTimezones).toEqual(
      expect.arrayContaining(["Another/Zone", "Test/One", "Test/Two"]),
    );
    expect(definer.dataTimezones).toHaveLength(3);
    expect(definer.linkedTimezones).toEqual(
      expect.arrayContaining(["And/Yet/Another", "Test/Three"]),
    );
    expect(definer.linkedTimezones).toHaveLength(2);
    expect(definer.dataTimezones.every((s) => Object.isFrozen(s))).toBe(true);
    expect(definer.linkedTimezones.every((s) => Object.isFrozen(s))).toBe(true);
  });

  it("data only", () => {
    definer.dataTimezone("Test/A/One");
    definer.dataTimezone("Test/A/Two");
    definer.dataTimezone("Test/A/Three");

    expect([...definer.dataTimezones].sort()).toEqual(["Test/A/One", "Test/A/Three", "Test/A/Two"]);
    expect(definer.linkedTimezones).toEqual([]);
    expect(definer.dataTimezones.every((s) => Object.isFrozen(s))).toBe(true);
  });

  it("linked only", () => {
    definer.linkedTimezone("Test/B/One");
    definer.linkedTimezone("Test/B/Two");
    definer.linkedTimezone("Test/B/Three");

    expect(definer.dataTimezones).toEqual([]);
    expect([...definer.linkedTimezones].sort()).toEqual([
      "Test/B/One",
      "Test/B/Three",
      "Test/B/Two",
    ]);
    expect(definer.linkedTimezones.every((s) => Object.isFrozen(s))).toBe(true);
  });

  it("none", () => {
    expect(definer.dataTimezones).toEqual([]);
    expect(definer.linkedTimezones).toEqual([]);
  });

  it("strings deduped", () => {
    const identifier = stringDeduper.dedupe("Test/A/One");
    const linkedIdentifier = stringDeduper.dedupe("Test/B/One");

    definer.dataTimezone("Test/A/One");
    definer.linkedTimezone("Test/B/One");

    expect(definer.dataTimezones[0]).toBe(identifier);
    expect(definer.linkedTimezones[0]).toBe(linkedIdentifier);
  });
});
