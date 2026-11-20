import pg from "pg";
import {
  ConnectionBad,
  ERROR_CLASSES,
  Error as PGError,
  ServerError,
  UnableToSend,
} from "../exceptions.js";
import { Result } from "../result.js";
import type { Connection } from "../connection.js";

const OID_BYTEA = 17;
const OID_BYTEA_ARRAY = 1001;

export type Protocol = pg.Connection & {
  connect(portOrPath: string | number, host?: string): void;
  cancel(processID: number, secretKey: number): void;
};
export type Client = Omit<pg.Client, "connection"> & {
  connection?: Protocol;
  processID?: number | null;
  secretKey?: number | null;
  _activeQuery?: unknown;
  _ending?: boolean;
  _ended?: boolean;
  _queryable?: boolean;
  _connectionError?: boolean;
};
export type Notification = pg.Notification;

type QueryConfig = string | Record<string, unknown> | null;

export function newClient(connParams: Record<string, unknown>): Client {
  return new pg.Client(_clientConfig(connParams)) as Client;
}

export function submit(
  conn: Connection,
  config: QueryConfig | object,
): Promise<pg.QueryResult | pg.QueryResult[]> {
  try {
    return Promise.resolve(
      (conn.client.query as unknown as (config: unknown) => unknown)(config),
    ).catch((error: unknown) => {
      throw pgError(conn, error);
    }) as Promise<pg.QueryResult>;
  } catch (error) {
    return Promise.reject(pgError(conn, error));
  }
}

export async function execute(
  conn: Connection,
  text: string | null | undefined,
  params: unknown[] | null = null,
  name: string | null = null,
): Promise<Result> {
  const config =
    text === null && params == null
      ? null
      : {
          ...(name == null ? {} : { name }),
          text,
          ...(params == null ? {} : { values: params.map((v) => param(conn, v)) }),
          rowMode: "array",
          types: types(conn),
        };
  return result(await submit(conn, config));
}

export function emptyResult(error: unknown = null): Result {
  return new Result(
    { command: "", rowCount: null, oid: 0, fields: [], rows: [] } as unknown as pg.QueryResult,
    error as never,
  );
}

export function listen(conn: Connection, client: Client): void {
  const connection = client.connection;
  if (typeof connection?.on === "function") {
    connection.on("readyForQuery", (message: { status?: string }) => {
      if (typeof message?.status === "string") conn.readyForQuery = message.status;
    });
    connection.on(
      "parameterStatus",
      (message: { parameterName: string; parameterValue: string }) => {
        conn.parameterStatuses[message.parameterName] = message.parameterValue;
        if (message.parameterName === "server_version") {
          const match = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?/.exec(message.parameterValue);
          const cnt = match == null ? 0 : match.slice(1).filter((part) => part != null).length;
          const [vmaj, vmin, vrev] = (match ?? []).slice(1).map(Number);
          if (cnt == 3) {
            conn.sversion = (100 * vmaj + vmin) * 100 + vrev;
          } else if (cnt == 2) {
            if (vmaj >= 10) conn.sversion = 100 * 100 * vmaj + vmin;
            else conn.sversion = (100 * vmaj + vmin) * 100;
          } else if (cnt == 1) {
            conn.sversion = 100 * 100 * vmaj;
          } else {
            conn.sversion = 0;
          }
        }
      },
    );
    connection.on("errorMessage", () => {
      if (conn.readyForQuery === "T") conn.readyForQuery = "E";
    });
  }
}

function types(conn: Connection): { getTypeParser(oid: number, format?: string): unknown } {
  return {
    getTypeParser(oid: number, format?: string): unknown {
      if ((oid === OID_BYTEA || oid === OID_BYTEA_ARRAY) && format !== "binary") {
        return (value: unknown) => value;
      }
      const coder = format !== "binary" && conn.typeMapForResults._lookupOid(0, oid);
      if (coder) return (value: string) => coder.decode(value);
      return conn.client.getTypeParser(oid, format as "text");
    },
  };
}

type BinaryParam = { value?: unknown; format?: unknown };

