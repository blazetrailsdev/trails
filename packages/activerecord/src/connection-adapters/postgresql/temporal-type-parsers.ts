import {
  parsePostgresInstant,
  parsePostgresTimestampAsInstant,
  parsePostgresDate,
} from "../abstract/temporal-wire.js";

const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;

const OID_DATE_ARRAY = 1182;
const OID_TIME_ARRAY = 1183;
const OID_TIMESTAMP_ARRAY = 1115;
const OID_TIMESTAMPTZ_ARRAY = 1185;
const OID_TIMETZ_ARRAY = 1270;

const OID_INT8 = 20;

type PgParser = (value: string | Buffer) => unknown;

const passthrough: PgParser = (v) => v;

const parseInt8: PgParser = (v) => {
  const value = BigInt(v as string);
  const num = Number(value);
  return Number.isSafeInteger(num) ? num : value;
};

const CONNECTION_PARSERS: ReadonlyMap<number, PgParser> = new Map<number, PgParser>([
  [OID_TIMESTAMPTZ, (v) => parsePostgresInstant(v as string)],
  [OID_TIMESTAMP, (v) => parsePostgresTimestampAsInstant(v as string)],
  [OID_DATE, (v) => parsePostgresDate(v as string)],
  [OID_INT8, parseInt8],
  [OID_DATE_ARRAY, passthrough],
  [OID_TIME_ARRAY, passthrough],
  [OID_TIMESTAMP_ARRAY, passthrough],
  [OID_TIMESTAMPTZ_ARRAY, passthrough],
  [OID_TIMETZ_ARRAY, passthrough],
]);

export function makeGetTypeParser(pgTypes: {
  getTypeParser: (oid: number, format: "text" | "binary") => unknown;
}): (oid: number, format?: string) => PgParser {
  return function getTypeParser(oid: number, format?: string): PgParser {
    const fmt = format || "text";
    if (fmt === "text") {
      const parser = CONNECTION_PARSERS.get(oid);
      if (parser) return parser;
    }
    return pgTypes.getTypeParser(oid, fmt as "text" | "binary") as PgParser;
  };
}
