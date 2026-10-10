import type pg from "pg";
import { PGTypeMapByOid } from "../connection-adapters/postgresql/pg-text-decoder.js";
import { connectionBad, pgError } from "./exceptions.js";
import { PG } from "./pg.js";

export interface PGConnection extends pg.Client {
  prepare(stmtName: string, sql: string): Promise<void>;
  execPrepared(stmtName: string, params: unknown[]): Promise<PG.Result>;
  asyncExec(sql: string | null): Promise<PG.Result>;
  execParams(sql: string | null, params: unknown[]): Promise<PG.Result>;
  unescapeBytea(value: string | Uint8Array): Buffer;
  transactionStatus(): number;
  status(): number;
  reset(): Promise<void>;
  cancel(): Promise<string | null>;
  asyncCancel(): Promise<string | null>;
  block(timeout?: number | null): Promise<boolean>;
  socketIo(): { reopen(path: string): void } | null;
  typeMapForResults: PGTypeMapByOid;
}

type QueryConfig = string | Record<string, unknown> | null;
type Query = (config: QueryConfig) => Promise<pg.QueryResult | pg.QueryResult[]>;

const OID_BYTEA = 17;
const OID_BYTEA_ARRAY = 1001;

const TYPE_MAP_FOR_RESULTS = new WeakMap<object, PGTypeMapByOid>();

const typeMapForResults: PropertyDescriptor = {
  configurable: true,
  get(this: object): PGTypeMapByOid {
    let map = TYPE_MAP_FOR_RESULTS.get(this);
    if (!map) TYPE_MAP_FOR_RESULTS.set(this, (map = new PGTypeMapByOid()));
    return map;
  },
  set(this: object, map: PGTypeMapByOid) {
    TYPE_MAP_FOR_RESULTS.set(this, map);
  },
};

function types(client: pg.Client): { getTypeParser(oid: number, format?: string): unknown } {
  return {
    getTypeParser(oid: number, format?: string): unknown {
      if ((oid === OID_BYTEA || oid === OID_BYTEA_ARRAY) && format !== "binary") {
        return (value: unknown) => value;
      }
      const coder = format !== "binary" && TYPE_MAP_FOR_RESULTS.get(client)?.coders.get(oid);
      if (coder) return (value: string) => coder.decode(value);
      return client.getTypeParser(oid, format as "text");
    },
  };
}

const STREAM = new WeakMap<object, unknown>();
const PREPARED = new WeakMap<object, Map<string, string>>();
const READY_FOR_QUERY = new WeakMap<object, string>();

const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;

const CONNECTION_OK = 0;
const CONNECTION_BAD = 1;

type Protocol = pg.Connection & {
  ssl?: unknown;
  _keepAlive?: unknown;
  _keepAliveInitialDelayMillis?: unknown;
  connect(portOrPath: string | number, host?: string): void;
  cancel(processID: number, secretKey: number): void;
};
type Client = Omit<pg.Client, "connection"> & {
  connection?: Protocol;
  processID?: number | null;
  secretKey?: number | null;
  _activeQuery?: unknown;
  _ending?: boolean;
  _ended?: boolean;
};

export function status(this: pg.Client): number {
  const { _ending, _ended } = this as Client;
  return _ending === true || _ended === true ? CONNECTION_BAD : CONNECTION_OK;
}

/**
 * @inventedArm try — CONVERGEABLE sqlite3-pg-and-load-schema-driver-shaped-arms-left-after-the-top-level-pass
 * @inventedArm rescue — CONVERGEABLE sqlite3-pg-and-load-schema-driver-shaped-arms-left-after-the-top-level-pass
 * @inventedArm throw — CONVERGEABLE sqlite3-pg-and-load-schema-driver-shaped-arms-left-after-the-top-level-pass
 */
export async function reset(this: pg.Client): Promise<void> {
  try {
    await this.end();
    const { connection } = this as Client;
    Object.assign(this, {
      connection: new (connection!.constructor as new (config: object) => Protocol)({
        stream: STREAM.get(this),
        ssl: connection!.ssl,
        keepAlive: connection!._keepAlive,
        keepAliveInitialDelayMillis: connection!._keepAliveInitialDelayMillis,
      }),
      _ending: false,
      _ended: false,
      _connecting: false,
      _connected: false,
      _connectionError: false,
      _queryable: true,
      _activeQuery: null,
      _queryQueue: [],
      processID: null,
      secretKey: null,
    });
    PREPARED.delete(this);
    READY_FOR_QUERY.set(this, "I");
    readyForQuery(this);
    await this.connect();
  } catch (error) {
    throw connectionBad(error);
  }
}

function readyForQuery(client: object): void {
  const connection = (client as Client).connection;
  if (typeof connection?.on === "function") {
    connection.on("readyForQuery", (message: { status?: string }) => {
      if (typeof message?.status === "string") READY_FOR_QUERY.set(client, message.status);
    });
    connection.on("errorMessage", () => {
      if (READY_FOR_QUERY.get(client) === "T") READY_FOR_QUERY.set(client, "E");
    });
  }
}

export function transactionStatus(this: pg.Client): number {
  if ((this as Client)._activeQuery != null) return PQTRANS_ACTIVE;
  switch (READY_FOR_QUERY.get(this)) {
    case "T":
      return PQTRANS_INTRANS;
    case "E":
      return PQTRANS_INERROR;
    default:
      return PQTRANS_IDLE;
  }
}

