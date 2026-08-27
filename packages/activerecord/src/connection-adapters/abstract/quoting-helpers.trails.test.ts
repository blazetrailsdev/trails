import { quotingHost } from "../../support/quoting-host.js";
import { NotImplementedError } from "../../errors.js";
import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { BinaryData } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone } from "@blazetrails/activesupport";
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

  it("formats a TimeWithZone through its UTC instant", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const v = new TimeWithZone(Temporal.Instant.from("2026-04-26T14:23:55Z"), eastern);
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("quote and type_cast route a TimeWithZone through quotedDate", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const v = new TimeWithZone(Temporal.Instant.from("2026-04-26T14:23:55Z"), eastern);
    expect(quote.call(quotingHost(), v)).toBe("'2026-04-26 14:23:55'");
    expect(typeCast.call(quotingHost(), v)).toBe("2026-04-26 14:23:55");
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
    expect(quotedTime.call(quotingHost(), v)).toBe("14:23:55");
  });

  it("formats a Temporal.PlainDateTime stripping the date", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.123456");
    expect(quotedTime.call(quotingHost(), v)).toBe("14:23:55.123456");
  });

  it("normalises the date component to 2000-01-01", () => {
    const v = Temporal.PlainDateTime.from("2099-12-31T09:00:00");
    expect(quotedTime.call(quotingHost(), v)).toBe("09:00:00");
  });

  it("dispatches through this.quotedDate (mirrors Rails quoted_time → self.quoted_date)", () => {
    const host = quotingHost({ quotedDate: () => "2000-01-01 11:22:33" });
    const v = Temporal.PlainTime.from("11:22:33");
    expect(quotedTime.call(host, v)).toBe("11:22:33");
  });
});

describe("quote dispatches through quoted_date/quoted_time", () => {
  it("routes Date/Time values through this.quotedDate", () => {
    const host = quotingHost({ quotedDate: () => "DISPATCHED" });
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quote.call(host, v)).toBe("'DISPATCHED'");
  });

  it("routes Time::Value (PlainTime) through this.quotedTime", () => {
    const host = quotingHost({ quotedTime: () => "DISPATCHED_TIME" });
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quote.call(host, v)).toBe("'DISPATCHED_TIME'");
  });

  it("uses the abstract quoted_date on a receiver that does not override it", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quote.call(quotingHost(), v)).toBe("'2026-04-26'");
  });

  it("uses the abstract quoted_time on a receiver that does not override it", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quote.call(quotingHost(), v)).toBe("'14:23:55'");
  });
});

describe("quote dispatches through quoted_binary", () => {
  it("routes Type::Binary::Data through this.quotedBinary", () => {
    const host = quotingHost({ quotedBinary: () => "DISPATCHED_BINARY" });
    expect(quote.call(host, new BinaryData(new Uint8Array([0xde, 0xad])))).toBe(
      "DISPATCHED_BINARY",
    );
  });

  it("passes the Type::Binary::Data itself to this.quotedBinary", () => {
    let received: unknown;
    const host = quotingHost({
      quotedBinary: (value: unknown) => {
        received = value;
        return "";
      },
    });
    const data = new BinaryData(new Uint8Array([0xde, 0xad]));
    quote.call(host, data);
    expect(received).toBe(data);
  });

  it("passes normalized bytes to this.quotedBinary for a raw byte view", () => {
    let received: unknown;
    const host = quotingHost({
      quotedBinary: (value: unknown) => {
        received = value;
        return "";
      },
    });
    const bytes = new Uint8Array([0xde, 0xad]);
    quote.call(host, bytes);
    expect(received).toBeInstanceOf(Uint8Array);
    expect(received).toEqual(bytes);
  });

  it("falls back to the module quoted_binary helper without a host", () => {
    expect(quote.call(quotingHost(), new BinaryData("ab"))).toBe("'ab'");
  });

  it("normalises every byte source in the module quoted_binary fallback", () => {
    expect(quotedBinary(new Uint8Array([0x61, 0x62]))).toBe("'ab'");
    expect(quotedBinary(new Uint8Array([0x61, 0x62]).buffer)).toBe("'ab'");
    expect(quotedBinary(new BinaryData("ab"))).toBe("'ab'");
  });

  it("keeps non-UTF-8 bytes byte-exact in the module quoted_binary fallback", () => {
    const bytes = [0xde, 0xad, 0xbe, 0xef];
    const expected = `'${bytes.map((b) => String.fromCharCode(b)).join("")}'`;
    expect(quotedBinary(new BinaryData(new Uint8Array(bytes)))).toBe(expected);
    expect(quotedBinary(new Uint8Array(bytes))).toBe(expected);
    expect(
      Array.from(quotedBinary(new Uint8Array(bytes)).slice(1, -1), (c) => c.charCodeAt(0)),
    ).toEqual(bytes);
  });
});

describe("type_cast unwraps Type::Binary::Data", () => {
  it("returns the raw bytes, not a lossy UTF-8 decode", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const out = typeCast.call(quotingHost(), new BinaryData(bytes));
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out).toEqual(bytes);
  });
});

describe("type_cast dispatches through quoted_date/quoted_time", () => {
  it("routes Date/Time values through this.quotedDate", () => {
    const host = quotingHost({ quotedDate: () => "DISPATCHED" });
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(typeCast.call(host, v)).toBe("DISPATCHED");
  });

  it("routes Time::Value (PlainTime) through this.quotedTime", () => {
    const host = quotingHost({ quotedTime: () => "DISPATCHED_TIME" });
    const v = Temporal.PlainTime.from("14:23:55");
    expect(typeCast.call(host, v)).toBe("DISPATCHED_TIME");
  });

  it("uses the abstract quoted_date on a receiver that does not override it", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(typeCast.call(quotingHost(), v)).toBe("2026-04-26");
  });

  it("uses the abstract quoted_time on a receiver that does not override it", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(typeCast.call(quotingHost(), v)).toBe("14:23:55");
  });
});

describe("quote_table_name dispatches through quote_column_name", () => {
  it("routes through this.quoteColumnName", () => {
    const host = quotingHost({ quoteColumnName: (n: string) => `<<${n}>>` });
    expect(quoteTableName.call(host, "people")).toBe("<<people>>");
  });

  it("raises on a receiver with no quoter rather than answering with ANSI quotes", () => {
    expect(() => quoteTableName.call(quotingHost(), "people")).toThrow(NotImplementedError);
  });
});

describe("boolean literals dispatch through the host", () => {
  const host = quotingHost({
    quotedTrue: () => "1",
    quotedFalse: () => "0",
    unquotedTrue: () => 1,
    unquotedFalse: () => 0,
  });

  it("routes quote through this.quotedTrue/quotedFalse when present", () => {
    expect(quote.call(host, true)).toBe("1");
    expect(quote.call(host, false)).toBe("0");
  });

  it("routes type_cast through this.unquotedTrue/unquotedFalse when present", () => {
    expect(typeCast.call(host, true)).toBe(1);
    expect(typeCast.call(host, false)).toBe(0);
  });

  it("uses the abstract literals on a receiver that does not override them", () => {
    expect(quote.call(quotingHost(), true)).toBe("TRUE");
    expect(quote.call(quotingHost(), false)).toBe("FALSE");
    expect(typeCast.call(quotingHost(), true)).toBe(true);
    expect(typeCast.call(quotingHost(), false)).toBe(false);
  });
});
