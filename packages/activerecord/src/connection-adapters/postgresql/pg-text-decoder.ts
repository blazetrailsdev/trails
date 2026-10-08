import { Temporal } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import {
  parsePostgresInstant,
  parsePostgresTimestampAsInstant,
  parsePostgresDate,
  timeFromInstant,
} from "../abstract/temporal-wire.js";
import { unescapeBytea } from "./pg-connection.js";

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
export abstract class PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  readonly oid: number;
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  readonly name: string;

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  constructor({ oid, name }: { oid: number; name: string }) {
    this.oid = oid;
    this.name = name;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  toH(): { oid: number; name: string } {
    return { oid: this.oid, name: this.name };
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  abstract decode(string: string): unknown;
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Integer extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    const value = BigInt(string);
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Float extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return parseFloat(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Numeric extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return new BigDecimal(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Boolean extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return string === "t";
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class TimestampUtc extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return timeFromInstant(parsePostgresTimestampAsInstant(string, "UTC"));
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class TimestampWithoutTimeZone extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return timeFromInstant(parsePostgresTimestampAsInstant(string, Temporal.Now.timeZoneId()));
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class TimestampWithTimeZone extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return timeFromInstant(parsePostgresInstant(string));
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Bytea extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return unescapeBytea(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
class Date extends PGSimpleDecoder {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  decode(string: string): unknown {
    return parsePostgresDate(string);
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
export const PGTextDecoder = {
  Integer,
  Float,
  Numeric,
  Boolean,
  TimestampUtc,
  TimestampWithoutTimeZone,
  TimestampWithTimeZone,
  Bytea,
  Date,
};

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
export class PGTypeMapByOid {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  readonly coders = new Map<number, PGSimpleDecoder>();

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  addCoder(coder: PGSimpleDecoder): this {
    this.coders.set(coder.oid, coder);
    return this;
  }
}
