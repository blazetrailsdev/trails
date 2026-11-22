import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { TimezoneIndexDefiner } from "../../lib/format2/timezone-index-definer.js";
import {
  ClassMethods,
  TimezoneIndexDefinition,
  type TimezoneIndexDefinitionHost,
} from "../../lib/format2/timezone-index-definition.js";
import { StringDeduper } from "../../lib/string-deduper.js";

type Host = typeof ClassMethods & TimezoneIndexDefinitionHost;

function newModule(): Host {
  const m = {};
  include(m, TimezoneIndexDefinition);
  return m as unknown as Host;
}

describe("TCTimezoneIndexDefinition", () => {
  it("mixed", () => {
    const m = newModule();

    m.timezoneIndex((i) => {
      expect(i).toBeInstanceOf(TimezoneIndexDefiner);
      i.dataTimezone("Test/One");
      i.dataTimezone("Test/Two");
      i.linkedTimezone("Test/Three");
      i.dataTimezone("Another/Zone");
      i.linkedTimezone("And/Yet/Another");
    });

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual(["Another/Zone", "Test/One", "Test/Two"]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(dataTimezones.every((t) => Object.isFrozen(t))).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual(["And/Yet/Another", "Test/Three"]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(linkedTimezones.every((t) => Object.isFrozen(t))).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("data only", () => {
    const m = newModule();

    m.timezoneIndex((i) => {
      expect(i).toBeInstanceOf(TimezoneIndexDefiner);
      i.dataTimezone("Test/A/One");
      i.dataTimezone("Test/A/Two");
      i.dataTimezone("Test/A/Three");
    });

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual(["Test/A/One", "Test/A/Three", "Test/A/Two"]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(dataTimezones.every((t) => Object.isFrozen(t))).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual([]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("linked only", () => {
    const m = newModule();

    m.timezoneIndex((i) => {
      expect(i).toBeInstanceOf(TimezoneIndexDefiner);
      i.linkedTimezone("Test/B/One");
      i.linkedTimezone("Test/B/Two");
      i.linkedTimezone("Test/B/Three");
    });

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual([]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual(["Test/B/One", "Test/B/Three", "Test/B/Two"]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(linkedTimezones.every((t) => Object.isFrozen(t))).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("none", () => {
    const m = newModule();

    m.timezoneIndex((i) => {
      expect(i).toBeInstanceOf(TimezoneIndexDefiner);
    });

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual([]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual([]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("not defined", () => {
    const m = newModule();

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual([]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual([]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("global string deduper used for definer", () => {
    const m = newModule();

    m.timezoneIndex((i) => {
      expect(i).toBeInstanceOf(TimezoneIndexDefiner);
      expect((i as unknown as { stringDeduper: unknown }).stringDeduper).toBe(StringDeduper.global);
    });
  });
});
