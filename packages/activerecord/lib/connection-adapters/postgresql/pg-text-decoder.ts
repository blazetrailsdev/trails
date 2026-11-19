import { Date as RubyDate, Time } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import { Rational, rbFCaller, warn } from "@blazetrails/ruby-compat";
import { SimpleDecoder, unescapeBytea } from "@blazetrails/pg";

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Integer extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    const value = BigInt(string);
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Float extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return parseFloat(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Numeric extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return new BigDecimal(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Boolean extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return string === "t";
  }
}

const TIMESTAMP_DB_LOCAL = 0x1;
const TIMESTAMP_APP_LOCAL = 0x2;

const TIMESTAMP =
  /^(\d{1,7})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:([+-])(\d\d)(?::(\d\d))?(?::(\d\d))?)?( BC)?$/;

class Timestamp extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    const m = TIMESTAMP.exec(string);
    let year = Number(m?.[1]);

    if (year > 0 && m) {
      if (m[12]) year = -year + 1;
      const nsec = BigInt((m[7] ?? "").slice(0, 9).padEnd(9, "0"));
      const local = !m[8] && this.flags & TIMESTAMP_DB_LOCAL;
      if (!local && year <= 275759) {
        const ms = globalThis.Date.UTC(
          year,
          Number(m[2]) - 1,
          Number(m[3]),
          Number(m[4]),
          Number(m[5]),
          Number(m[6]),
        );
        if (year >= 100 && !Number.isNaN(ms)) {
          let gmtOffset = 0;
          if (m[8]) {
            gmtOffset = Number(m[9]) * 3600 + Number(m[10] ?? 0) * 60 + Number(m[11] ?? 0);
            if (m[8] === "-") gmtOffset = -gmtOffset;
          }
          const epochNs = BigInt(ms - gmtOffset * 1000) * 1_000_000n + nsec;
          if (m[8]) return Time.timespecNew(epochNs, gmtOffset);
          return Time.timespecNew(epochNs, this.flags & TIMESTAMP_APP_LOCAL ? "local" : "utc");
        }
      }
      const secValue = nsec
        ? new Rational(BigInt(m[6]) * 1_000_000_000n + nsec, 1_000_000_000n)
        : Number(m[6]);

      if (m[8]) {
        let gmtOffset = Number(m[9]) * 3600 + Number(m[10] ?? 0) * 60 + Number(m[11] ?? 0);
        if (m[8] === "-") gmtOffset = -gmtOffset;
        return Time.new(
          year,
          Number(m[2]),
          Number(m[3]),
          Number(m[4]),
          Number(m[5]),
          secValue,
          gmtOffset,
        );
      }
      const res = Time.new(
        year,
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        secValue,
        this.flags & TIMESTAMP_DB_LOCAL ? null : 0,
      );
      if (this.flags & TIMESTAMP_DB_LOCAL && this.flags & TIMESTAMP_APP_LOCAL) {
        return res;
      } else if (this.flags & TIMESTAMP_APP_LOCAL) {
        return res.getlocal();
      } else {
        return res.utc();
      }
    }

    return string;
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class TimestampUtc extends Timestamp {}

class TimestampLocal extends Timestamp {
  constructor(hash: Record<string, unknown> = {}, kwargs: Record<string, unknown> = {}) {
    if (Object.keys(hash).length > 0) {
      warn(
        `PG::Coder.new(hash) is deprecated. Please use keyword arguments instead! Called from ${rbFCaller()[0]}`,
        { category: ":deprecated" },
      );
    }
    super(null, { ...hash, ...kwargs, flags: TIMESTAMP_DB_LOCAL | TIMESTAMP_APP_LOCAL });
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Bytea extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return unescapeBytea(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Date extends SimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(string);
    if (m) {
      return new RubyDate(Number(m[1]), Number(m[2]), Number(m[3])).toDate();
    } else {
      return string;
    }
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
export const PGTextDecoder = {
  Integer,
  Float,
  Numeric,
  Boolean,
  TimestampUtc,
  TimestampWithoutTimeZone: TimestampLocal,
  TimestampWithTimeZone: Timestamp,
  Bytea,
  Date,
};
