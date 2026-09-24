import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { toDate, toDatetime, toTime } from "./string/conversions.js";
import { ArgumentError, DateTime, Temporal, Time, resetLocalTimeZoneId } from "@blazetrails/date";
import { at, from, to, first, last, indent, indentBang, exclude } from "../string-utils.js";
import {
  registerConstantizeFixtures,
  runConstantizeTestsOn,
  runSafeConstantizeTestsOn,
} from "../constantize-test-cases.js";

import {
  camelize as stringCamelize,
  pluralize as stringPluralize,
} from "../core-ext/string/inflections.js";
import {
  assert,
  assertNot,
  assertNotPredicate,
  assertNotSame,
  assertPredicate,
  assertRaise,
  assertRaises,
  assertRespondTo,
  assertNil,
} from "../testing/assertions.js";
import { inquiry } from "../string-inquirer.js";
import {
  CamelToUnderscore,
  ClassNameToForeignKeyWithUnderscore,
  ClassNameToForeignKeyWithoutUnderscore,
  ClassNameToTableName,
  MixtureToTitleCase,
  MixtureToTitleCaseWithKeepIdSuffix,
  SingularToPlural,
  StringToParameterizePreserveCaseWithNoSeparator,
  StringToParameterizePreserveCaseWithUnderscore,
  StringToParameterizeWithNoSeparator,
  StringToParameterizeWithUnderscore,
  StringToParameterized,
  StringToParameterizedPreserveCase,
  UnderscoreToHuman,
  UnderscoreToHumanWithKeepIdSuffix,
  UnderscoreToHumanWithoutCapitalize,
  UnderscoreToLowerCamel,
  UnderscoresToDashes,
} from "../inflector-test-cases.js";
import { SafeBuffer, htmlSafe, isHtmlSafe } from "../core-ext/string/output-safety.js";
import { NoMethodError, Range } from "@blazetrails/ruby-compat";
import { endsWith, startsWith } from "../core-ext/string/starts-ends-with.js";
import { htmlEscape, htmlEscapeOnce, xmlNameEscape } from "../core-ext/tse/util.js";
import {
  singularize,
  underscore,
  titleize,
  tableize,
  classify,
  dasherize,
  demodulize,
  deconstantize,
  constantize,
  safeConstantize,
  _resetConstants,
  foreignKey,
  humanize,
  parameterize,
  squish,
  truncate,
  truncateWords,
  truncateBytes,
  remove,
  stripHeredoc,
  downcaseFirst,
  upcaseFirst,
} from "../index.js";
import { I18n } from "../i18n.js";
import { toTimePreservesTimezone } from "../active-support.js";
import { actsLikeString } from "./string/behavior.js";
import { isUtf8, mbChars } from "./string/multibyte.js";
import { Multibyte } from "../multibyte.js";

describe("StringAccessTest", () => {
  it("#at with Integer, returns a substring of one character at that position", () => {
    expect(at("hello", 0)).toEqual("h");
  });

  it("#at with Range, returns a substring containing characters at offsets", () => {
    expect(at("hello", [-2, -1])).toEqual("lo");
  });

  it("#at with Regex, returns the matching portion of the string", () => {
    expect(at("hello", /lo/)).toEqual("lo");
    expect(at("hello", /nonexisting/)).toBeUndefined();
  });

  it("#from with positive Integer, returns substring from the given position to the end", () => {
    expect(from("hello", 2)).toEqual("llo");
  });

  it("#from with negative Integer, position is counted from the end", () => {
    expect(from("hello", -2)).toEqual("lo");
  });

  it("#to with positive Integer, substring from the beginning to the given position", () => {
    expect(to("hello", 2)).toEqual("hel");
  });

  it("#to with negative Integer, position is counted from the end", () => {
    expect(to("hello", -2)).toEqual("hell");
    expect(to("hello", -5)).toEqual("h");
    expect(to("hello", -7)).toEqual("");
  });

  it("#from and #to can be combined", () => {
    expect(to(from("hello", 0), -1)).toEqual("hello");
    expect(to(from("hello", 1), -2)).toEqual("ell");
  });

  it("#first returns the first character", () => {
    expect(first("hello")).toEqual("h");
    expect(first("x")).toEqual("x");
  });

  it("#first with Integer, returns a substring from the beginning to position", () => {
    expect(first("hello", 2)).toEqual("he");
    expect(first("hello", 0)).toEqual("");
    expect(first("hello", 10)).toEqual("hello");
    expect(first("x", 4)).toEqual("x");
  });

  it("#first with Integer >= string length still returns a new string", () => {
    const string = "hello";
    const differentString = first(string, 5);
    assertNotSame(Object(differentString), string);
  });

  it("#first with Integer returns a non-frozen string", () => {
    const string = "he";
    for (let limit = 0; limit <= string.length + 1; limit++) {
      assertNot(Object.isFrozen(Object(first(string, limit))));
    }
  });

  it("#first with negative Integer raises ArgumentError", () => {
    expect(() => first("hello", -1)).toThrow();
  });

  it("#last returns the last character", () => {
    expect(last("hello")).toEqual("o");
    expect(last("x")).toEqual("x");
  });

  it("#last with Integer, returns a substring from the end to position", () => {
    expect(last("hello", 3)).toEqual("llo");
    expect(last("hello", 10)).toEqual("hello");
    expect(last("hello", 0)).toEqual("");
    expect(last("x", 4)).toEqual("x");
  });

  it("#last with Integer >= string length still returns a new string", () => {
    const string = "hello";
    const differentString = last(string, 5);
    assertNotSame(Object(differentString), string);
  });

  it("#last with Integer returns a non-frozen string", () => {
    const string = "he";
    for (let limit = 0; limit <= string.length + 1; limit++) {
      assertNot(Object.isFrozen(Object(last(string, limit))));
    }
  });

  it("#last with negative Integer raises ArgumentError", () => {
    expect(() => last("hello", -1)).toThrow();
  });

  it("access returns a real string", () => {
    let hash: Record<string, boolean> = {};
    hash["h"] = true;
    hash[at("hello123", 0)!] = true;
    expect(Object.keys(hash)).toEqual(["h"]);

    hash = {};
    hash["llo"] = true;
    hash[from("hello", 2)] = true;
    expect(Object.keys(hash)).toEqual(["llo"]);

    hash = {};
    hash["hel"] = true;
    hash[to("hello", 2)] = true;
    expect(Object.keys(hash)).toEqual(["hel"]);

    hash = {};
    hash["hello"] = true;
    hash[last("123hello", 5)] = true;
    expect(Object.keys(hash)).toEqual(["hello"]);

    hash = {};
    hash["hello"] = true;
    hash[first("hello123", 5)] = true;
    expect(Object.keys(hash)).toEqual(["hello"]);
  });
});

