import { quotingHost } from "./support/quoting-host.js";
import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { assertRaises, minutes, BigDecimal, Chars, toFs } from "@blazetrails/activesupport";
import {
  quote as quoteFn,
  quoteString,
  quoteColumnName,
  quoteTableName as quoteTableNameFn,
  quotedDate as quotedDateFn,
  quotedTime as quotedTimeFn,
  quotedTrue,
  quotedFalse,
  typeCast as typeCastFn,
} from "./connection-adapters/abstract/quoting.js";

const HOST = quotingHost();
const quote = (value: unknown): string => quoteFn.call(HOST, value);
const quoteTableName = (name: string): string => quoteTableNameFn.call(HOST, name);
const typeCast = (value: unknown): unknown => typeCastFn.call(HOST, value);
const quotedTime = (value: Parameters<typeof quotedTimeFn>[0]): string =>
  quotedTimeFn.call(HOST, value);
const quotedDate = (value: Parameters<typeof quotedDateFn>[0]): string =>
  quotedDateFn.call(HOST, value);
import { rbFSend, TypeError } from "@blazetrails/ruby-compat";
import { NotImplementedError } from "./errors.js";
import { setDefaultTimezone } from "./active-record.js";
import { withEnvTz, withTimezoneConfig } from "./test-helper.js";

afterEach(() => {
  setDefaultTimezone("utc");
});

describe("QuotingTest", () => {
  it("quoted true", () => {
    expect(quotedTrue()).toBe("TRUE");
  });

  it("quoted false", () => {
    expect(quotedFalse()).toBe("FALSE");
  });

  it("quote string", () => {
    expect(quoteString("'")).toBe("''");
    expect(quoteString("\\")).toBe("\\\\");
    expect(quoteString("hi'i")).toBe("hi''i");
    expect(quoteString("hi\\i")).toBe("hi\\\\i");
  });

  it("quoted date", () => {
    const d = Temporal.PlainDateTime.from("2026-04-07T00:00:00");
    expect(quotedDate(d.toZonedDateTime("UTC").toInstant())).toBe("2026-04-07 00:00:00");
  });

  it("quoted timestamp utc", () => {
    const t = Temporal.Instant.from("2026-04-07T15:30:00Z");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });

  it("quoted time utc", () => {
    const t = RubyTime.utc(2026, 4, 7, 15, 30, 45);
    expect(quotedTime(t)).toBe("15:30:45");
  });

  it("quote nil", () => {
    expect(quote(null)).toBe("NULL");
  });

  it("quote true", () => {
    expect(quote(true)).toBe(quotedTrue());
  });

  it("quote false", () => {
    expect(quote(false)).toBe(quotedFalse());
  });

  it("quote float", () => {
    expect(quote(1.2)).toBe("1.2");
  });

  it("quote integer", () => {
    expect(quote(1)).toBe("1");
  });

  it("quote bignum", () => {
    const bignum = 1n << 100n;
    expect(quote(bignum)).toBe(bignum.toString());
  });

  it("quote string no column", () => {
    expect(quote("lo\\l")).toBe("'lo\\\\l'");
  });

  it("quoting classes", () => {
    expect(quote(Object)).toBe("'Object'");
  });

  it("quote object instance", async () => {
    const object = new (class Object {})();
    const e = await assertRaises([TypeError], {}, () => {
      quote(object);
    });
    expect(e.message).toBe("can't quote Object");
  });

  it("quote column name", () => {
    expect(() => quoteColumnName.call(HOST, "foo")).toThrow(NotImplementedError);
  });

  it("quote table name", () => {
    expect(() => quoteTableName("foo")).toThrow(NotImplementedError);
  });

  it("quote duration", async () => {
    const exception = await assertRaises([TypeError], {}, () => {
      quote(minutes(30));
    });
    expect(exception.message).toBe("can't quote ActiveSupport::Duration");
  });
  it("quote table name calls quote column name", () => {
    const host = quotingHost({
      quoteColumnName(_string: string): string {
        return "lol";
      },
    });
    expect(quoteTableNameFn.call(host, "foo")).toBe("lol");
  });
  it("quoted timestamp local", () => {
    setDefaultTimezone("local");
    const zone = Temporal.Now.timeZoneId();
    const zdt = Temporal.ZonedDateTime.from(`2026-04-07T15:30:00[${zone}]`);
    expect(quotedDate(zdt.toInstant())).toBe("2026-04-07 15:30:00");
  });
  it("quoted time local", () => {
    setDefaultTimezone("local");
    const t = RubyTime.now().change({ usec: 0 });

    const expected = toFs(t.change({ year: 2000, month: 1, day: 1 }).getlocal(), "db").replace(
      "2000-01-01 ",
      "",
    );

    expect(quotedTime(t)).toBe(expected);
  });
  it("quoted time dst utc", async () => {
    await withEnvTz("America/New_York", async () => {
      await withTimezoneConfig({ default: "utc" }, () => {
        const t = RubyTime.new(2000, 7, 1, 0, 0, 0, "+04:30");

        const expected = toFs(t.change({ year: 2000, month: 1, day: 1 }).getutc(), "db").slice(11);

        expect(quotedTime(t)).toBe(expected);
      });
    });
  });
  it("quoted time dst local", async () => {
    await withEnvTz("America/New_York", async () => {
      await withTimezoneConfig({ default: "local" }, () => {
        const t = RubyTime.new(2000, 7, 1, 0, 0, 0, "+04:30");

        const expected = toFs(t.change({ year: 2000, month: 1, day: 1 }).getlocal(), "db").slice(
          11,
        );

        expect(quotedTime(t)).toBe(expected);
      });
    });
  });
  it("quoted datetime utc", () => {
    const t = Temporal.PlainDateTime.from("2026-04-07T15:30:00");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });
  it("quoted datetime local", () => {
    setDefaultTimezone("local");
    const t = RubyTime.now().change({ usec: 0 }).toDatetime();
    expect(quotedDate(t)).toBe(rbFSend(t, "toFs", "db"));
  });
  it("quote bigdecimal", () => {
    const bigdec = new BigDecimal((1n << 100n).toString());
    expect(quote(bigdec)).toBe(bigdec.toString("F"));
  });
  it("dates and times", () => {
    const host = quotingHost({
      quotedDate(_value: unknown): string {
        return "lol";
      },
    });
    const hostQuote = (value: unknown): string => quoteFn.call(host, value);
    expect(hostQuote(Temporal.Now.plainDateISO())).toBe("'lol'");
    expect(hostQuote(Temporal.Now.instant())).toBe("'lol'");
    expect(hostQuote(Temporal.Now.plainDateTimeISO())).toBe("'lol'");
  });
  it("quote as mb chars no column", () => {
    const string = new Chars("lo\\l");
    expect(quote(string)).toBe("'lo\\\\l'");
  });
});

