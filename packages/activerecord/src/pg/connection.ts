import type pg from "pg";
import { PGResult } from "../connection-adapters/postgresql/pg-result.js";

export interface PGConnection extends pg.Client {
  prepare(stmtName: string, sql: string): Promise<void>;
  execPrepared(stmtName: string, params: unknown[]): Promise<PGResult>;
  asyncExec(sql: string | null): Promise<PGResult>;
  execParams(sql: string | null, params: unknown[]): Promise<PGResult>;
  unescapeBytea(value: string | Uint8Array): Buffer;
  transactionStatus(): number;
  status(): number;
  cancel(): Promise<string | null>;
  block(): Promise<void>;
  socketIo(): { reopen(path: string): void } | null;
}

type QueryConfig = string | Record<string, unknown> | null;
type Query = (config: QueryConfig) => Promise<pg.QueryResult | pg.QueryResult[]>;

const OID_BYTEA = 17;
const OID_BYTEA_ARRAY = 1001;

function types(client: pg.Client): { getTypeParser(oid: number, format?: string): unknown } {
  return {
    getTypeParser(oid: number, format?: string): unknown {
      if ((oid === OID_BYTEA || oid === OID_BYTEA_ARRAY) && format !== "binary") {
        return (value: unknown) => value;
      }
      return client.getTypeParser(oid, format as "text");
    },
  };
}

const PREPARED = new WeakMap<object, Map<string, string>>();
const READY_FOR_QUERY = new WeakMap<object, string>();

const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;

const CONNECTION_OK = 0;
const CONNECTION_BAD = 1;

type Protocol = pg.Connection & {
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

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
export function status(this: pg.Client): number {
  const { _ending, _ended } = this as Client;
  return _ending === true || _ended === true ? CONNECTION_BAD : CONNECTION_OK;
}

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
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
      handleError: reject,
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
): Promise<PGResult> {
  const text = PREPARED.get(this)?.get(stmtName);
  return result(
    await (this.query as unknown as Query)({
      name: stmtName,
      text,
      values: params,
      rowMode: "array",
      types: types(this),
    }),
  );
}

async function asyncExec(this: pg.Client, sql: string | null): Promise<PGResult> {
  return result(
    await (this.query as unknown as Query)(
      sql != null ? { text: sql, rowMode: "array", types: types(this) } : sql,
    ),
  );
}

async function execParams(
  this: pg.Client,
  sql: string | null,
  params: unknown[],
): Promise<PGResult> {
  return result(
    await (this.query as unknown as Query)({
      text: sql,
      values: params,
      rowMode: "array",
      types: types(this),
    }),
  );
}

function result(raw: pg.QueryResult | pg.QueryResult[]): PGResult {
  return new PGResult(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
export function escapeBytea(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
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

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
export function block(this: pg.Client): Promise<void> {
  if ((this as Client)._activeQuery == null) return Promise.resolve();
  const connection = (this as Client).connection;
  if (connection == null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const settle = (): void => {
      connection.off("readyForQuery", settle);
      connection.off("commandComplete", settle);
      connection.off("errorMessage", settle);
      connection.off("end", settle);
      connection.off("error", settle);
      resolve();
    };
    connection.on("readyForQuery", settle);
    connection.on("commandComplete", settle);
    connection.on("errorMessage", settle);
    connection.on("end", settle);
    connection.on("error", settle);
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

/** @noRailsEquivalent CONVERGEABLE ruby-extractor-reads-c-defined-gem-methods */
export function pgConnection<T extends object>(client: T): T & PGConnection {
  if (!READY_FOR_QUERY.has(client)) {
    READY_FOR_QUERY.set(client, "I");
    const connection = (client as unknown as Client).connection;
    if (typeof connection?.on === "function") {
      connection.on("readyForQuery", (message: { status?: string }) => {
        if (typeof message?.status === "string") READY_FOR_QUERY.set(client, message.status);
      });
      connection.on("errorMessage", () => {
        if (READY_FOR_QUERY.get(client) === "T") READY_FOR_QUERY.set(client, "E");
      });
    }
  }
  return Object.assign(client, {
    prepare,
    execPrepared,
    asyncExec,
    execParams,
    unescapeBytea,
    socketIo,
    transactionStatus,
    status,
    cancel,
    block,
  }) as unknown as T & PGConnection;
}