function prepare(this: pg.Client, stmtName: string, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const submittable = {
      name: stmtName,
      text: sql,
      submit(connection: { parse(q: object): void; sync(): void }): null {
        connection.parse({ name: stmtName, text: sql });
        connection.sync();
        return null;
      },
      handleError: (error: unknown) => reject(pgError(error)),
      handleReadyForQuery: () => {
        let prepared = PREPARED.get(this);
        if (!prepared) PREPARED.set(this, (prepared = new Map()));
        prepared.set(stmtName, sql);
        resolve();
      },
    };
    (this.query as unknown as (s: object) => unknown)(submittable);
  });
}

async function execPrepared(
  this: pg.Client,
  stmtName: string,
  params: unknown[],
): Promise<PG.Result> {
  const text = PREPARED.get(this)?.get(stmtName);
  return result(
    await (this.query as unknown as Query)({
      name: stmtName,
      text,
      values: params.map((value) => (value instanceof Number ? value.valueOf() : value)),
      rowMode: "array",
      types: types(this),
    }).catch(raise),
  );
}

async function asyncExec(this: pg.Client, sql: string | null): Promise<PG.Result> {
  return result(
    await (this.query as unknown as Query)(
      sql != null ? { text: sql, rowMode: "array", types: types(this) } : sql,
    ).catch(raise),
  );
}

async function execParams(
  this: pg.Client,
  sql: string | null,
  params: unknown[],
): Promise<PG.Result> {
  return result(
    await (this.query as unknown as Query)({
      text: sql,
      values: params.map((value) => (value instanceof Number ? value.valueOf() : value)),
      rowMode: "array",
      types: types(this),
    }).catch(raise),
  );
}

function query(native: (...args: unknown[]) => unknown) {
  return function (this: pg.Client, ...args: unknown[]): unknown {
    const pending = native.apply(this, args) as { catch?: unknown } | null | undefined;
    if (typeof pending?.catch !== "function") return pending;
    return (pending as Promise<unknown>).catch(raise);
  };
}

function raise(error: unknown): never {
  throw pgError(error);
}

function result(raw: pg.QueryResult | pg.QueryResult[]): PG.Result {
  return new PG.Result(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

export function escapeBytea(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

export function unescapeBytea(value: string | Uint8Array): Buffer {
  if (typeof value !== "string") value = Buffer.from(value).toString("latin1");
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");

  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\") {
      const next = value[i + 1];
      if (next === "\\") {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      const octal = value.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        const byte = parseInt(octal, 8);
        if (byte <= 0o377) {
          bytes.push(byte);
          i += 3;
          continue;
        }
      }
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes);
}

function socketIo(this: pg.Client): { reopen(path: string): void } | null {
  const stream = (
    this as unknown as {
      connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } };
    }
  ).connection?.stream;
  if (!stream) return null;
  return {
    reopen(_path: string): void {
      stream.removeAllListeners?.();
      stream.unref?.();
    },
  };
}

export function block(this: pg.Client, timeout: number | null = null): Promise<boolean> {
  if ((this as Client)._activeQuery == null) return Promise.resolve(true);
  const connection = (this as Client).connection;
  if (connection == null) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const events = ["readyForQuery", "commandComplete", "errorMessage", "end", "error"];
    const done = (ret: boolean): void => {
      clearTimeout(timer);
      for (const event of events) connection.off(event, settle);
      resolve(ret);
    };
    const settle = (): void => done(true);
    const timer = timeout == null ? undefined : setTimeout(() => done(false), timeout * 1000);
    for (const event of events) connection.on(event, settle);
  });
}

/**
 * @missingRailsArgs connect — PERMANENT
 * @missingRailsArgs new — PERMANENT
 */
export async function cancel(this: pg.Client): Promise<string | null> {
  const { processID: bePid, secretKey: beKey, connection } = this as Client;
  return new Promise<string | null>((resolve) => {
    const cl = new (connection!.constructor as new () => Protocol)();
    cl.on("error", (err: unknown) => resolve(String(err)));
    cl.on("end", () => resolve(null));
    cl.once("connect", () => {
      cl.cancel(bePid!, beKey!);
    });
    const { host, port } = this;
    if (host?.startsWith("/")) {
      cl.connect(`${host}/.s.PGSQL.${port}`);
    } else {
      cl.connect(port, host);
    }
  });
}

export const asyncCancel = cancel;

export function pgConnection<T extends object>(
  client: T,
  stream?: pg.ClientConfig["stream"],
): T & PGConnection {
  if (stream !== undefined) STREAM.set(client, stream);
  if (!READY_FOR_QUERY.has(client)) {
    READY_FOR_QUERY.set(client, "I");
    const native = (client as { query?: unknown }).query;
    if (typeof native === "function") {
      (client as { query?: unknown }).query = query(native as (...args: unknown[]) => unknown);
    }
    readyForQuery(client);
    const on = (client as { on?: unknown }).on;
    if (typeof on === "function") on.call(client, "error", () => {});
  }
  return Object.defineProperty(
    Object.assign(client, {
      prepare,
      execPrepared,
      asyncExec,
      execParams,
      unescapeBytea,
      socketIo,
      transactionStatus,
      status,
      reset,
      cancel,
      asyncCancel,
      block,
    }),
    "typeMapForResults",
    typeMapForResults,
  ) as unknown as T & PGConnection;
}
