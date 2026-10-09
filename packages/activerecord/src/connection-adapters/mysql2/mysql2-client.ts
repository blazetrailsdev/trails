import type mysql from "mysql2/promise";
import { Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { quotedDate } from "../abstract/quoting.js";
import { defaultTimezone } from "../../active-record.js";

interface QueryOptions {
  as?: "array";
  databaseTimezone?: "utc" | "local";
}

type Native = [unknown, mysql.FieldPacket[] | undefined];

export interface Mysql2Result {
  readonly fields: string[];
  readonly size: number;
  toA(): unknown[][];
  free(): void;
}

export interface Mysql2Statement {
  affectedRows: number;
  execute(...args: unknown[]): Promise<Mysql2Result | null>;
  close(): void;
}

const ERRORS = new WeakSet<object>();

function driverError(e: unknown): never {
  const { code, fatal } = (e ?? {}) as { code?: unknown; fatal?: unknown };
  if (e instanceof Error && (typeof code === "string" || fatal === true)) ERRORS.add(e);
  throw e;
}

class Result implements Mysql2Result {
  readonly fields: string[];
  private rows: unknown[][];

  constructor(fields: string[], rows: unknown[][]) {
    this.fields = fields;
    this.rows = rows;
  }

  get size(): number {
    return this.rows.length;
  }

  toA(): unknown[][] {
    return this.rows;
  }

  free(): void {
    this.rows = [];
  }
}

class Statement implements Mysql2Statement {
  affectedRows = 0;

  constructor(
    private client: Mysql2Client,
    private sql: string,
  ) {}

  async execute(...args: unknown[]): Promise<Mysql2Result | null> {
    const result = storeResult(
      this.client,
      (await this.client
        .execute(options(this.client, this.sql) as never, args as never)
        .catch(driverError)) as Native,
    );
    this.affectedRows = result?.size ?? this.client.affectedRows;
    return result;
  }

  close(): void {
    this.client.unprepare(options(this.client, this.sql) as never);
  }
}

export type Mysql2Client = Omit<mysql.Connection, "query" | "prepare"> & {
  automaticClose: boolean;
  queryOptions: QueryOptions;
  readTimeout?: number | null;
  affectedRows: number;
  lastId?: number;
  query(sql: string): Promise<Mysql2Result | null>;
  prepare(sql: string): Mysql2Statement;
  abandonResultsBang(): void;
  setServerOption(value: number): Promise<true>;
};

function options(client: Mysql2Client, sql: string): Record<string, unknown> {
  return client.readTimeout != null
    ? { sql, rowsAsArray: true, timeout: client.readTimeout * 1000 }
    : { sql, rowsAsArray: true };
}

function storeResult(client: Mysql2Client, [rawResult, rawFields]: Native): Mysql2Result | null {
  let result = rawResult as unknown[][] | mysql.ResultSetHeader;
  let fields = rawFields;
  if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
    result = (rawResult as unknown[])[0] as unknown[][];
    fields = rawFields[0] as mysql.FieldPacket[];
  } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
    result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
  }
  if (Array.isArray(result)) {
    return new Result(
      (fields ?? []).map((field) => field.name),
      result,
    );
  }
  client.affectedRows = result.affectedRows ?? 0;
  if (result.insertId !== undefined) client.lastId = result.insertId;
  return null;
}

const COM_SET_OPTION = 0x1b;

type Protocol = {
  clientEncoding: string;
  addCommand(command: object): void;
  writePacket(packet: object): void;
  _resetSequenceId(): void;
};
type Packet = { isError(): boolean; asError(encoding: string): Error };

function setServerOption(this: Mysql2Client, value: number): Promise<true> {
  return new Promise((resolve, reject) => {
    (this as unknown as { connection: Protocol }).connection.addCommand({
      onResult: reject,
      execute(packet: Packet | undefined, connection: Protocol): boolean {
        if (packet === undefined) {
          const buffer = Buffer.from([3, 0, 0, 0, COM_SET_OPTION, value, 0]);
          connection._resetSequenceId();
          connection.writePacket({
            buffer,
            length: () => buffer.length,
            writeHeader: (sequenceId: number) => buffer.writeUInt8(sequenceId, 3),
          });
          return false;
        }
        if (packet.isError()) reject(packet.asError(connection.clientEncoding));
        else resolve(true);
        return true;
      },
    });
  });
}

function prepare(this: Mysql2Client, sql: string): Mysql2Statement {
  return new Statement(this, sql);
}

function abandonResultsBang(): void {}