function param(conn: Connection, value: unknown): unknown {
  const coder = conn.typeMapForQueries?._lookupKlass(value);
  if (coder != null) return coder.encode(value);
  if (value instanceof Number) return value.valueOf();
  if (typeof value === "object" && value !== null && (value as BinaryParam).format === 1) {
    const bytes = (value as BinaryParam).value;
    if (bytes instanceof Uint8Array && Object.keys(value).length === 2) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
  }
  return value;
}

export function pgError(conn: Connection, error: unknown, klass?: typeof PGError): unknown {
  if (
    !(error instanceof Error) ||
    error instanceof PGError ||
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  ) {
    return error;
  }
  const { _ending, _ended, _queryable, _connectionError } = conn.client;
  let wrapped: PGError;
  if (klass != null) {
    wrapped = new klass(`${error.message}\n`, { connection: conn });
  } else if (error instanceof pg.DatabaseError) {
    wrapped = new (lookupErrorClass(error.code ?? null))(error.message, {
      connection: conn,
      result: emptyResult(error),
    });
  } else if (conn.bad) {
    wrapped = new ConnectionBad("no connection to the server\n", { connection: conn });
  } else if (_ending === true) {
    wrapped = new ConnectionBad("connection is closed", { connection: conn });
  } else if (_ended === true || _queryable === false || _connectionError === true) {
    wrapped = new ConnectionBad(`${error.message}\n`, { connection: conn });
  } else {
    wrapped = new UnableToSend(`${error.message}\n`, { connection: conn });
  }
  wrapped.cause = error;
  if (wrapped instanceof ConnectionBad || (error as { severity?: string }).severity === "FATAL") {
    conn.bad = true;
  }
  return wrapped;
}

function lookupErrorClass(sqlstate: string | null): typeof PGError {
  let klass: typeof PGError | undefined;
  if (sqlstate != null) {
    klass = Object.hasOwn(ERROR_CLASSES, sqlstate) ? ERROR_CLASSES[sqlstate] : undefined;
    if (klass == null) {
      klass = Object.hasOwn(ERROR_CLASSES, sqlstate.slice(0, 2))
        ? ERROR_CLASSES[sqlstate.slice(0, 2)]
        : undefined;
      if (klass == null) {
        klass = ServerError;
      }
    }
  } else {
    klass = UnableToSend;
  }
  return klass;
}

function result(raw: pg.QueryResult | pg.QueryResult[]): Result {
  return new Result(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

const STRING_OIDS = new Set([
  114, 600, 718, 1017, 1082, 1114, 1115, 1182, 1183, 1184, 1185, 1186, 1187, 1270, 3802,
]);

function pgTypeParser(oid: number, format?: string): unknown {
  if (format === "binary") return pg.types.getTypeParser(oid, "binary");
  if (STRING_OIDS.has(oid)) return (v: unknown) => v;
  return pg.types.getTypeParser(oid, "text");
}

/** @noRailsEquivalent PERMANENT */
export function _clientConfig(connParams: Record<string, unknown>): pg.ClientConfig {
  const seconds = (value: unknown): number | undefined =>
    value == null ? undefined : Number(value) * 1000;
  const sslmode = connParams.sslmode as string | undefined;
  let ssl: pg.ClientConfig["ssl"];
  if (sslmode === "disable") ssl = false;
  else if (sslmode === "require" || (sslmode == null && connParams.requiressl != null)) {
    ssl = { rejectUnauthorized: false };
  } else if (sslmode === "verify-ca" || sslmode === "verify-full") ssl = true;
  return {
    user: connParams.user as string | undefined,
    database: connParams.dbname as string | undefined,
    password: connParams.password as string | undefined,
    host: connParams.host as string | undefined,
    port: connParams.port == null ? undefined : Number(connParams.port),
    options: connParams.options as string | undefined,
    client_encoding: connParams.clientEncoding as string | undefined,
    application_name: connParams.applicationName as string | undefined,
    fallback_application_name: connParams.fallbackApplicationName as string | undefined,
    connectionTimeoutMillis: seconds(connParams.connectTimeout),
    keepAlive: connParams.keepalives == null ? undefined : String(connParams.keepalives) !== "0",
    keepAliveInitialDelayMillis: seconds(connParams.keepalivesIdle),
    ...(connParams.replication == null ? {} : { replication: connParams.replication }),
    ssl,
    types: { getTypeParser: pgTypeParser as pg.CustomTypesConfig["getTypeParser"] },
  };
}
