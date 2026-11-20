import { describe, expect, it } from "vitest";
import { include, type Extended } from "@blazetrails/ruby-compat";
import {
  ConstantOffsetDataTimezoneInfo,
  LinkedTimezoneInfo,
  TimezoneOffset,
  TimezoneTransition,
  TransitionsDataTimezoneInfo,
  TZInfo,
} from "../../lib/index.js";
import { ClassMethods as Format2ClassMethods } from "../../lib/format2/timezone-definition.js";
import { TimezoneDefinition } from "../../lib/format1/timezone-definition.js";
import { TimezoneDefiner } from "../../lib/format1/timezone-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";

type Host = Extended<typeof Format2ClassMethods>;

function newModule(): Host {
  const m = {};
  include(m, TimezoneDefinition);
  return m as unknown as Host;
}

function timezone(m: Host, identifier: string, block: (tz: TimezoneDefiner) => void): void {
  m.timezone(identifier, (tz) => block(tz as TimezoneDefiner));
}

describe("TCTimezoneDefinition", () => {
  it("timezone definer class", () => {
    const m = newModule();
    expect(m.timezoneDefinerClass()).toBe(TimezoneDefiner);
  });

  it("data transitions", () => {
    const m = newModule();
    let blockCalled = 0;

    timezone(m, "Test/Data/Zone", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", -75, 0, "LMT");
      tz.offset("o1", 0, 0, "GMT");
      tz.offset("o2", 0, 3600, "BST");
      tz.transition(1847, 12, "o1", -3852662325);
      tz.transition(2016, 3, "o2", 1459040400);
    });

    expect(blockCalled).toBe(1);

    const ti = m.get() as TransitionsDataTimezoneInfo;
    expect(ti).toBeInstanceOf(TransitionsDataTimezoneInfo);
    expect(ti.identifier).toBe("Test/Data/Zone");

    const o0 = new TimezoneOffset(-75, 0, "LMT");
    const o1 = new TimezoneOffset(0, 0, "GMT");
    const o2 = new TimezoneOffset(0, 3600, "BST");

    const t1 = new TimezoneTransition(o1, o0, -3852662325);
    const t2 = new TimezoneTransition(o2, o1, 1459040400);

    expect(ti.transitions).toEqual([t1, t2]);
  });

  it("data constant offset", () => {
    const m = newModule();
    let blockCalled = 0;

    timezone(m, "Test/Data/Zone", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", -75, 0, "LMT");
    });

    expect(blockCalled).toBe(1);

    const ti = m.get() as ConstantOffsetDataTimezoneInfo;
    expect(ti).toBeInstanceOf(ConstantOffsetDataTimezoneInfo);
    expect(ti.identifier).toBe("Test/Data/Zone");
    expect(ti.constantOffset).toEqual(new TimezoneOffset(-75, 0, "LMT"));
  });

  it("data frozen identifier", () => {
    const m = newModule();

    timezone(m, "Test/Data/Zone", (tz) => tz.offset("o0", 0, 0, "UTC"));

    const ti = m.get()!;
    expect(Object.isFrozen(ti.identifier)).toBeTruthy();
  });

  it("linked", () => {
    const m = newModule();
    m.linkedTimezone("Test/Linked/Zone", "Test/Linked_To/Zone");

    const ti = m.get() as LinkedTimezoneInfo;
    expect(ti).toBeInstanceOf(LinkedTimezoneInfo);
    expect(ti.identifier).toBe("Test/Linked/Zone");
    expect(ti.linkToIdentifier).toBe("Test/Linked_To/Zone");
  });

  it("linked frozen identifiers", () => {
    const m = newModule();
    m.linkedTimezone("Test/Linked/Zone", "Test/Linked_To/Zone");

    const ti = m.get() as LinkedTimezoneInfo;
    expect(Object.isFrozen(ti.identifier)).toBeTruthy();
    expect(Object.isFrozen(ti.linkToIdentifier)).toBeTruthy();
  });

  it("double data", () => {
    const m = newModule();
    let blockCalled = 0;

    timezone(m, "Test/Data/Zone", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", -75, 0, "LMT");
      tz.offset("o1", 0, 0, "GMT");
      tz.transition(1847, 12, "o1", -3852662325);
    });

    expect(blockCalled).toBe(1);

    timezone(m, "Test/Data/Zone2", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", 3525, 0, "LMT");
      tz.offset("o1", 3600, 0, "CET");
      tz.transition(1847, 12, "o1", -3852658875);
    });

    expect(blockCalled).toBe(2);

    const ti = m.get() as TransitionsDataTimezoneInfo;
    expect(ti).toBeInstanceOf(TransitionsDataTimezoneInfo);
    expect(ti.identifier).toBe("Test/Data/Zone2");

    const o0 = new TimezoneOffset(3525, 0, "LMT");
    const o1 = new TimezoneOffset(3600, 0, "CET");

    const t1 = new TimezoneTransition(o1, o0, -3852658875);

    expect(ti.transitions).toEqual([t1]);
  });

  it("double linked", () => {
    const m = newModule();
    m.linkedTimezone("Test/Linked/Zone", "Test/Linked_To/Zone");
    m.linkedTimezone("Test/Linked/Zone2", "Test/Linked_To/Zone2");

    const ti = m.get() as LinkedTimezoneInfo;
    expect(ti).toBeInstanceOf(LinkedTimezoneInfo);
    expect(ti.identifier).toBe("Test/Linked/Zone2");
    expect(ti.linkToIdentifier).toBe("Test/Linked_To/Zone2");
  });

  it("data linked", () => {
    const m = newModule();
    let blockCalled = 0;

    timezone(m, "Test/Data/Zone", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", -75, 0, "LMT");
      tz.offset("o1", 0, 0, "GMT");
      tz.transition(1847, 12, "o1", -3852662325);
    });

    expect(blockCalled).toBe(1);

    m.linkedTimezone("Test/Linked/Zone2", "Test/Linked_To/Zone2");

    const ti = m.get() as LinkedTimezoneInfo;
    expect(ti).toBeInstanceOf(LinkedTimezoneInfo);
    expect(ti.identifier).toBe("Test/Linked/Zone2");
    expect(ti.linkToIdentifier).toBe("Test/Linked_To/Zone2");
  });

  it("linked data", () => {
    const m = newModule();
    m.linkedTimezone("Test/Linked/Zone1", "Test/Linked_To/Zone1");
    let blockCalled = 0;

    timezone(m, "Test/Data/Zone2", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      tz.offset("o0", -75, 0, "LMT");
      tz.offset("o1", 0, 0, "GMT");
      tz.transition(1847, 12, "o1", -3852662325);
    });

    expect(blockCalled).toBe(1);

    const ti = m.get() as TransitionsDataTimezoneInfo;
    expect(ti).toBeInstanceOf(TransitionsDataTimezoneInfo);
    expect(ti.identifier).toBe("Test/Data/Zone2");

    const o0 = new TimezoneOffset(-75, 0, "LMT");
    const o1 = new TimezoneOffset(0, 0, "GMT");

    const t1 = new TimezoneTransition(o1, o0, -3852662325);

    expect(ti.transitions).toEqual([t1]);
  });

  it("timezone strings deduped", () => {
    const identifier = StringDeduper.global.dedupe("Test/One");

    const m = newModule();
    timezone(m, "Test/One", (tz) => {
      tz.offset("o0", -75, 0, "LMT");
    });

    const ti = m.get()!;
    expect(ti.identifier).toBe(identifier);
  });

  it("linked timezone strings deduped", () => {
    const identifier = StringDeduper.global.dedupe("Test/Linked/Zone1");
    const linkToIdentifier = StringDeduper.global.dedupe("Test/Linked_To/Zone1");

    const m = newModule();
    m.linkedTimezone("Test/Linked/Zone1", "Test/Linked_To/Zone1");

    const ti = m.get() as LinkedTimezoneInfo;
    expect(ti.identifier).toBe(identifier);
    expect(ti.linkToIdentifier).toBe(linkToIdentifier);
  });

  it("global string deduper used", () => {
    const m = newModule();
    let blockCalled = 0;
    timezone(m, "Test/Data/Zone", (tz) => {
      blockCalled += 1;
      expect(tz).toBeInstanceOf(TimezoneDefiner);
      expect((tz as unknown as { stringDeduper: unknown }).stringDeduper).toBe(
        StringDeduper.global,
      );
      tz.offset("o0", -75, 0, "LMT");
    });

    expect(blockCalled).toBe(1);
  });

  it("tzinfo module alias", () => {
    expect(TZInfo.TimezoneDefinition).toBe(TimezoneDefinition);
  });
});
