/**
 * Precision round-trip tests for the Temporal SQL formatters.
 * Verifies that sub-millisecond precision is preserved end-to-end through the
 * format functions that feed both the text-protocol (quote) and bind paths.
 */

import { quotingHost } from "../../support/quoting-host.js";
import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  formatInstantForSql,
  formatPlainDateTimeForSql,
  formatPlainDateForSql,
  formatPlainTimeForSql,
  formatInstantForSqlMysql,
  formatPlainDateTimeForSqlMysql,
  formatPlainTimeForSqlMysql,
} from "./sql-datetime.js";
import { quote as quoteFn, typeCast as typeCastFn } from "./quoting.js";
import { quotedTime as sqliteQuotedTime } from "../sqlite3/quoting.js";

// `quote` / `typeCast` self-send `quoted_date` / `quoted_time`, so they need a
// receiver that defines them; an override-free adapter host routes date/time
// values through the abstract module helpers.
const quote = (value: unknown): string => quoteFn.call(quotingHost(), value);
const typeCast = (value: unknown): unknown => typeCastFn.call(quotingHost(), value);

describe("formatInstantForSql", () => {
  it("formats a whole-second instant", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55");
  });

  it("pads millisecond precision to a fixed 6-digit microsecond field", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55.123000");
  });

  it("preserves microsecond precision", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("caps fractional seconds at microseconds (drops nanoseconds)", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456789Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("preserves the smallest possible non-zero value (1 µs)", () => {
    const v = Temporal.Instant.from("2024-01-01T00:00:00.000001Z");
    expect(formatInstantForSql(v)).toBe("2024-01-01 00:00:00.000001");
  });

  it("converts a non-UTC instant to UTC when default_timezone is utc (the default)", () => {
    // defaultTimezone is "utc" in tests; local-tz path is
    // integration-tested in PR 7 (timestamp.test.ts with time-travel).
    const v = Temporal.Instant.from("2026-04-26T16:23:55+02:00");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55");
  });
});

describe("formatPlainDateTimeForSql", () => {
  it("formats a whole-second datetime", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    expect(formatPlainDateTimeForSql(v)).toBe("2026-04-26 14:23:55");
  });

  it("preserves microsecond precision", () => {
    const v = Temporal.PlainDateTime.from("2024-12-31T23:59:59.999999");
    expect(formatPlainDateTimeForSql(v)).toBe("2024-12-31 23:59:59.999999");
  });

  it("caps fractional seconds at microseconds, omitting a sub-µs-only value", () => {
    const v = Temporal.PlainDateTime.from("2024-01-01T00:00:00.000000001");
    expect(formatPlainDateTimeForSql(v)).toBe("2024-01-01 00:00:00");
  });
});

describe("formatPlainDateForSql", () => {
  it("formats a date", () => {
    expect(formatPlainDateForSql(Temporal.PlainDate.from("2026-04-26"))).toBe("2026-04-26");
  });

  it("zero-pads month and day", () => {
    expect(formatPlainDateForSql(Temporal.PlainDate.from("2026-01-05"))).toBe("2026-01-05");
  });

  it("formats a negative (BCE) year the way the date gem's %Y does", () => {
    // year -43 = 44 BC in proleptic Gregorian. `to_fs(:db)` is
    // `strftime("%Y-%m-%d")`, and the gem's `%Y` pads the digits to four behind
    // the sign (`Date.new(-43, 3, 15).to_fs(:db)` → "-0043-03-15"), so routing
    // this through packages/date drops the old unpadded "-43-03-15".
    expect(formatPlainDateForSql(Temporal.PlainDate.from({ year: -43, month: 3, day: 15 }))).toBe(
      "-0043-03-15",
    );
  });
});

describe("formatPlainTimeForSql", () => {
  it("formats a whole-second time", () => {
    expect(formatPlainTimeForSql(Temporal.PlainTime.from("14:23:55"))).toBe("14:23:55");
  });

  it("preserves microseconds", () => {
    expect(formatPlainTimeForSql(Temporal.PlainTime.from("14:23:55.123456"))).toBe(
      "14:23:55.123456",
    );
  });

  it("caps fractional seconds at microseconds, omitting a sub-µs-only value", () => {
    expect(formatPlainTimeForSql(Temporal.PlainTime.from("00:00:00.000000001"))).toBe("00:00:00");
  });

  it("pads to a fixed 6-digit microsecond field", () => {
    // millisecond only — padded out to 6 digits
    expect(formatPlainTimeForSql(Temporal.PlainTime.from("12:00:00.100"))).toBe("12:00:00.100000");
  });
});

