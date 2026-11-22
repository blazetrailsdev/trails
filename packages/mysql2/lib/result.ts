import mysql from "mysql2/promise";
import { BigDecimal, Enumerable, include, Rational, rtest, warn } from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime, Time } from "@blazetrails/date";
import {
  MYSQL2_MAX_TIME,
  MYSQL2_MIN_TIME,
  type Client,
  type Field,
  type QueryOptions,
} from "./client.js";
import { Error as Mysql2Error } from "./error.js";
import type { Statement } from "./statement.js";
import { Mysql2 } from "./mysql2.js";

const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(mysql.Types).map(([name, code]) => [code, name]),
);

const MYSQL2_MAX_BYTES_PER_CHAR = 3;
const ENUM_FLAG = 256;
const SET_FLAG = 2048;

type Row = unknown[] | Record<string, unknown>;

declare module "./mysql2.js" {
  interface Mysql2Namespace {
    Result: typeof Result;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Result {
  readonly fields: string[];
  serverFlags: {
    noGoodIndexUsed: boolean;
    noIndexUsed: boolean;
    queryWasSlow: boolean;
  } = { noGoodIndexUsed: false, noIndexUsed: false, queryWasSlow: false };
  /** @internal */
  stmtWrapper?: Statement;
  /** @internal */
  streamRows?: AsyncIterator<Row>;
  private rows: Row[];
  private fieldTypesCache: Array<string | null> | undefined;
  private isStreaming: boolean;
  private streamingComplete = false;
  private numberOfRows = 0;

  constructor(
    fields: string[],
    rows: Row[],
    private error?: Error,
    private client?: Client,
    private queryOptions: QueryOptions = {},
    private fieldPackets: mysql.FieldPacket[] = [],
  ) {
    this.fields = fields;
    this.rows = rows;
    this.isStreaming = queryOptions.stream === true;
  }

  count(): number {
    if (this.isStreaming) return this.numberOfRows;
    return this.rows.length;
  }

  get size(): number {
    return this.count();
  }

  fieldTypes(): Array<string | null> {
    this.fieldTypesCache ??= this.fieldPackets.map((field) => this.fetchFieldType(field));
    return this.fieldTypesCache;
  }

  private fetchFieldType(field: mysql.FieldPacket): string | null {
    const length = field.columnLength ?? 0;
    const decimals = field.decimals;
    const flags = Number(field.flags);
    const binary = field.characterSet === mysql.Charsets.BINARY;
    switch (TYPE_NAMES[field.type!]) {
      case "NULL":
        return "null";
      case "TINY":
        return `tinyint(${length})`;
      case "SHORT":
        return `smallint(${length})`;
      case "YEAR":
        return `year(${length})`;
      case "INT24":
        return `mediumint(${length})`;
      case "LONG":
        return `int(${length})`;
      case "LONGLONG":
        return `bigint(${length})`;
      case "FLOAT":
        return `float(${length},${decimals})`;
      case "DOUBLE":
        return `double(${length},${decimals})`;
      case "TIME":
        return "time";
      case "DATE":
      case "NEWDATE":
        return "date";
      case "DATETIME":
        return "datetime";
      case "TIMESTAMP":
        return "timestamp";
      case "DECIMAL":
      case "NEWDECIMAL": {
        const precision = length - (decimals > 0 ? 2 : 1);
        return `decimal(${precision},${decimals})`;
      }
      case "STRING":
        if (flags & ENUM_FLAG) return "enum";
        if (flags & SET_FLAG) return "set";
        if (binary) return `binary(${length})`;
        return `char(${Math.floor(length / MYSQL2_MAX_BYTES_PER_CHAR)})`;
      case "VAR_STRING":
        if (binary) return `varbinary(${length})`;
        return `varchar(${Math.floor(length / MYSQL2_MAX_BYTES_PER_CHAR)})`;
      case "VARCHAR":
        return `varchar(${Math.floor(length / MYSQL2_MAX_BYTES_PER_CHAR)})`;
      case "TINY_BLOB":
        return "tinyblob";
      case "BLOB":
        if (binary) {
          switch (length) {
            case 255:
              return "tinyblob";
            case 65535:
              return "blob";
            case 16777215:
              return "mediumblob";
            case 4294967295:
              return "longblob";
            default:
              return null;
          }
        }
        if (length === 255 * MYSQL2_MAX_BYTES_PER_CHAR) return "tinytext";
        if (length === 65535 * MYSQL2_MAX_BYTES_PER_CHAR) return "text";
        if (length === 16777215 * MYSQL2_MAX_BYTES_PER_CHAR) return "mediumtext";
        if (length === 4294967295) return "longtext";
        return `text(${length})`;
      case "MEDIUM_BLOB":
        return "mediumblob";
      case "LONG_BLOB":
        return "longblob";
      case "BIT":
        return `bit(${length})`;
      case "SET":
        return "set";
      case "ENUM":
        return "enum";
      case "GEOMETRY":
        return "geometry";
      case "JSON":
        return "json";
      default:
        return "unknown";
    }
  }

  each(
    opts: QueryOptions | ((row: Row) => unknown) = {},
    block?: (row: Row) => unknown,
  ): Row[] | Promise<Row[]> {
    if (typeof opts === "function") [opts, block] = [{}, opts];
    if (this.stmtWrapper?.closed) throw new Mysql2Error("Statement handle already closed");
    if (this.error) throw this.error;
    opts = { ...this.queryOptions, ...opts };
    let cacheRows = rtest(opts.cacheRows);
    const cast = rtest(opts.cast);
    if (this.isStreaming && cacheRows) warn(":cache_rows is ignored if :stream is true");
    if (this.stmtWrapper && !cacheRows && !this.isStreaming) {
      warn(":cache_rows is forced for prepared statements (if not streaming)");
      cacheRows = true;
    }
    if (this.stmtWrapper && !cast) warn(":cast is forced for prepared statements");
    const asArray = opts.as === "array";
    const asHash = opts.as != null && !asArray;
    const shape = (row: Row): Row => {
      if (asArray && !Array.isArray(row)) return this.fields.map((f) => row[f]);
      if (asHash && Array.isArray(row)) {
        return Object.fromEntries(this.fields.map((f, i) => [f, row[i]]));
      }
      return row;
    };
    const fetchRowFunc = (row: Row): Row => {
      const client = this.client!;
      client.INVALID_DATE = undefined;
      const val = this.stmtWrapper
        ? this.fetchRowStmt(row, opts)
        : this.fetchRow(row, client.typeCast(opts));
      const error = client.INVALID_DATE;
      client.INVALID_DATE = undefined;
      if (error) throw error;
      return shape(val);
    };
    if (this.isStreaming) return this._each(fetchRowFunc, block);
    let source = this.rows;
    if (this.client) {
      source = this.rows.map(fetchRowFunc);
      if (cacheRows) {
        this.rows = source;
        this.client = undefined;
      }
    } else {
      source = source.map(shape);
    }
    if (block) for (const row of source) block(row);
    return source;
  }

  private _each(fetchRowFunc: (row: Row) => Row, block?: (row: Row) => unknown): Promise<Row[]> {
    if (this.streamingComplete) {
      throw new Mysql2Error(
        "You have already fetched all the rows for this query and streaming is true. (to reiterate you must requery).",
      );
    }
    const client = this.client!;
    return (async () => {
      for (;;) {
        const next = await this.streamRows!.next().catch((e: unknown) =>
          client.raiseMysql2Error(e),
        );
        if (next.done) break;
        const row = fetchRowFunc(next.value);
        this.numberOfRows++;
        if (block) await block(row);
      }
      this.streamingComplete = true;
      client.freeResult(this);
      return this.rows;
    })();
  }

  private fetchRowStmt(row: Row, args: QueryOptions): Row {
    const castField = (val: unknown, i: number): unknown => {
      if (val === null) return null;
      const field = this.fieldPackets[i];
      switch (TYPE_NAMES[field.type!]) {
        case "TINY":
        case "BIT":
          if (rtest(args.castBooleans) && field.columnLength === 1) {
            return val instanceof Uint8Array ? val[0] !== 0 : val !== 0;
          }
          return val;
        case "LONGLONG":
          return Number.isSafeInteger(Number(val)) ? Number(val) : BigInt(val as string);
        case "DATE":
        case "NEWDATE": {
          const [year, month, day] = (val as string).split("-").map(Number);
          return new RubyDate(year, month, day).toDate();
        }
        case "TIME": {
          const [, hour, minute, second, part] = /^(\d+):(\d+):(\d+)(?:\.(\d+))?/
            .exec(val as string)!
            .map(Number);
          let time = Time[args.databaseTimezone!](2000, 1, 1, hour, minute, second, part || 0);
          if (args.applicationTimezone != null) {
            if (args.applicationTimezone === "local") {
              time = time.getlocal();
            } else {
              time = time.getutc();
            }
          }
          return time;
        }
        case "DATETIME":
        case "TIMESTAMP": {
          const [, year, month, day, hour, minute, second, part] =
            /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)(?:\.(\d+))?/.exec(val as string)!.map(Number);
          const seconds =
            year * 31557600 + month * 2592000 + day * 86400 + hour * 3600 + minute * 60 + second;
          if (seconds < MYSQL2_MIN_TIME || seconds > MYSQL2_MAX_TIME) {
            let offset: number | Rational = 0;
            if (args.databaseTimezone === "local") offset = Mysql2.Client["localOffset"]();
            let dt = new DateTime(year, month, day, hour, minute, second, offset);
            if (args.applicationTimezone != null) {
              if (args.applicationTimezone === "local") {
                dt = dt.newOffset(Mysql2.Client["localOffset"]());
              } else {
                dt = dt.newOffset(0);
              }
            }
            return dt;
          }
          let time = Time[args.databaseTimezone!](
            year,
            month,
            day,
            hour,
            minute,
            second,
            part || 0,
          );
          if (args.applicationTimezone != null) {
            if (args.applicationTimezone === "local") {
              time = time.getlocal();
            } else {
              time = time.getutc();
            }
          }
          return time;
        }
        case "DECIMAL":
        case "NEWDECIMAL":
          return new BigDecimal(val as string);
        default:
          return val;
      }
    };
    if (Array.isArray(row)) return row.map(castField);
    return Object.fromEntries(this.fields.map((name, i) => [name, castField(row[name], i)]));
  }

