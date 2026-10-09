import { Date as RubyDate, Time } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/ruby-compat";
import { unescapeBytea } from "../../pg/connection.js";

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
export abstract class PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  readonly oid: number;
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  readonly name: string;

  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  constructor({ oid, name }: { oid: number; name: string }) {
    this.oid = oid;
    this.name = name;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  toH(): { oid: number; name: string } {
    return { oid: this.oid, name: this.name };
  }

  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  abstract decode(string: string): unknown;
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Integer extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    const value = BigInt(string);
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Float extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return parseFloat(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Numeric extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return new BigDecimal(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Boolean extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return string === "t";
  }
}

const TIMESTAMP_DB_LOCAL = 0x1;
const TIMESTAMP_APP_LOCAL = 0x2;

const TIMESTAMP =
  /^(\d{1,7})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:([+-])(\d\d)(?::(\d\d))?(?::(\d\d))?)?( BC)?$/;

class Timestamp extends PGSimpleDecoder {
  protected flags = 0;

  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    const m = TIMESTAMP.exec(string);
    let year = Number(m?.[1]);

    if (year > 0 && m) {
      const nsec = BigInt((m[7] ?? "").slice(0, 9).padEnd(9, "0"));
      if (m[12]) year = -year + 1;
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
  protected override flags = TIMESTAMP_DB_LOCAL | TIMESTAMP_APP_LOCAL;
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Bytea extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  decode(string: string): unknown {
    return unescapeBytea(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
class Date extends PGSimpleDecoder {
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

/** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
export class PGTypeMapByOid {
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  readonly coders = new Map<number, PGSimpleDecoder>();
  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  defaultTypeMap: PGTypeMapByOid | null = null;

  /** @noRailsEquivalent CONVERGEABLE pg-text-decoders-and-type-map-by-oid-score-against-the-pg-gem */
  addCoder(coder: PGSimpleDecoder): this {
    this.coders.set(coder.oid, coder);
    return this;
  }
}