// The bind path renders date/time values with `type_cast`, which dispatches
// `quoted_date` / `quoted_time` on the connection (abstract/quoting.rb:103-104).
// A bare `{}` receiver exercises the abstract formats.
describe("typeCast of Temporal bind values", () => {
  const bind = (v: unknown) => typeCast(v);

  it("converts Instant to UTC string", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");
    expect(bind(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("converts PlainDateTime to string", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.000001");
    expect(bind(v)).toBe("2026-04-26 14:23:55.000001");
  });

  it("converts PlainDate to string", () => {
    expect(bind(Temporal.PlainDate.from("2026-04-26"))).toBe("2026-04-26");
  });

  it("converts PlainTime to string", () => {
    expect(bind(Temporal.PlainTime.from("14:23:55.123456"))).toBe("14:23:55.123456");
  });

  it("converts ZonedDateTime to UTC instant string", () => {
    const v = Temporal.ZonedDateTime.from("2026-04-26T16:23:55+02:00[Europe/Paris]");
    expect(bind(v)).toBe("2026-04-26 14:23:55");
  });

  it("passes non-Temporal values through unchanged", () => {
    expect(bind(42)).toBe(42);
    expect(bind("hello")).toBe("hello");
    expect(bind(null)).toBe(null);
  });
});

describe("MySQL-safe formatters (clamped to 6 fractional digits)", () => {
  it("formatInstantForSqlMysql drops nanoseconds", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456789Z");
    expect(formatInstantForSqlMysql(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("formatPlainDateTimeForSqlMysql drops nanoseconds", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.123456789");
    expect(formatPlainDateTimeForSqlMysql(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("formatPlainTimeForSqlMysql drops nanoseconds", () => {
    const v = Temporal.PlainTime.from("14:23:55.000000001");
    expect(formatPlainTimeForSqlMysql(v)).toBe("14:23:55");
  });

  it("formatPlainTimeForSqlMysql preserves microseconds", () => {
    const v = Temporal.PlainTime.from("14:23:55.000001");
    expect(formatPlainTimeForSqlMysql(v)).toBe("14:23:55.000001");
  });
});

// Rails `quoted_date` fixed-6 microsecond field (abstract/quoting.rb:194-195):
// `.5` → `.500000`, and usec == 0 omits the fractional part entirely.
describe("SQLite/MySQL fixed-6 microsecond field (quoted_date parity)", () => {
  it("emits a fixed 6-digit field for a half-second (.5 → .500000)", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.5Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55.500000");
    expect(formatInstantForSqlMysql(v)).toBe("2026-04-26 14:23:55.500000");
  });

  it("omits the fractional part when usec == 0", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55Z");
    expect(formatInstantForSql(v)).toBe("2026-04-26 14:23:55");
    expect(formatInstantForSqlMysql(v)).toBe("2026-04-26 14:23:55");
  });

  it("omits the fractional part for a whole-second PlainTime (.000 → omitted)", () => {
    const v = Temporal.PlainTime.from("14:23:55.000");
    expect(formatPlainTimeForSql(v)).toBe("14:23:55");
    expect(formatPlainTimeForSqlMysql(v)).toBe("14:23:55");
  });
});

// The 2000-01-01 prefix is SQLite's `quoted_time` override, reached by
// receiver — the same dispatch Rails uses (abstract/quoting.rb:103).
describe("typeCast on a SQLite receiver uses 2000-01-01 prefix for PlainTime", () => {
  it("wraps PlainTime in 2000-01-01 for sqlite", () => {
    const v = Temporal.PlainTime.from("14:23:55.123456");
    expect(typeCastFn.call(quotingHost({ quotedTime: sqliteQuotedTime }), v)).toBe(
      "2000-01-01 14:23:55.123456",
    );
  });

  it("returns bare time string for postgres", () => {
    const v = Temporal.PlainTime.from("14:23:55.123456");
    expect(typeCast(v)).toBe("14:23:55.123456");
  });
});

// abstract quote() / typeCast() — used by the Postgres adapter which has no
// adapter-specific override for datetime quoting.
describe("abstract quote() with Temporal (Postgres path)", () => {
  it("quotes an Instant", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");
    expect(quote(v)).toBe("'2026-04-26 14:23:55.123456'");
  });

  it("quotes a PlainDateTime", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.000001");
    expect(quote(v)).toBe("'2026-04-26 14:23:55.000001'");
  });

  it("quotes a PlainDate", () => {
    expect(quote(Temporal.PlainDate.from("2026-04-26"))).toBe("'2026-04-26'");
  });

  it("quotes a PlainTime", () => {
    expect(quote(Temporal.PlainTime.from("14:23:55.123456"))).toBe("'14:23:55.123456'");
  });

  it("quotes a ZonedDateTime as its UTC instant", () => {
    const v = Temporal.ZonedDateTime.from("2026-04-26T16:23:55+02:00[Europe/Paris]");
    expect(quote(v)).toBe("'2026-04-26 14:23:55'");
  });
});

describe("abstract typeCast() with Temporal (Postgres path)", () => {
  it("casts an Instant to its UTC string", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");
    expect(typeCast(v)).toBe("2026-04-26 14:23:55.123456");
  });

  it("casts a PlainDate to string", () => {
    expect(typeCast(Temporal.PlainDate.from("2026-04-26"))).toBe("2026-04-26");
  });
});
