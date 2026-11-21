import { Time } from "@blazetrails/date";
import { Rational, rbFCaller, warn } from "@blazetrails/ruby-compat";
import { Coder } from "../coder.js";
import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

/** @internal */
function isdigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

/** @internal */
function charToDigit(c: string): number {
  return c.charCodeAt(0) - 48;
}

/** @internal */
function str2ToInt(str: string, p: number): number {
  return charToDigit(str[p]) * 10 + charToDigit(str[p + 1]);
}

/** @internal */
function parseYear(val: string, str: { p: number }): number {
  let year = 0;
  let i: number;
  let p = str.p;

  for (i = 0; isdigit(val[p]) && i < 7; i++, p++) {
    year = 10 * year + charToDigit(val[p]);
  }

  str.p = p;
  return year;
}

const TZ_NEG = 1;
const TZ_POS = 2;

export class Timestamp extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return pgTextDecTimestamp(this, string);
  }
}

/** @internal */
function pgTextDecTimestamp(conv: Timestamp, val: string): unknown {
  const s = { p: 0 };
  let nsec = 0;
  let tzGiven = 0;
  let tzHour = 0;
  let tzMin = 0;
  let tzSec = 0;

  let year = parseYear(val, s);
  let str = s.p;

  if (
    year > 0 &&
    val[str] === "-" &&
    isdigit(val[str + 1]) &&
    isdigit(val[str + 2]) &&
    val[str + 3] === "-" &&
    isdigit(val[str + 4]) &&
    isdigit(val[str + 5]) &&
    val[str + 6] === " " &&
    isdigit(val[str + 7]) &&
    isdigit(val[str + 8]) &&
    val[str + 9] === ":" &&
    isdigit(val[str + 10]) &&
    isdigit(val[str + 11]) &&
    val[str + 12] === ":" &&
    isdigit(val[str + 13]) &&
    isdigit(val[str + 14])
  ) {
    const mon = str2ToInt(val, str + 1);
    str += 3;
    const day = str2ToInt(val, str + 1);
    str += 3;
    const hour = str2ToInt(val, str + 1);
    str += 3;
    const min = str2ToInt(val, str + 1);
    str += 3;
    const sec = str2ToInt(val, str + 1);
    str += 3;

    if (val[str] === "." && isdigit(val[str + 1])) {
      const coef = [100000000, 10000000, 1000000, 100000, 10000, 1000, 100, 10, 1];
      let i: number;

      str++;
      for (i = 0; i < 9 && isdigit(val[str]); i++) {
        nsec += coef[i] * charToDigit(val[str++]);
      }
      while (isdigit(val[str])) str++;
    }

    if ((val[str] === "+" || val[str] === "-") && isdigit(val[str + 1]) && isdigit(val[str + 2])) {
      tzGiven = val[str] === "-" ? TZ_NEG : TZ_POS;
      tzHour = str2ToInt(val, str + 1);
      str += 3;

      if (val[str] === ":" && isdigit(val[str + 1]) && isdigit(val[str + 2])) {
        tzMin = str2ToInt(val, str + 1);
        str += 3;
      }
      if (val[str] === ":" && isdigit(val[str + 1]) && isdigit(val[str + 2])) {
        tzSec = str2ToInt(val, str + 1);
        str += 3;
      }
    }

    if (val[str] === " " && val[str + 1] === "B" && val[str + 2] === "C") {
      year = -year + 1;
      str += 3;
    }

    if (str === val.length) {
      let secValue: number | Rational;
      let gmtOffsetValue: number | null;

      if (tzGiven) {
        const time = timegm(year, mon, day, hour, min, sec);
        if (time !== -1) {
          let gmtOffset = tzHour * 3600 + tzMin * 60 + tzSec;
          if (tzGiven === TZ_NEG) {
            gmtOffset = -gmtOffset;
          }
          return Time.timespecNew(
            BigInt(time - gmtOffset) * 1_000_000_000n + BigInt(nsec),
            gmtOffset,
          );
        }
      } else if (!(conv.flags & Coder.TIMESTAMP_DB_LOCAL)) {
        const time = timegm(year, mon, day, hour, min, sec);
        if (time !== -1) {
          return Time.timespecNew(
            BigInt(time) * 1_000_000_000n + BigInt(nsec),
            conv.flags & Coder.TIMESTAMP_APP_LOCAL ? "local" : "utc",
          );
        }
      }

      if (nsec) {
        const secNumerator = sec * 1000000 + Math.trunc(nsec / 1000);
        const secDenominator = 1000000;
        secValue = new Rational(secNumerator, secDenominator);
      } else {
        secValue = sec;
      }

      if (tzGiven) {
        let gmtOffset = tzHour * 3600 + tzMin * 60 + tzSec;
        if (tzGiven === TZ_NEG) {
          gmtOffset = -gmtOffset;
        }
        gmtOffsetValue = gmtOffset;
      } else {
        gmtOffsetValue = conv.flags & Coder.TIMESTAMP_DB_LOCAL ? null : 0;
      }

      const res = Time.new(year, mon, day, hour, min, secValue, gmtOffsetValue);

      if (tzGiven) {
        return res;
      } else {
        if (conv.flags & Coder.TIMESTAMP_DB_LOCAL && conv.flags & Coder.TIMESTAMP_APP_LOCAL) {
          return res;
        } else if (conv.flags & Coder.TIMESTAMP_APP_LOCAL) {
          return res.getlocal();
        } else {
          return res.utc();
        }
      }
    }
  }

  return val;
}