type Field = { type: string; string: () => string | null };
type TypeCast = (field: Field, next: () => unknown) => unknown;

function cast(queryOptions: QueryOptions, field: Field, next: () => unknown): unknown {
  switch (field.type) {
    case "TIMESTAMP":
    case "TIMESTAMP2":
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens =
        /^(\d{1,4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?/.exec(raw);
      if (!tokens) return null;
      const [year, month, day, hour, min, sec] = tokens.slice(1, 7).map(Number);
      if (year + month + day + hour + min + sec === 0) return null;
      const msec = Number((tokens[7] ?? "").padEnd(6, "0"));
      const dbTimezone =
        field.type.startsWith("TIMESTAMP") || queryOptions.databaseTimezone === "utc"
          ? "utc"
          : "local";
      const val = Time[dbTimezone](year, month, day, hour, min, sec, msec);
      return defaultTimezone() === "utc" ? val.getutc() : val.getlocal();
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens = /^(\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(raw);
      if (!tokens) return null;
      const [year, month, day] = tokens.slice(1, 4).map(Number);
      if (year + month + day === 0) return null;
      return new RubyDate(year, month, day).toDate();
    }
    case "DECIMAL":
    case "NEWDECIMAL": {
      const raw = next();
      if (typeof raw !== "string") return raw;
      if (raw.includes(".")) return new BigDecimal(raw);
      return Number.isSafeInteger(Number(raw)) ? Number(raw) : BigInt(raw);
    }
    case "LONGLONG": {
      const raw = next();
      return typeof raw === "string" ? BigInt(raw) : raw;
    }
    default:
      return next();
  }
}

type Execute = (sql: unknown, values?: unknown[]) => unknown;

function bind(value: unknown): unknown {
  if (value instanceof Number) return value.valueOf();
  if (
    value instanceof TimeWithZone ||
    value instanceof Time ||
    value instanceof Temporal.PlainDate
  ) {
    return quotedDate.call({ defaultTimezone: defaultTimezone() }, value);
  }
  return value;
}

const QUERY_OPTIONS = new WeakSet<object>();

const AUTOMATIC_CLOSE = new WeakMap<object, boolean>();

const automaticClose: PropertyDescriptor = {
  configurable: true,
  get(this: object): boolean {
    return AUTOMATIC_CLOSE.get(this) ?? true;
  },
  set(
    this: { connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } } },
    value: boolean,
  ) {
    AUTOMATIC_CLOSE.set(this, value);
    if (value) return;
    const stream = this.connection?.stream;
    stream?.removeAllListeners?.();
    stream?.unref?.();
  },
};

/** @noRailsEquivalent CONVERGEABLE mysql2-client-scores-against-the-vendored-mysql2-gem */
export function mysql2Client<T extends object>(client: T): T & Mysql2Client {
  if (!QUERY_OPTIONS.has(client)) {
    QUERY_OPTIONS.add(client);
    const queryOptions: QueryOptions = {};
    const execute = (client as { execute?: unknown }).execute;
    if (typeof execute === "function") {
      (client as { execute?: Execute }).execute = (sql, values) =>
        (execute as Execute).call(client, sql, values?.map(bind));
    }
    const native = (client as { query?: (options: object) => Promise<Native> }).query;
    const query = async function (this: Mysql2Client, sql: string) {
      return storeResult(this, await native!.call(this, options(this, sql)).catch(driverError));
    };
    for (const [name, value] of Object.entries({
      queryOptions,
      affectedRows: 0,
      query,
      prepare,
      abandonResultsBang,
      setServerOption,
    })) {
      Object.defineProperty(client, name, { configurable: true, writable: true, value });
    }
    const config = (client as { config?: { typeCast?: unknown } }).config;
    if (config) {
      const typeCast = config.typeCast;
      config.typeCast = (field: Field, next: () => unknown) =>
        cast(
          queryOptions,
          field,
          typeof typeCast === "function" ? () => (typeCast as TypeCast)(field, next) : next,
        );
    }
  }
  return Object.defineProperty(client, "automaticClose", automaticClose) as T & Mysql2Client;
}

export const Mysql2 = {
  Error: class {
    static [Symbol.hasInstance](e: unknown): boolean {
      return typeof e === "object" && e !== null && ERRORS.has(e);
    }
  },
  Client: {
    MULTI_STATEMENTS: 0x10000,
    OPTION_MULTI_STATEMENTS_ON: 0,
    OPTION_MULTI_STATEMENTS_OFF: 1,
  },
};
