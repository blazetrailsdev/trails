import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { TZInfo } from "../../lib/index.js";
import {
  TimezoneIndexDefinition,
  type TimezoneIndexDefinitionHost,
} from "../../lib/format1/timezone-index-definition.js";
import { StringDeduper } from "../../lib/string-deduper.js";

type Host = (typeof TimezoneIndexDefinition)["ClassMethods"] & TimezoneIndexDefinitionHost;

function newModule(): Host {
  const m = {};
  include(m, TimezoneIndexDefinition);
  return m as unknown as Host;
}

describe("TCTimezoneIndexDefinition", () => {
  it("mixed", () => {
    const m = newModule();

    m.timezone("Test/One");
    m.timezone("Test/Two");
    m.linkedTimezone("Test/Three");
    m.timezone("Another/Zone");
    m.linkedTimezone("And/Yet/Another");

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual(["Another/Zone", "Test/One", "Test/Two"]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(dataTimezones.every((z) => Object.isFrozen(z))).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual(["And/Yet/Another", "Test/Three"]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(linkedTimezones.every((z) => Object.isFrozen(z))).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("data only", () => {
    const m = newModule();

    m.timezone("Test/A/One");
    m.timezone("Test/A/Two");
    m.timezone("Test/A/Three");

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual(["Test/A/One", "Test/A/Three", "Test/A/Two"]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(dataTimezones.every((z) => Object.isFrozen(z))).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual([]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("linked only", () => {
    const m = newModule();

    m.linkedTimezone("Test/B/One");
    m.linkedTimezone("Test/B/Two");
    m.linkedTimezone("Test/B/Three");

    const dataTimezones = m.dataTimezones;
    expect(dataTimezones).toEqual([]);
    expect(Object.isFrozen(dataTimezones)).toBeTruthy();
    expect(m.dataTimezones).toBe(dataTimezones);

    const linkedTimezones = m.linkedTimezones;
    expect(linkedTimezones).toEqual(["Test/B/One", "Test/B/Three", "Test/B/Two"]);
    expect(Object.isFrozen(linkedTimezones)).toBeTruthy();
    expect(linkedTimezones.every((z) => Object.isFrozen(z))).toBeTruthy();
    expect(m.linkedTimezones).toBe(linkedTimezones);
  });

  it("none", () => {
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

  it("strings deduped", () => {
    const identifier = StringDeduper.global.dedupe("Test/A/One");
    const linkedIdentifier = StringDeduper.global.dedupe("Test/B/One");

    const m = newModule();
    m.timezone("Test/A/One");
    m.linkedTimezone("Test/B/One");

    expect(m.dataTimezones[0]).toBe(identifier);
    expect(m.linkedTimezones[0]).toBe(linkedIdentifier);
  });

  it("tzinfo module alias", () => {
    expect(TZInfo.TimezoneIndexDefinition).toBe(TimezoneIndexDefinition);
  });
});