/** @internal */
function timegm(
  year: number,
  mon: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
): number {
  if (year < 100 || year > 275759) return -1;
  const ms = globalThis.Date.UTC(year, mon - 1, day, hour, min, sec);
  return Number.isNaN(ms) ? -1 : ms / 1000;
}

export class TimestampUtc extends Timestamp {
  constructor(hash: Record<string, unknown> | null = {}, kwargs: Record<string, unknown> = {}) {
    if (Object.keys(hash ?? {}).length > 0) {
      warn(
        `PG::Coder.new(hash) is deprecated. Please use keyword arguments instead! Called from ${rbFCaller()[0]}`,
        { category: ":deprecated" },
      );
    }
    super(null, { ...hash, ...kwargs, flags: Coder.TIMESTAMP_DB_UTC | Coder.TIMESTAMP_APP_UTC });
  }
}

export class TimestampUtcToLocal extends Timestamp {
  constructor(hash: Record<string, unknown> | null = {}, kwargs: Record<string, unknown> = {}) {
    if (Object.keys(hash ?? {}).length > 0) {
      warn(
        `PG::Coder.new(hash) is deprecated. Please use keyword arguments instead! Called from ${rbFCaller()[0]}`,
        { category: ":deprecated" },
      );
    }
    super(null, { ...hash, ...kwargs, flags: Coder.TIMESTAMP_DB_UTC | Coder.TIMESTAMP_APP_LOCAL });
  }
}

export class TimestampLocal extends Timestamp {
  constructor(hash: Record<string, unknown> | null = {}, kwargs: Record<string, unknown> = {}) {
    if (Object.keys(hash ?? {}).length > 0) {
      warn(
        `PG::Coder.new(hash) is deprecated. Please use keyword arguments instead! Called from ${rbFCaller()[0]}`,
        { category: ":deprecated" },
      );
    }
    super(null, {
      ...hash,
      ...kwargs,
      flags: Coder.TIMESTAMP_DB_LOCAL | Coder.TIMESTAMP_APP_LOCAL,
    });
  }
}

PG.TextDecoder.Timestamp = Timestamp;
PG.TextDecoder.TimestampUtc = TimestampUtc;
PG.TextDecoder.TimestampUtcToLocal = TimestampUtcToLocal;
PG.TextDecoder.TimestampLocal = TimestampLocal;
PG.TextDecoder.TimestampWithoutTimeZone = TimestampLocal;
PG.TextDecoder.TimestampWithTimeZone = Timestamp;
