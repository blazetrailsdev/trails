/**
 * Trails-only unit coverage for the abstract quoting helpers — no Rails
 * counterpart file. Rails has `quoting_test.rb` (ported as `quoting.test.ts`),
 * but no `quoting_helpers_test.rb`, and the self-dispatch helpers exercised here
 * (`dispatchQuotedBinary` / `dispatchQuotedDate` / `dispatchQuotedTime`) are a
 * trails construct standing in for Ruby's `self.quoted_binary` sends. Nothing in
 * this file is matched by `test:compare` — it lands in "extra (TS only)" — so the
 * describe/it names here are ours to choose and are NOT bound by the
 * never-reword-a-test-name rule, which exists to protect Rails-matched names.
 *
 * Renamed to `.trails.test.ts` (was `quoting-helpers.test.ts`) to make that
 * self-evident; it is why reviewers kept having to re-derive it.
 */
import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { BinaryData } from "@blazetrails/activemodel";
import {
  quote,
  quoteTableName,
  quotedBinary,
  quotedDate,
  quotedTime,
  typeCast,
} from "./quoting.js";

describe("quotedDate", () => {
  it("formats a Temporal.Instant as UTC datetime string", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55Z");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("formats a Temporal.PlainDateTime", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("formats a Temporal.PlainDate", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quotedDate(v)).toBe("2026-04-26");
  });

  it("formats a Temporal.PlainTime (normalised to 2000-01-01 date)", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quotedDate(v)).toBe("2000-01-01 14:23:55");
  });

  it("formats a Temporal.ZonedDateTime via its instant", () => {
    const v = Temporal.ZonedDateTime.from("2026-04-26T14:23:55+00:00[UTC]");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("throws for unrecognised types", () => {
    expect(() => quotedDate("2026-04-26" as never)).toThrow("quotedDate: cannot format");
  });
});

describe("quotedTime", () => {
  it("formats a Temporal.PlainTime stripping the date prefix", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quotedTime.call({}, v)).toBe("14:23:55");
  });

  it("formats a Temporal.PlainDateTime stripping the date", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.123456");
    expect(quotedTime.call({}, v)).toBe("14:23:55.123456");
  });

  it("normalises the date component to 2000-01-01", () => {
    const v = Temporal.PlainDateTime.from("2099-12-31T09:00:00");
    expect(quotedTime.call({}, v)).toBe("09:00:00");
  });

  it("dispatches through this.quotedDate (mirrors Rails quoted_time → self.quoted_date)", () => {
    // Override quotedDate to prove the self-dispatch chain is live; the prefix
    // is then stripped by quotedTime's date-removal regex.
    const host = { quotedDate: () => "2000-01-01 11:22:33" };
    const v = Temporal.PlainTime.from("11:22:33");
    expect(quotedTime.call(host, v)).toBe("11:22:33");
  });
});

describe("quote dispatches through quoted_date/quoted_time", () => {
  it("routes Date/Time values through this.quotedDate", () => {
    const host = { quotedDate: () => "DISPATCHED" };
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quote.call(host, v)).toBe("'DISPATCHED'");
  });

  it("routes Time::Value (PlainTime) through this.quotedTime", () => {
    const host = { quotedTime: () => "DISPATCHED_TIME" };
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quote.call(host, v)).toBe("'DISPATCHED_TIME'");
  });

  it("falls back to the module quoted_date helper without a host", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quote.call({}, v)).toBe("'2026-04-26'");
  });

  it("falls back to the module quoted_time helper for PlainTime without a host", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quote.call({}, v)).toBe("'14:23:55'");
  });
});