function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (orig === undefined) delete process.env.TZ;
    else process.env.TZ = orig;
    resetLocalTimeZoneId();
  }
}

function epochNs(time: Temporal.ZonedDateTime | Time | undefined): bigint | undefined {
  if (time === undefined) return undefined;
  return (time instanceof Time ? time.toTime() : time).epochNanoseconds;
}

describe("StringConversionsTest", () => {
  it("string to time", () => {
    withEnvTz("Europe/Moscow", () => {
      expect(epochNs(toTime("2005-02-27 23:50", "utc"))).toBe(
        epochNs(Time.utc(2005, 2, 27, 23, 50)),
      );
      expect(epochNs(toTime("2005-02-27 23:50"))).toBe(epochNs(Time.mktime(2005, 2, 27, 23, 50)));
      expect(epochNs(toTime("2005-02-27T23:50:19.275038", "utc"))).toBe(
        epochNs(Time.utc(2005, 2, 27, 23, 50, 19, 275038)),
      );
      expect(epochNs(toTime("2005-02-27T23:50:19.275038"))).toBe(
        epochNs(Time.mktime(2005, 2, 27, 23, 50, 19, 275038)),
      );
      expect(epochNs(toTime("2039-02-27 23:50", "utc"))).toBe(
        epochNs(Time.utc(2039, 2, 27, 23, 50)),
      );
      expect(epochNs(toTime("2039-02-27 23:50"))).toBe(epochNs(Time.mktime(2039, 2, 27, 23, 50)));
      expect(epochNs(toTime("2011-02-27 13:50 -0100"))).toBe(
        epochNs(Time.mktime(2011, 2, 27, 17, 50)),
      );
      expect(epochNs(toTime("2011-02-27 22:50 -0100", "utc"))).toBe(
        epochNs(Time.utc(2011, 2, 27, 23, 50)),
      );
      expect(epochNs(toTime("2005-02-27 14:50 -0500"))).toBe(
        epochNs(Time.mktime(2005, 2, 27, 22, 50)),
      );
      expect(toTime("010")).toBeUndefined();
      expect(toTime("")).toBeUndefined();
    });
  });

  it("timestamp string to time", async () => {
    const exception = await assertRaises([ArgumentError], {}, () => toTime("1604326192"));

    expect(exception.message).toEqual("argument out of range");
  });

  it("string to time utc offset", () => {
    withEnvTz("US/Eastern", () => {
      const utcOffset = (time: Temporal.ZonedDateTime | Time | undefined) =>
        (time as Temporal.ZonedDateTime).offsetNanoseconds / 1_000_000_000;
      /* eslint-disable vitest/no-conditional-expect */
      if (toTimePreservesTimezone()) {
        expect(utcOffset(toTime("2005-02-27 23:50", "utc"))).toEqual(0);
        expect(utcOffset(toTime("2005-02-27 23:50"))).toEqual(-18000);
        expect(utcOffset(toTime("2005-02-27 22:50 -0100", "utc"))).toEqual(0);
        expect(utcOffset(toTime("2005-02-27 22:50 -0100"))).toEqual(-3600);
      } else {
        expect(utcOffset(toTime("2005-02-27 23:50", "utc"))).toEqual(0);
        expect(utcOffset(toTime("2005-02-27 23:50"))).toEqual(-18000);
        expect(utcOffset(toTime("2005-02-27 22:50 -0100", "utc"))).toEqual(0);
        expect(utcOffset(toTime("2005-02-27 22:50 -0100"))).toEqual(-18000);
      }
      /* eslint-enable vitest/no-conditional-expect */
    });
  });

  it("partial string to time", () => {
    withEnvTz("Europe/Moscow", () => {
      const now = Time.now();
      expect(epochNs(toTime("23:50"))).toBe(
        epochNs(Time.mktime(now.year, now.month, now.day, 23, 50)),
      );
      expect(epochNs(toTime("23:50", "utc"))).toBe(
        epochNs(Time.utc(now.year, now.month, now.day, 23, 50)),
      );
      expect(epochNs(toTime("13:50 -0100"))).toBe(
        epochNs(Time.mktime(now.year, now.month, now.day, 17, 50)),
      );
      expect(epochNs(toTime("22:50 -0100", "utc"))).toBe(
        epochNs(Time.utc(now.year, now.month, now.day, 23, 50)),
      );
    });
  });

  it("standard time string to time when current time is standard time", () => {
    withEnvTz("US/Eastern", () => {
      expect(epochNs(toTime("2012-01-01 10:00"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 -0800"))).toBe(
        epochNs(Time.mktime(2012, 1, 1, 13, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0800", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 18, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0500"))).toBe(
        epochNs(Time.mktime(2012, 1, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0500", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 15, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 1, 1, 5, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 UTC", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 PST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 13, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 PST", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 18, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 EST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 EST", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 15, 0)),
      );
    });
  });

  it("standard time string to time when current time is daylight savings", () => {
    withEnvTz("US/Eastern", () => {
      expect(epochNs(toTime("2012-01-01 10:00"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 -0800"))).toBe(
        epochNs(Time.mktime(2012, 1, 1, 13, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0800", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 18, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0500"))).toBe(
        epochNs(Time.mktime(2012, 1, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 -0500", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 15, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 1, 1, 5, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 UTC", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 PST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 13, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 PST", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 18, 0)),
      );
      expect(epochNs(toTime("2012-01-01 10:00 EST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
      expect(epochNs(toTime("2012-01-01 10:00 EST", "utc"))).toBe(
        epochNs(Time.utc(2012, 1, 1, 15, 0)),
      );
    });
  });

  it("daylight savings string to time when current time is standard time", () => {
    withEnvTz("US/Eastern", () => {
      expect(epochNs(toTime("2012-07-01 10:00"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 -0700"))).toBe(
        epochNs(Time.mktime(2012, 7, 1, 13, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0700", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 17, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0400"))).toBe(
        epochNs(Time.mktime(2012, 7, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0400", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 14, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 7, 1, 6, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 UTC", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 PDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 13, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 PDT", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 17, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 EDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 EDT", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 14, 0)),
      );
    });
  });

  it("daylight savings string to time when current time is daylight savings", () => {
    withEnvTz("US/Eastern", () => {
      expect(epochNs(toTime("2012-07-01 10:00"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 -0700"))).toBe(
        epochNs(Time.mktime(2012, 7, 1, 13, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0700", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 17, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0400"))).toBe(
        epochNs(Time.mktime(2012, 7, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 -0400", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 14, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 7, 1, 6, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 UTC", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 10, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 PDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 13, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 PDT", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 17, 0)),
      );
      expect(epochNs(toTime("2012-07-01 10:00 EDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
      expect(epochNs(toTime("2012-07-01 10:00 EDT", "utc"))).toBe(
        epochNs(Time.utc(2012, 7, 1, 14, 0)),
      );
    });
  });

  it("partial string to time when current time is standard time", () => {
    withEnvTz("US/Eastern", () => {
      const now = vi.spyOn(Time, "now").mockReturnValue(Time.mktime(2012, 1, 1));
      try {
        expect(epochNs(toTime("10:00"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
        expect(epochNs(toTime("10:00", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 10, 0)));
        expect(epochNs(toTime("10:00 -0100"))).toBe(epochNs(Time.mktime(2012, 1, 1, 6, 0)));
        expect(epochNs(toTime("10:00 -0100", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 11, 0)));
        expect(epochNs(toTime("10:00 -0500"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
        expect(epochNs(toTime("10:00 -0500", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 15, 0)));
        expect(epochNs(toTime("10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 1, 1, 5, 0)));
        expect(epochNs(toTime("10:00 UTC", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 10, 0)));
        expect(epochNs(toTime("10:00 PST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 13, 0)));
        expect(epochNs(toTime("10:00 PST", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 18, 0)));
        expect(epochNs(toTime("10:00 PDT"))).toBe(epochNs(Time.mktime(2012, 1, 1, 12, 0)));
        expect(epochNs(toTime("10:00 PDT", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 17, 0)));
        expect(epochNs(toTime("10:00 EST"))).toBe(epochNs(Time.mktime(2012, 1, 1, 10, 0)));
        expect(epochNs(toTime("10:00 EST", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 15, 0)));
        expect(epochNs(toTime("10:00 EDT"))).toBe(epochNs(Time.mktime(2012, 1, 1, 9, 0)));
        expect(epochNs(toTime("10:00 EDT", "utc"))).toBe(epochNs(Time.utc(2012, 1, 1, 14, 0)));
      } finally {
        now.mockRestore();
      }
    });
  });

  it("partial string to time when current time is daylight savings", () => {
    withEnvTz("US/Eastern", () => {
      const now = vi.spyOn(Time, "now").mockReturnValue(Time.mktime(2012, 7, 1));
      try {
        expect(epochNs(toTime("10:00"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
        expect(epochNs(toTime("10:00", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 10, 0)));
        expect(epochNs(toTime("10:00 -0100"))).toBe(epochNs(Time.mktime(2012, 7, 1, 7, 0)));
        expect(epochNs(toTime("10:00 -0100", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 11, 0)));
        expect(epochNs(toTime("10:00 -0500"))).toBe(epochNs(Time.mktime(2012, 7, 1, 11, 0)));
        expect(epochNs(toTime("10:00 -0500", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 15, 0)));
        expect(epochNs(toTime("10:00 UTC"))).toBe(epochNs(Time.mktime(2012, 7, 1, 6, 0)));
        expect(epochNs(toTime("10:00 UTC", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 10, 0)));
        expect(epochNs(toTime("10:00 PST"))).toBe(epochNs(Time.mktime(2012, 7, 1, 14, 0)));
        expect(epochNs(toTime("10:00 PST", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 18, 0)));
        expect(epochNs(toTime("10:00 PDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 13, 0)));
        expect(epochNs(toTime("10:00 PDT", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 17, 0)));
        expect(epochNs(toTime("10:00 EST"))).toBe(epochNs(Time.mktime(2012, 7, 1, 11, 0)));
        expect(epochNs(toTime("10:00 EST", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 15, 0)));
        expect(epochNs(toTime("10:00 EDT"))).toBe(epochNs(Time.mktime(2012, 7, 1, 10, 0)));
        expect(epochNs(toTime("10:00 EDT", "utc"))).toBe(epochNs(Time.utc(2012, 7, 1, 14, 0)));
      } finally {
        now.mockRestore();
      }
    });
  });
  it("string to datetime", () => {
    expect(String(toDatetime("2039-02-27 23:50"))).toEqual("2039-02-27T23:50:00");
    expect(String(toDatetime("2039-02-27T23:50:19.275038-04:00"))).toEqual(
      "2039-02-27T23:50:19.275038-04:00[-04:00]",
    );
    expect(toDatetime("")).toBeUndefined();
  });
  it("partial string to datetime", () => {
    const now = DateTime.now();
    expect(String(toDatetime("23:50"))).toBe(
      String(DateTime.civil(now.year, now.month, now.day, 23, 50)),
    );
    expect(String(toDatetime("23:50 -0400"))).toBe(
      String(DateTime.civil(now.year, now.month, now.day, 23, 50, 0, "-04:00")),
    );
  });
  it("string to date", () => {
    expect(String(toDate("2005-02-27"))).toBe("2005-02-27");
    expect(toDate("")).toBeUndefined();
    expect(String(toDate("Feb 3rd"))).toBe(`${Temporal.Now.plainDateISO().year}-02-03`);
  });
});

describe("StringIndentTest", () => {
  it("does not indent strings that only contain newlines (edge cases)", () => {
    for (const string of ["", "\n", "\n".repeat(7)]) {
      const str = string;
      assertNil(indentBang(str, 8));
      expect(indent(str, 8)).toEqual(str);
      expect(indent(str, 1, "\t")).toEqual(str);
    }
  });

  it("by default, indents with spaces if the existing indentation uses them", () => {
    expect(indent("foo\n  bar", 4)).toEqual("    foo\n      bar");
  });

  it("by default, indents with tabs if the existing indentation uses them", () => {
    expect(indent("foo\n\t\bar", 1)).toEqual("\tfoo\n\t\t\bar");
  });

  it("by default, indents with spaces as a fallback if there is no indentation", () => {
    expect(indent("foo\nbar\nbaz", 3)).toEqual("   foo\n   bar\n   baz");
  });

  it("uses the indent char if passed", () => {
    expect(indent("  def some_method(x, y)\n    some_code\n  end\n", 4, ".")).toEqual(
      "....  def some_method(x, y)\n....    some_code\n....  end\n",
    );

    expect(
      indent(
        "&nbsp;&nbsp;def some_method(x, y)\n&nbsp;&nbsp;&nbsp;&nbsp;some_code\n&nbsp;&nbsp;end\n",
        2,
        "&nbsp;",
      ),
    ).toEqual(
      "&nbsp;&nbsp;&nbsp;&nbsp;def some_method(x, y)\n&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;some_code\n&nbsp;&nbsp;&nbsp;&nbsp;end\n",
    );
  });

  it("does not indent blank lines by default", () => {
    expect(indent("foo\n\nbar", 1)).toEqual(" foo\n\n bar");
  });

  it("indents blank lines if told so", () => {
    expect(indent("foo\n\nbar", 1, null, true)).toEqual(" foo\n \n bar");
  });
});

describe("CoreExtStringMultibyteTest", () => {
  const UTF8_STRING = "こにちわ";
  const ASCII_STRING = "ohayo";
  const INVALID_UTF8_STRING = "\udcb8\udc9e\x08\udc88\udca5";

  it("core ext adds mb chars", () => {
    assertRespondTo(UTF8_STRING, "mbChars");
  });

  it("string should recognize utf8 strings", () => {
    assertPredicate(UTF8_STRING, isUtf8);
    assertPredicate(ASCII_STRING, isUtf8);
    assertNotPredicate(INVALID_UTF8_STRING, isUtf8);
  });

  it("mb chars returns instance of proxy class", () => {
    expect(mbChars(UTF8_STRING)).toBeInstanceOf(Multibyte.proxyClass());
  });
});

describe("StringBehaviorTest", () => {
  it("acts like string", () => {
    assertPredicate("Bambi", actsLikeString);
  });
});

describe("StringExcludeTest", () => {
  it("inverse of #include", () => {
    expect(exclude("hello world" as any, "world" as any)).toBe(false);
    expect(exclude("hello world" as any, "xyz" as any)).toBe(true);
  });
});

describe("StringInflectionsTest", () => {
  let enforceAvailableLocales: boolean;
  beforeAll(() => {
    enforceAvailableLocales = I18n.config().enforceAvailableLocales;
    I18n.config().enforceAvailableLocales = false;
  });
  afterAll(() => {
    I18n.config().enforceAvailableLocales = enforceAvailableLocales;
  });

  it("strip heredoc on an empty string", () => {
    expect(stripHeredoc("")).toEqual("");
  });

  it("strip heredoc on a frozen string", () => {
    assertPredicate(stripHeredoc(""), Object.isFrozen);
  });

  it("strip heredoc on a string with no lines", () => {
    expect(stripHeredoc("x")).toEqual("x");
    expect(stripHeredoc("    x")).toEqual("x");
  });

  it("strip heredoc on a heredoc with no margin", () => {
    expect(stripHeredoc("foo\nbar")).toEqual("foo\nbar");
    expect(stripHeredoc("foo\n  bar")).toEqual("foo\n  bar");
  });

  it("strip heredoc on a regular indented heredoc", () => {
    expect(stripHeredoc("      foo\n        bar\n      baz\n")).toEqual("foo\n  bar\nbaz\n");
  });

  it("strip heredoc on a regular indented heredoc with blank lines", () => {
    expect(stripHeredoc("      foo\n        bar\n\n      baz\n")).toEqual("foo\n  bar\n\nbaz\n");
  });

  it("pluralize", () => {
    for (const [singular, plural] of Object.entries(SingularToPlural)) {
      expect(stringPluralize(singular)).toEqual(plural);
    }

    expect(stringPluralize("plurals")).toEqual("plurals");

    expect(stringPluralize("blargle", 0)).toEqual("blargles");
    expect(stringPluralize("blargle", 1)).toEqual("blargle");
    expect(stringPluralize("blargle", 2)).toEqual("blargles");
  });

  it("pluralize with count = 1 still returns new string", () => {
    const name = "Kuldeep";
    assertNotSame(Object(stringPluralize(name, 1)), name);
  });

  it("singularize", () => {
    for (const [singular, plural] of Object.entries(SingularToPlural)) {
      expect(singularize(plural)).toEqual(singular);
    }
  });

  it("titleize", () => {
    for (const [before, titleized] of Object.entries(MixtureToTitleCase)) {
      expect(titleize(before)).toEqual(titleized);
    }
  });

  it("titleize with keep id suffix", () => {
    for (const [before, titleized] of Object.entries(MixtureToTitleCaseWithKeepIdSuffix)) {
      expect(titleize(before, { keepIdSuffix: true })).toEqual(titleized);
    }
  });

  it("downcase first", () => {
    expect(downcaseFirst("Try again")).toEqual("try again");
  });

  it("downcase first with one char", () => {
    expect(downcaseFirst("T")).toEqual("t");
  });

  it("downcase first with empty string", () => {
    expect(downcaseFirst("")).toEqual("");
    assertNotPredicate(Object(downcaseFirst("")), Object.isFrozen);
  });

  it("upcase first", () => {
    expect(upcaseFirst("what a Lovely Day")).toEqual("What a Lovely Day");
  });

  it("upcase first with one char", () => {
    expect(upcaseFirst("w")).toEqual("W");
  });

  it("upcase first with empty string", () => {
    expect(upcaseFirst("")).toEqual("");
    assertNotPredicate(Object(upcaseFirst("")), Object.isFrozen);
  });

  it("camelize", () => {
    for (const [camel, underscored] of Object.entries(CamelToUnderscore)) {
      expect(stringCamelize(underscored)).toEqual(camel);
    }
  });

  it("camelize lower", () => {
    expect(stringCamelize("Capital", "lower")).toEqual("capital");
  });

  it("camelize upper", () => {
    expect(stringCamelize("Capital", "upper")).toEqual("Capital");
  });

  it("camelize invalid option", async () => {
    const e = await assertRaise([ArgumentError], {}, () =>
      stringCamelize("Capital", null as unknown as "upper"),
    );
    expect(e.message).toEqual("Invalid option, use either :upper or :lower.");
  });

  it("dasherize", () => {
    for (const [underscored, dasherized] of Object.entries(UnderscoresToDashes)) {
      expect(dasherize(underscored)).toEqual(dasherized);
    }
  });

  it("underscore", () => {
    for (const [camel, underscored] of Object.entries(CamelToUnderscore)) {
      expect(underscore(camel)).toEqual(underscored);
    }

    expect(underscore("HTMLTidy")).toEqual("html_tidy");
    expect(underscore("HTMLTidyGenerator")).toEqual("html_tidy_generator");
  });

  it("underscore to lower camel", () => {
    for (const [underscored, lowerCamel] of Object.entries(UnderscoreToLowerCamel)) {
      expect(stringCamelize(underscored, "lower")).toEqual(lowerCamel);
    }
  });

  it("demodulize", () => {
    expect(demodulize("MyApplication::Billing::Account")).toEqual("Account");
  });

  it("deconstantize", () => {
    expect(deconstantize("MyApplication::Billing::Account")).toEqual("MyApplication::Billing");
  });

  it("foreign key", () => {
    for (const [klass, foreignKeyName] of Object.entries(ClassNameToForeignKeyWithUnderscore)) {
      expect(foreignKey(klass)).toEqual(foreignKeyName);
    }

    for (const [klass, foreignKeyName] of Object.entries(ClassNameToForeignKeyWithoutUnderscore)) {
      expect(foreignKey(klass, false)).toEqual(foreignKeyName);
    }
  });

  it("tableize", () => {
    for (const [className, tableName] of Object.entries(ClassNameToTableName)) {
      expect(tableize(className)).toEqual(tableName);
    }
  });

  it("classify", () => {
    for (const [className, tableName] of Object.entries(ClassNameToTableName)) {
      expect(classify(tableName)).toEqual(className);
    }
  });

  it("string parameterized normal", () => {
    for (const [normal, slugged] of Object.entries(StringToParameterized)) {
      expect(parameterize(normal)).toEqual(slugged);
    }
  });

  it("string parameterized normal preserve case", () => {
    for (const [normal, slugged] of Object.entries(StringToParameterizedPreserveCase)) {
      expect(parameterize(normal, { preserveCase: true })).toEqual(slugged);
    }
  });

  it("string parameterized no separator", () => {
    for (const [normal, slugged] of Object.entries(StringToParameterizeWithNoSeparator)) {
      expect(parameterize(normal, { separator: "" })).toEqual(slugged);
    }
  });

  it("string parameterized no separator preserve case", () => {
    for (const [normal, slugged] of Object.entries(
      StringToParameterizePreserveCaseWithNoSeparator,
    )) {
      expect(parameterize(normal, { separator: "", preserveCase: true })).toEqual(slugged);
    }
  });

  it("string parameterized underscore", () => {
    for (const [normal, slugged] of Object.entries(StringToParameterizeWithUnderscore)) {
      expect(parameterize(normal, { separator: "_" })).toEqual(slugged);
    }
  });

  it("string parameterized underscore preserve case", () => {
    for (const [normal, slugged] of Object.entries(
      StringToParameterizePreserveCaseWithUnderscore,
    )) {
      expect(parameterize(normal, { separator: "_", preserveCase: true })).toEqual(slugged);
    }
  });

  it("parameterize with locale", () => {
    const word = "Fünf autos";
    I18n.backend().storeTranslations("de", { i18n: { transliterate: { rule: { ü: "ue" } } } });
    expect(parameterize(word, { locale: "de" })).toEqual("fuenf-autos");
  });

  it("humanize", () => {
    for (const [underscored, human] of Object.entries(UnderscoreToHuman)) {
      expect(humanize(underscored)).toEqual(human);
    }
  });

  it("humanize without capitalize", () => {
    for (const [underscored, human] of Object.entries(UnderscoreToHumanWithoutCapitalize)) {
      expect(humanize(underscored, { capitalize: false })).toEqual(human);
    }
  });

  it("humanize with keep id suffix", () => {
    for (const [underscored, human] of Object.entries(UnderscoreToHumanWithKeepIdSuffix)) {
      expect(humanize(underscored, { keepIdSuffix: true })).toEqual(human);
    }
  });

  it("humanize with html escape", () => {
    expect(humanize(htmlEscape("hello").toStr())).toEqual("Hello");
  });

  it("ord", () => {
    expect("a".codePointAt(0)).toEqual(97);
    expect("abc".codePointAt(0)).toEqual(97);
  });

  it("starts ends with alias", () => {
    const s = "hello";
    assert(startsWith(s, "h"));
    assert(startsWith(s, "hel"));
    assertNot(startsWith(s, "el"));

    assert(endsWith(s, "o"));
    assert(endsWith(s, "lo"));
    assertNot(endsWith(s, "el"));
  });

  it("string squish", () => {
    let original =
      "\u205F\u3000 A string surrounded by various unicode spaces,\n      with tabs(\t\t), newlines(\n\n), unicode nextlines(\u0085\u0085) and many spaces(  ). \u00A0\u2007";

    const expected =
      "A string surrounded by various unicode spaces, " +
      "with tabs( ), newlines( ), unicode nextlines( ) and many spaces( ).";

    expect(squish(original)).toEqual(expected);
    expect(original).not.toEqual(expected);

    expect((original = squish(original))).toEqual(expected);
    expect(original).toEqual(expected);
  });

  it("string inquiry", () => {
    assertPredicate(inquiry.call("production"), (s) => s["production?"]());
    assertNotPredicate(inquiry.call("production"), (s) => s["development?"]());
  });

  it("truncate", () => {
    expect(truncate("Hello World!", 12)).toEqual("Hello World!");
    expect(truncate("Hello World!!", 12)).toEqual("Hello Wor...");
  });

  it("truncate with omission and separator", () => {
    expect(truncate("Hello World!", 10, { omission: "[...]" })).toEqual("Hello[...]");
    expect(truncate("Hello Big World!", 13, { omission: "[...]", separator: " " })).toEqual(
      "Hello[...]",
    );
    expect(truncate("Hello Big World!", 14, { omission: "[...]", separator: " " })).toEqual(
      "Hello Big[...]",
    );
    expect(truncate("Hello Big World!", 15, { omission: "[...]", separator: " " })).toEqual(
      "Hello Big[...]",
    );
  });

  it("truncate with omission and regexp separator", () => {
    expect(truncate("Hello Big World!", 13, { omission: "[...]", separator: /\s/ })).toEqual(
      "Hello[...]",
    );
    expect(truncate("Hello Big World!", 14, { omission: "[...]", separator: /\s/ })).toEqual(
      "Hello Big[...]",
    );
    expect(truncate("Hello Big World!", 15, { omission: "[...]", separator: /\s/ })).toEqual(
      "Hello Big[...]",
    );
  });

  it("truncate returns frozen string", () => {
    assertNot(Object.isFrozen(Object(truncate("Hello World!", 12))));
    assertNot(Object.isFrozen(Object(truncate("Hello World!!", 12))));
  });

  it("truncate bytes", () => {
    const thumbs = "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}";
    expect(truncateBytes(thumbs, 16)).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}");
    expect(truncateBytes(thumbs, 16, { omission: null })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );
    expect(truncateBytes(thumbs, 16, { omission: " " })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );
    expect(truncateBytes(thumbs, 16, { omission: "\u{1F596}" })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );

    expect(truncateBytes(thumbs, 15)).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}…");
    expect(truncateBytes(thumbs, 15, { omission: null })).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}");
    expect(truncateBytes(thumbs, 15, { omission: " " })).toEqual("\u{1F44D}\u{1F44D}\u{1F44D} ");
    expect(truncateBytes(thumbs, 15, { omission: "\u{1F596}" })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F596}",
    );

    expect(truncateBytes(thumbs, 5)).toEqual("…");
    expect(truncateBytes(thumbs, 5, { omission: null })).toEqual("\u{1F44D}");
    expect(truncateBytes(thumbs, 5, { omission: " " })).toEqual("\u{1F44D} ");
    expect(truncateBytes(thumbs, 5, { omission: "\u{1F596}" })).toEqual("\u{1F596}");

    expect(truncateBytes(thumbs, 4)).toEqual("…");
    expect(truncateBytes(thumbs, 4, { omission: null })).toEqual("\u{1F44D}");
    expect(truncateBytes(thumbs, 4, { omission: " " })).toEqual(" ");
    expect(truncateBytes(thumbs, 4, { omission: "\u{1F596}" })).toEqual("\u{1F596}");

    expect(() => truncateBytes(thumbs, 3, { omission: "\u{1F596}" })).toThrow(ArgumentError);
  });

  it("truncate bytes preserves codepoints", () => {
    const thumbs = "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}";
    expect(truncateBytes(thumbs, 16)).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}");
    expect(truncateBytes(thumbs, 16, { omission: null })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );
    expect(truncateBytes(thumbs, 16, { omission: " " })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );
    expect(truncateBytes(thumbs, 16, { omission: "\u{1F596}" })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}",
    );

    expect(truncateBytes(thumbs, 15)).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}…");
    expect(truncateBytes(thumbs, 15, { omission: null })).toEqual("\u{1F44D}\u{1F44D}\u{1F44D}");
    expect(truncateBytes(thumbs, 15, { omission: " " })).toEqual("\u{1F44D}\u{1F44D}\u{1F44D} ");
    expect(truncateBytes(thumbs, 15, { omission: "\u{1F596}" })).toEqual(
      "\u{1F44D}\u{1F44D}\u{1F596}",
    );

    expect(truncateBytes(thumbs, 5)).toEqual("…");
    expect(truncateBytes(thumbs, 5, { omission: null })).toEqual("\u{1F44D}");
    expect(truncateBytes(thumbs, 5, { omission: " " })).toEqual("\u{1F44D} ");
    expect(truncateBytes(thumbs, 5, { omission: "\u{1F596}" })).toEqual("\u{1F596}");

    expect(truncateBytes(thumbs, 4)).toEqual("…");
    expect(truncateBytes(thumbs, 4, { omission: null })).toEqual("\u{1F44D}");
    expect(truncateBytes(thumbs, 4, { omission: " " })).toEqual(" ");
    expect(truncateBytes(thumbs, 4, { omission: "\u{1F596}" })).toEqual("\u{1F596}");

    expect(() => truncateBytes(thumbs, 3, { omission: "\u{1F596}" })).toThrow(ArgumentError);
  });

  it("truncates bytes preserves grapheme clusters", () => {
    const heart = "a ❤\uFE0F b";
    expect(truncateBytes(heart, 2, { omission: null })).toEqual("a ");
    expect(truncateBytes(heart, 3, { omission: null })).toEqual("a ");
    expect(truncateBytes(heart, 7, { omission: null })).toEqual("a ");
    expect(truncateBytes(heart, 8, { omission: null })).toEqual("a ❤\uFE0F");

    const couple = "\u{1F469}\u200D❤\uFE0F\u200D\u{1F469}";
    expect(truncateBytes(`a ${couple}`, 13, { omission: null })).toEqual("a ");
    expect(truncateBytes(couple, 13, { omission: null })).toEqual("");
  });

  it("truncates bytes preserves encoding", () => {
    const original = "a".repeat(30);

    expect(typeof truncateBytes(original, 15)).toEqual("string");
    expect(typeof truncateBytes(original, 15, { omission: null })).toEqual("string");
    expect(typeof truncateBytes(original, 15, { omission: " " })).toEqual("string");
    expect(typeof truncateBytes(original, 15, { omission: "🖖" })).toEqual("string");
  });

  it("truncate words", () => {
    expect(truncateWords("Hello Big World!", 3)).toEqual("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2)).toEqual("Hello Big...");
  });

  it("truncate words with omission", () => {
    expect(truncateWords("Hello Big World!", 3, { omission: "[...]" })).toEqual("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2, { omission: "[...]" })).toEqual("Hello Big[...]");
  });

  it("truncate words with separator", () => {
    expect(truncateWords("Hello<br>Big<br>World!<br>", 3, { separator: "<br>" })).toEqual(
      "Hello<br>Big<br>World!...",
    );
    expect(truncateWords("Hello<br>Big<br>World!", 3, { separator: "<br>" })).toEqual(
      "Hello<br>Big<br>World!",
    );
    expect(truncateWords("Hello\n<br>Big<br>Wide<br>World!", 2, { separator: "<br>" })).toEqual(
      "Hello\n<br>Big...",
    );
  });

  it("truncate words with separator and omission", () => {
    expect(
      truncateWords("Hello<br>Big<br>World!<br>", 3, { omission: "[...]", separator: "<br>" }),
    ).toEqual("Hello<br>Big<br>World![...]");
    expect(
      truncateWords("Hello<br>Big<br>World!", 3, { omission: "[...]", separator: "<br>" }),
    ).toEqual("Hello<br>Big<br>World!");
  });

  it("truncate words with complex string", () => {
    const started = Date.now();
    const complexString =
      "aa aa aaa aa aaa aaa aaa aa aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa aaaa aaaaa aaaaa aaaaaa aa aa aa aaa aa  aaa aa aa aa aa a aaa aaa \n a aaa <<s";
    expect(truncateWords(complexString, 80)).toEqual(complexString);
    // eslint-disable-next-line vitest/no-conditional-in-test
    if (Date.now() - started > 10_000) assert(false);
  });

  it("truncate multibyte", () => {
    expect(truncate("아리랑 아리 아라리오", 10)).toEqual("아리랑 아리 ...");
  });

  it("truncate should not be html safe", () => {
    assertNotPredicate(truncate("Hello World!", 12), isHtmlSafe);
  });

  it("remove", () => {
    const original = "This is a good day to die";
    expect(remove(original, " to die")).toEqual("This is a good day");
    expect(remove(original, " to ", /die/)).toEqual("This is a good day");
    expect(original).toEqual("This is a good day to die");
  });

  it("remove for multiple occurrences", () => {
    const original = "This is a good day to die to die";
    expect(remove(original, " to die")).toEqual("This is a good day");
    expect(original).toEqual("This is a good day to die to die");
  });

  it("remove!", () => {
    let original = "This is a very good day to die";
    expect((original = remove(original, " very"))).toEqual("This is a good day to die");
    expect(original).toEqual("This is a good day to die");
    expect((original = remove(original, " to ", /die/))).toEqual("This is a good day");
    expect(original).toEqual("This is a good day");
  });

  it("constantize", () => {
    _resetConstants();
    registerConstantizeFixtures();
    runConstantizeTestsOn((string) => constantize(string));
  });

  it("safe constantize", () => {
    _resetConstants();
    registerConstantizeFixtures();
    runSafeConstantizeTestsOn((string) => safeConstantize(string));
  });
});

describe("OutputSafetyTest", () => {
  let string: SafeBuffer;
  let object: { toStr(): string };
  let toSObject: { toString(): string };

  beforeEach(() => {
    string = new SafeBuffer("hello", false);
    object = {
      toStr() {
        return "other";
      },
    };
    toSObject = {
      toString() {
        return "to_s";
      },
    };
  });

  it("A string is unsafe by default", () => {
    assertNotPredicate(string, isHtmlSafe);
  });

  it("A string can be marked safe", () => {
    const safe = htmlSafe(string.toStr());
    assertPredicate(safe, isHtmlSafe);
  });

  it("Marking a string safe returns the string", () => {
    expect(htmlSafe(string.toStr()).toString()).toEqual(string.toString());
  });

  it("An integer is safe by default", () => {
    assertPredicate(5, isHtmlSafe);
  });

  it("a float is safe by default", () => {
    assertPredicate(5.7, isHtmlSafe);
  });

  it("An object is unsafe by default", () => {
    assertNotPredicate(object, isHtmlSafe);
  });

  it("Adding an object not responding to `#to_str` to a safe string is deprecated", async () => {
    const safe = htmlSafe(string.toStr());
    await assertRaises([NoMethodError], {}, () => safe.concat(toSObject));
  });

  it("Adding an object to a safe string returns a safe string", () => {
    const safe = htmlSafe(string.toStr());
    safe.concat(object);

    expect(safe.toString()).toEqual("helloother");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Adding a safe string to another safe string returns a safe string", () => {
    const otherString = htmlSafe("other");
    const safe = htmlSafe(string.toStr());
    const combination = otherString.plus(safe);

    expect(combination.toString()).toEqual("otherhello");
    assertPredicate(combination, isHtmlSafe);
  });

  it("Adding an unsafe string to a safe string escapes it and returns a safe string", () => {
    const otherString = htmlSafe("other");
    const combination = otherString.plus("<foo>");
    const otherCombination = string.plus("<foo>");

    expect(combination.toString()).toEqual("other&lt;foo&gt;");
    expect(otherCombination.toString()).toEqual("hello<foo>");

    assertPredicate(combination, isHtmlSafe);
    assertNotPredicate(otherCombination, isHtmlSafe);
  });

  it("Prepending safe onto unsafe yields unsafe", () => {
    string.prepend(htmlSafe("other"));
    assertNotPredicate(string, isHtmlSafe);
    expect(string.toString()).toEqual("otherhello");
  });

  it("Prepending unsafe onto safe yields escaped safe", () => {
    const other = htmlSafe("other");
    other.prepend("<foo>");
    assertPredicate(other, isHtmlSafe);
    expect(other.toString()).toEqual("&lt;foo&gt;other");
  });

  it("Concatting safe onto unsafe yields unsafe", () => {
    const otherString = new SafeBuffer("other", false);

    const safe = htmlSafe(string.toStr());
    otherString.concat(safe);
    assertNotPredicate(otherString, isHtmlSafe);
  });

  it("Concatting unsafe onto safe yields escaped safe", () => {
    const otherString = htmlSafe("other");
    const result = otherString.concat("<foo>");
    expect(result.toString()).toEqual("other&lt;foo&gt;");
    assertPredicate(result, isHtmlSafe);
  });

  it("Concatting safe onto safe yields safe", () => {
    const otherString = htmlSafe("other");
    const safe = htmlSafe(string.toStr());

    otherString.concat(safe);
    assertPredicate(otherString, isHtmlSafe);
  });

  it("Concatting safe onto unsafe with << yields unsafe", () => {
    const otherString = new SafeBuffer("other", false);
    const safe = htmlSafe(string.toStr());

    otherString.concat(safe);
    assertNotPredicate(otherString, isHtmlSafe);
  });

  it("Concatting unsafe onto safe with << yields escaped safe", () => {
    const otherString = htmlSafe("other");
    const result = otherString.concat("<foo>");
    expect(result.toString()).toEqual("other&lt;foo&gt;");
    assertPredicate(result, isHtmlSafe);
  });

  it("Concatting safe onto safe with << yields safe", () => {
    const otherString = htmlSafe("other");
    const safe = htmlSafe(string.toStr());

    otherString.concat(safe);
    assertPredicate(otherString, isHtmlSafe);
  });

  it("Concatting safe onto unsafe with % yields unsafe", () => {
    let otherString = "other%s";
    const safe = htmlSafe(string.toStr());

    otherString = otherString.replace("%s", safe.toStr());
    assertNotPredicate(otherString, isHtmlSafe);
  });

  it("% method explicitly cast the argument to string", () => {
    const otherString = "other%s";
    expect(otherString.replace("%s", String(toSObject))).toEqual("otherto_s");
  });

  it("Concatting unsafe onto safe with % yields escaped safe", () => {
    const otherString = htmlSafe("other%s");
    const result = otherString.format("<foo>");

    expect(result.toString()).toEqual("other&lt;foo&gt;");
    assertPredicate(result, isHtmlSafe);
  });

  it("Concatting safe onto safe with % yields safe", () => {
    let otherString = htmlSafe("other%s");
    const safe = htmlSafe(string.toStr());

    otherString = otherString.format(safe);
    assertPredicate(otherString, isHtmlSafe);
  });

  it("Concatting with % doesn't modify a string", () => {
    const otherString = ["<p>", "<b>", "<h1>"];
    htmlSafe("%s %s %s").format(otherString);

    expect(otherString).toEqual(["<p>", "<b>", "<h1>"]);
  });

  it("Concatting an integer to safe always yields safe", () => {
    let safe = htmlSafe(string.toStr());
    safe = safe.concat(13);
    expect(safe.toString()).toEqual(new SafeBuffer("hello", false).concat(13).toString());
    assertPredicate(safe, isHtmlSafe);
  });

  it("Inserting safe into safe yields safe", () => {
    const safe = htmlSafe("foo");
    safe.insert(0, htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>foo");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Inserting unsafe into safe yields escaped safe", () => {
    const safe = htmlSafe("foo");
    safe.insert(0, "<b>");

    expect(safe.toString()).toEqual("&lt;b&gt;foo");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Replacing safe with safe yields safe", () => {
    const safe = htmlSafe("foo");
    safe.replace(htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Replacing safe with unsafe yields escaped safe", () => {
    const safe = htmlSafe("foo");
    safe.replace("<b>");

    expect(safe.toString()).toEqual("&lt;b&gt;");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Replacing index of safe with safe yields safe", () => {
    let safe = htmlSafe("foo");
    safe.set(0, htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>oo");
    assertPredicate(safe, isHtmlSafe);

    safe = htmlSafe("foo");
    safe.set(0, 2, htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>o");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Replacing index of safe with unsafe yields escaped safe", () => {
    let safe = htmlSafe("foo");
    safe.set(0, "<b>");

    expect(safe.toString()).toEqual("&lt;b&gt;oo");
    assertPredicate(safe, isHtmlSafe);

    safe = htmlSafe("foo");
    safe.set(1, 1, "<b>");

    expect(safe.toString()).toEqual("f&lt;b&gt;o");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Bytesplicing safe into safe yields safe", () => {
    let safe = htmlSafe("hello");
    safe.bytesplice(0, 0, htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>hello");
    assertPredicate(safe, isHtmlSafe);

    safe = htmlSafe("hello");
    safe.bytesplice(new Range(0, 1), htmlSafe("<b>"));

    expect(safe.toString()).toEqual("<b>llo");
    assertPredicate(safe, isHtmlSafe);
  });

  it("Bytesplicing unsafe into safe yields escaped safe", () => {
    let safe = htmlSafe("hello");
    safe.bytesplice(1, 0, "<b>");

    expect(safe.toString()).toEqual("h&lt;b&gt;ello");
    assertPredicate(safe, isHtmlSafe);

    safe = htmlSafe("hello");
    safe.bytesplice(new Range(1, 2), "<b>");

    expect(safe.toString()).toEqual("h&lt;b&gt;lo");
    assertPredicate(safe, isHtmlSafe);
  });

  it("call to_param returns a normal string", () => {
    const safe = htmlSafe(string.toStr());
    assertPredicate(safe, isHtmlSafe);
    assertNotPredicate(safe.toParam(), isHtmlSafe);
  });

  it("TSE::Util.html_escape should escape unsafe characters", () => {
    const str = "<>&\"'";
    const expected = "&lt;&gt;&amp;&quot;&#39;";
    expect(htmlEscape(str).toString()).toEqual(expected);
  });

  it("TSE::Util.html_escape should correctly handle invalid UTF-8 strings", () => {
    const str = new TextDecoder().decode(new Uint8Array([0xa9, 0x20, 0x3c]));
    const expected = "� &lt;";
    expect(htmlEscape(str).toString()).toEqual(expected);
  });

  it("TSE::Util.html_escape should not escape safe strings", () => {
    const str = htmlSafe("<b>hello</b>");
    expect(htmlEscape(str)).toEqual(str);
  });

  it("TSE::Util.html_escape_once only escapes once", () => {
    const str = "1 < 2 &amp; 3";
    const escapedString = "1 &lt; 2 &amp; 3";

    expect(htmlEscapeOnce(str).toString()).toEqual(escapedString);
    expect(htmlEscapeOnce(escapedString).toString()).toEqual(escapedString);
  });

  it("TSE::Util.html_escape_once should correctly handle invalid UTF-8 strings", () => {
    const str = new TextDecoder().decode(new Uint8Array([0xa9, 0x20, 0x3c]));
    const expected = "� &lt;";
    expect(htmlEscapeOnce(str).toString()).toEqual(expected);
  });

  it("TSE::Util.html_escape_once preserves numeric character references", () => {
    expect(htmlEscapeOnce("&#123;").toString()).toBe("&#123;");
    expect(htmlEscapeOnce("&#x1F4A9;").toString()).toBe("&#x1F4A9;");
    expect(htmlEscapeOnce("&#X27;").toString()).toBe("&#X27;");
    expect(htmlEscapeOnce("&#x03BB;").toString()).toBe("&#x03BB;");
  });

  it("TSE::Util.html_escape_once escapes invalid entity-like sequences", () => {
    expect(htmlEscapeOnce("&1;").toString()).toBe("&amp;1;");
    expect(htmlEscapeOnce("&#1dfa3;").toString()).toBe("&amp;#1dfa3;");
    expect(htmlEscapeOnce("& #123;").toString()).toBe("&amp; #123;");
  });

  it("TSE::Util.xml_name_escape should escape unsafe characters for XML names", () => {
    const unsafeChar = ">";
    const safeChar = "\u00C1";
    const safeCharAfterStart = "3";
    const startingWithDash = "-foo";

    expect(xmlNameEscape(unsafeChar)).toBe("_");
    expect(xmlNameEscape(unsafeChar + safeChar)).toBe(`_${safeChar}`);
    expect(xmlNameEscape(unsafeChar.repeat(2))).toBe("__");

    expect(xmlNameEscape(`${unsafeChar.repeat(2)}${safeChar}${unsafeChar}`)).toBe(`__${safeChar}_`);

    expect(xmlNameEscape(safeChar + safeCharAfterStart)).toBe(safeChar + safeCharAfterStart);

    expect(xmlNameEscape(safeCharAfterStart + safeChar)).toBe(`_${safeChar}`);

    expect(xmlNameEscape("img src=nonexistent onerror=alert(1)")).toBe(
      "img_src_nonexistent_onerror_alert_1_",
    );

    const commonDangerousChars = "&<>\"' %*+,/;=^|";
    expect(xmlNameEscape(commonDangerousChars)).toBe("_".repeat(commonDangerousChars.length));

    expect(xmlNameEscape(startingWithDash)).toBe("_foo");
  });
});
