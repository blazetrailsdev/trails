import { Time } from "@blazetrails/date";
import { Rational, rbFCaller, warn } from "@blazetrails/ruby-compat";
import { Coder } from "../coder.js";
import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

const TIMESTAMP =
  /^(\d{1,7})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:([+-])(\d\d)(?::(\d\d))?(?::(\d\d))?)?( BC)?$/;

/** @noRailsEquivalent PERMANENT */
export class Timestamp extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    const m = TIMESTAMP.exec(string);
    let year = Number(m?.[1]);

    if (year > 0 && m) {
      if (m[12]) year = -year + 1;
      const nsec = BigInt((m[7] ?? "").slice(0, 9).padEnd(9, "0"));
      const local = !m[8] && this.flags & Coder.TIMESTAMP_DB_LOCAL;
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
          return Time.timespecNew(
            epochNs,
            this.flags & Coder.TIMESTAMP_APP_LOCAL ? "local" : "utc",
          );
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
        this.flags & Coder.TIMESTAMP_DB_LOCAL ? null : 0,
      );
      if (this.flags & Coder.TIMESTAMP_DB_LOCAL && this.flags & Coder.TIMESTAMP_APP_LOCAL) {
        return res;
      } else if (this.flags & Coder.TIMESTAMP_APP_LOCAL) {
        return res.getlocal();
      } else {
        return res.utc();
      }
    }

    return string;
  }
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