describe("quote dispatches through quoted_binary", () => {
  it("routes Type::Binary::Data through this.quotedBinary", () => {
    const host = { quotedBinary: () => "DISPATCHED_BINARY" };
    expect(quote.call(host, new BinaryData(new Uint8Array([0xde, 0xad])))).toBe(
      "DISPATCHED_BINARY",
    );
  });

  it("passes the Type::Binary::Data itself to this.quotedBinary", () => {
    // Rails: `when Type::Binary::Data then quoted_binary(value)` (rb:83) hands the
    // wrapper to the override, which unwraps it (`value.to_s` / `value.hex`).
    let received: unknown;
    const host = {
      quotedBinary: (value: unknown) => {
        received = value;
        return "";
      },
    };
    const data = new BinaryData(new Uint8Array([0xde, 0xad]));
    quote.call(host, data);
    expect(received).toBe(data);
  });

  it("passes normalized bytes to this.quotedBinary for a raw byte view", () => {
    // Trails-only affordance: a raw view has no Ruby analogue (Rails only ever
    // sees Type::Binary::Data here), so it is normalized before dispatch.
    let received: unknown;
    const host = {
      quotedBinary: (value: unknown) => {
        received = value;
        return "";
      },
    };
    const bytes = new Uint8Array([0xde, 0xad]);
    quote.call(host, bytes);
    expect(received).toBeInstanceOf(Uint8Array);
    expect(received).toEqual(bytes);
  });

  it("falls back to the module quoted_binary helper without a host", () => {
    // Rails' abstract quoted_binary is `"'#{quote_string(value.to_s)}'"` —
    // the raw byte string, not a comma-joined element list.
    expect(quote.call({}, new BinaryData("ab"))).toBe("'ab'");
  });

  it("normalises every byte source in the module quoted_binary fallback", () => {
    // SQLite's boundary branch dispatches ArrayBuffer, and Rails' signature
    // (abstract/quoting.rb:206) takes the Data itself.
    expect(quotedBinary(new Uint8Array([0x61, 0x62]))).toBe("'ab'");
    expect(quotedBinary(new Uint8Array([0x61, 0x62]).buffer)).toBe("'ab'");
    expect(quotedBinary(new BinaryData("ab"))).toBe("'ab'");
  });

  it("keeps non-UTF-8 bytes byte-exact in the module quoted_binary fallback", () => {
    // Rails' `value.to_s` returns a BINARY-encoded String, so quoted_binary is
    // byte-exact. BinaryData#toString() UTF-8-decodes, which turns invalid
    // sequences into U+FFFD — String(value) would silently corrupt 0xde 0xad
    // 0xbe 0xef into 3 replacement chars. Normalise to bytes instead.
    const bytes = [0xde, 0xad, 0xbe, 0xef];
    const expected = `'${bytes.map((b) => String.fromCharCode(b)).join("")}'`;
    expect(quotedBinary(new BinaryData(new Uint8Array(bytes)))).toBe(expected);
    expect(quotedBinary(new Uint8Array(bytes))).toBe(expected);
    expect(Array.from(quotedBinary(new Uint8Array(bytes)).slice(1, -1), (c) => c.charCodeAt(0))) //
      .toEqual(bytes);
  });
});

describe("type_cast unwraps Type::Binary::Data", () => {
  it("returns the raw bytes, not a lossy UTF-8 decode", () => {
    // Rails: `when Symbol, ActiveSupport::Multibyte::Chars, Type::Binary::Data
    // then value.to_s` (abstract/quoting.rb:96) — `to_s` on a Data is the
    // BINARY-encoded String, so the analogue is `.bytes`. 0xde 0xad 0xbe 0xef is
    // not valid UTF-8: a `toString()` port would yield U+FFFD replacements.
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const out = typeCast.call({}, new BinaryData(bytes));
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out).toEqual(bytes);
  });
});

describe("type_cast dispatches through quoted_date/quoted_time", () => {
  it("routes Date/Time values through this.quotedDate", () => {
    const host = { quotedDate: () => "DISPATCHED" };
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(typeCast.call(host, v)).toBe("DISPATCHED");
  });

  it("routes Time::Value (PlainTime) through this.quotedTime", () => {
    const host = { quotedTime: () => "DISPATCHED_TIME" };
    const v = Temporal.PlainTime.from("14:23:55");
    expect(typeCast.call(host, v)).toBe("DISPATCHED_TIME");
  });

  it("falls back to the module quoted_date helper without a host", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(typeCast.call({}, v)).toBe("2026-04-26");
  });

  it("falls back to the module quoted_time helper for PlainTime without a host", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(typeCast.call({}, v)).toBe("14:23:55");
  });
});

describe("quote_table_name dispatches through quote_column_name", () => {
  it("routes through this.quoteColumnName when present", () => {
    const host = { quoteColumnName: (n: string) => `<<${n}>>` };
    expect(quoteTableName.call(host, "people")).toBe("<<people>>");
  });
});

describe("boolean literals dispatch through the host", () => {
  // Rails reaches the pair via self (abstract/quoting.rb:77-78, 98-99), so an
  // adapter override applies to the *inherited* quote/type_cast. These pin the
  // dispatch, not just the values: a host that overrides the pair must win.
  const host = {
    quotedTrue: () => "1",
    quotedFalse: () => "0",
    unquotedTrue: () => 1,
    unquotedFalse: () => 0,
  };

  it("routes quote through this.quotedTrue/quotedFalse when present", () => {
    expect(quote.call(host, true)).toBe("1");
    expect(quote.call(host, false)).toBe("0");
  });

  it("routes type_cast through this.unquotedTrue/unquotedFalse when present", () => {
    expect(typeCast.call(host, true)).toBe(1);
    expect(typeCast.call(host, false)).toBe(0);
  });

  it("falls back to the module helpers for a host without the overrides", () => {
    expect(quote.call({}, true)).toBe("TRUE");
    expect(quote.call({}, false)).toBe("FALSE");
    expect(typeCast.call({}, true)).toBe(true);
    expect(typeCast.call({}, false)).toBe(false);
  });
});
