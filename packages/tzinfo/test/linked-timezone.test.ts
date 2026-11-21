import { ArgumentError, Rational } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidTimezoneIdentifier,
  LinkedTimezone,
  LinkedTimezoneInfo,
  Timezone,
  type TimezonePeriod,
  type TimezoneTransition,
} from "../lib/index.js";
import { assertRaises } from "./support/test-utils.js";

class TestTimezone extends Timezone {
  readonly periodForResult: TimezonePeriod;
  readonly periodsForLocalResult: TimezonePeriod[];
  readonly transitionsUpToResult: TimezoneTransition[];
  time: Time | null = null;
  localTime: Time | null = null;
  to: Time | null = null;
  from: Time | null = null;

  constructor(identifier: string, noLocalPeriods = false) {
    super(identifier);
    this.periodForResult = {} as TimezonePeriod;
    this.periodsForLocalResult = noLocalPeriods ? [] : [{} as TimezonePeriod, {} as TimezonePeriod];
    this.transitionsUpToResult = [{} as TimezoneTransition, {} as TimezoneTransition];
  }

  override get identifier(): string {
    return this._identifier;
  }

  override periodFor(time: Time): TimezonePeriod {
    if (time == null) throw new ArgumentError("linked zone exception: nil");
    this.time = time;
    return this.periodForResult;
  }

  override periodsForLocal(localTime: Time): TimezonePeriod[] {
    if (localTime == null) throw new ArgumentError("linked zone exception: nil");
    this.localTime = localTime;
    return this.periodsForLocalResult;
  }

  override transitionsUpTo(to: Time, from: Time | null = null): TimezoneTransition[] {
    this.to = to;
    this.from = from;
    return this.transitionsUpToResult;
  }

  override canonicalZone(): Timezone {
    return this;
  }
}

function getTimezone<T extends Timezone>(linkedTz: T, identifier: string): T {
  expect(identifier).toBe(linkedTz.identifier);
  return linkedTz;
}

function stubTimezoneGet<T extends Timezone, R>(linkedTz: T, block: (linkedTz: T) => R): R {
  const spy = vi.spyOn(Timezone, "get").mockImplementation((i) => getTimezone(linkedTz, i));
  try {
    return block(linkedTz);
  } finally {
    spy.mockRestore();
  }
}

const defaultLinked = () => new TestTimezone("Test/Linked");

describe("TCLinkedTimezone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("identifier", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      expect(tz.identifier).toBe("Test/Zone");
    });
  });

  it("invalid linked identifier", () => {
    const error = assertRaises(
      InvalidTimezoneIdentifier,
      () => new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Invalid/Identifier")),
    );
    expect(error.message).toMatch(/\bInvalid\/Identifier\b/);
  });

  it("period for", () => {
    stubTimezoneGet(defaultLinked(), (linkedTz) => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      const t = Time.utc(2006, 6, 27, 23, 12, new Rational(281, 10));
      expect(tz.periodFor(t)).toBe(linkedTz.periodForResult);
      expect(linkedTz.time).toBe(t);
    });
  });

  it("period for nil", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));

      const error = assertRaises(ArgumentError, () => tz.periodFor(null as unknown as Time));
      expect(error.message).toBe("linked zone exception: nil");
    });
  });

  it("periods for local", () => {
    stubTimezoneGet(defaultLinked(), (linkedTz) => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      const t = Time.utc(2006, 6, 27, 23, 12, new Rational(281, 10));
      expect(tz.periodsForLocal(t)).toBe(linkedTz.periodsForLocalResult);
      expect(linkedTz.localTime).toBe(t);
    });
  });

  it("periods for local not found", () => {
    stubTimezoneGet(new TestTimezone("Test/No/Local", true), (linkedTz) => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/No/Local"));
      const t = Time.utc(2006, 6, 27, 23, 12, 28);
      expect(linkedTz.periodsForLocalResult).toEqual([]);
      expect(tz.periodsForLocal(t)).toBe(linkedTz.periodsForLocalResult);
      expect(linkedTz.localTime).toBe(t);
    });
  });

  it("periods for local nil", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));

      const error = assertRaises(ArgumentError, () => tz.periodsForLocal(null as unknown as Time));
      expect(error.message).toBe("linked zone exception: nil");
    });
  });

  it("transitions up to", () => {
    stubTimezoneGet(defaultLinked(), (linkedTz) => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      const to = Time.utc(2013, 1, 1, 0, 0, new Rational(1, 10));
      const from = Time.utc(2012, 1, 1, 0, 0, new Rational(1, 10));
      expect(tz.transitionsUpTo(to, from)).toBe(linkedTz.transitionsUpToResult);
      expect(linkedTz.to).toBe(to);
      expect(linkedTz.from).toBe(from);
    });
  });

  it("transitions up to nil from", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      const linkedTz = Timezone.get("Test/Linked") as TestTimezone;
      const to = Time.utc(2013, 1, 1, 0, 0, new Rational(1, 10));
      expect(tz.transitionsUpTo(to)).toBe(linkedTz.transitionsUpToResult);
      expect(linkedTz.to).toBe(to);
      expect(linkedTz.from).toBeNull();
    });
  });

  it("canonical identifier", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      expect(tz.canonicalIdentifier).toBe("Test/Linked");
    });
  });

  it("canonical identifier recursive", () => {
    const recursiveData = new TestTimezone("Test/Recursive/Data");
    const recursiveLinked = stubTimezoneGet(
      recursiveData,
      () =>
        new LinkedTimezone(new LinkedTimezoneInfo("Test/Recursive/Linked", "Test/Recursive/Data")),
    );

    stubTimezoneGet(recursiveLinked, () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Recursive/Linked"));
      expect(tz.canonicalIdentifier).toBe("Test/Recursive/Data");
    });
  });

  it("canonical zone", () => {
    stubTimezoneGet(defaultLinked(), (linkedTz) => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      expect(tz.canonicalZone()).toBe(linkedTz);
    });
  });

  it("canonical zone recursive", () => {
    const recursiveData = new TestTimezone("Test/Recursive/Data");
    const recursiveLinked = stubTimezoneGet(
      recursiveData,
      () =>
        new LinkedTimezone(new LinkedTimezoneInfo("Test/Recursive/Linked", "Test/Recursive/Data")),
    );

    stubTimezoneGet(recursiveLinked, () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Recursive/Linked"));
      expect(tz.canonicalZone()).toBe(recursiveData);
    });
  });

  it("inspect", () => {
    stubTimezoneGet(defaultLinked(), () => {
      const tz = new LinkedTimezone(new LinkedTimezoneInfo("Test/Zone", "Test/Linked"));
      expect(tz.inspect()).toBe("#<TZInfo::LinkedTimezone: Test/Zone>");
    });
  });
});