describe("TypeCastingTest", () => {
  it("type cast symbol", () => {
    expect(typeCast("foo")).toBe("foo");
  });

  it("type cast numeric", () => {
    expect(typeCast(10)).toBe(10);
    expect(typeCast(2.2)).toBe(2.2);
  });

  it("type cast nil", () => {
    expect(typeCast(null)).toBeNull();
  });

  it("type cast unknown should raise error", () => {
    expect(() => typeCast({})).toThrow(TypeError);
  });

  it("type cast date", () => {
    const date = Temporal.Now.plainDateISO();
    const expected = quotedDate(date);
    expect(typeCast(date)).toBe(expected);
  });
  it("type cast time", () => {
    const t = Temporal.Instant.from("2026-04-07T15:30:00Z");
    expect(typeCast(t)).toBe("2026-04-07 15:30:00");
  });
  it("type cast duration should raise error", () => {
    expect(() => typeCast(minutes(30))).toThrow(TypeError);
  });
});

describe("QuoteBooleanTest", () => {
  it("quote returns frozen string", () => {
    expect(Object.isFrozen(quote(true))).toBeTruthy();
    expect(Object.isFrozen(quote(false))).toBeTruthy();
  });
  it("type cast returns frozen value", () => {
    expect(Object.isFrozen(typeCast(true))).toBeTruthy();
    expect(Object.isFrozen(typeCast(false))).toBeTruthy();
  });
});