  private fetchRow(
    row: unknown[] | Record<string, unknown>,
    typeCast: ReturnType<Client["typeCast"]>,
  ): unknown[] | Record<string, unknown> {
    const castField = (value: unknown, i: number): unknown => {
      const packet = this.fieldPackets[i];
      const raw = value as string | null;
      const text = (encoding: string = packet.encoding ?? "utf8") => {
        if (raw === null || packet.encoding !== "binary" || encoding === "binary") return raw;
        if (Buffer.isEncoding(encoding)) return Buffer.from(raw, "latin1").toString(encoding);
        return new TextDecoder(encoding).decode(Buffer.from(raw, "latin1"));
      };
      const bytes = () => (raw === null ? null : Buffer.from(raw, "latin1"));
      const type = TYPE_NAMES[packet.type!];
      const field: Field = {
        type,
        name: packet.name,
        length: packet.columnLength,
        string: text,
        buffer: bytes,
      };
      return typeCast(field, () => {
        if (raw === null) return null;
        switch (type) {
          case "TINY":
          case "SHORT":
          case "LONG":
          case "INT24":
          case "YEAR":
          case "FLOAT":
          case "DOUBLE":
            return Number(text("ascii"));
          case "DECIMAL":
          case "NEWDECIMAL":
          case "DATE":
          case "DATETIME":
          case "TIMESTAMP":
          case "TIME":
            return text("ascii");
          case "LONGLONG": {
            const value = text("ascii")!;
            return Number.isSafeInteger(Number(value)) ? Number(value) : value;
          }
          default:
            return packet.characterSet === mysql.Charsets.BINARY ? bytes() : raw;
        }
      });
    };
    if (Array.isArray(row)) return row.map(castField);
    return Object.fromEntries(this.fields.map((name, i) => [name, castField(row[name], i)]));
  }

  free(): void {
    this.rows = [];
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
export interface Result {
  toA(): Row[];
  first(): Row | null;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

include(Result, Enumerable);

Mysql2.Result = Result;
