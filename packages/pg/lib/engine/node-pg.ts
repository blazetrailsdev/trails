import pg from "pg";
import { ConnectionBad, Error as PGError, lookupErrorClass, UnableToSend } from "../exceptions.js";
import { Result } from "../result.js";
import type { Connection } from "../connection.js";
import type { TypeMap } from "../type-map.js";
import { Constants } from "../pg.js";

export type Protocol = pg.Connection & {
  connect(portOrPath: string | number, host?: string): void;
  cancel(processID: number, secretKey: number): void;
  parse(query: object): void;
  bind(config: object): void;
  describe(msg: object): void;
  execute(config: object): void;
};

type NativeResult = pg.QueryResult & {
  addFields(fields: pg.FieldDef[]): void;
  addRow(row: unknown[]): void;
  parseRow(rowData: unknown[]): unknown[];
  addCommandComplete(msg: object): void;
};
type NativeResultClass = new (rowMode: string, types: unknown) => NativeResult;
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
  return new Result({ command: "", rowCount: null, oid: 0, fields: [], rows: [] }, error as never);
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
      const coder = format !== "binary" && conn.typeMapForResults._lookupOid(0, oid);
      if (coder) return (value: string) => coder.decode(value);
      return (value: unknown) => value;
    },
  };
}

type BinaryParam = { value?: unknown; format?: unknown };

function param(
  conn: Connection,
  value: unknown,
  typemap: TypeMap = conn.typeMapForQueries,
): unknown {
  const coder = typemap._lookupKlass(value);
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

function result(raw: pg.QueryResult | pg.QueryResult[]): Result {
  return new Result(Array.isArray(raw) ? raw[raw.length - 1] : raw);
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
  };
}

export type ProtocolWrite = (connection: Protocol) => void;

export interface PgconnSubmittable {
  submitted: boolean;
  writes: ProtocolWrite[];
  submit(connection: Protocol): null;
}

export function dispatch(conn: Connection, write: ProtocolWrite, cmds: ("query" | "sync")[]): void {
  conn._cmdQueue.push(...cmds);
  const current = conn._submittable;
  if (current?.submitted || (current == null && cmds.length === 0)) {
    write(conn.client.connection!);
    return;
  }
  if (current != null) {
    current.writes.push(write);
    return;
  }
  const client = conn.client;
  let native = new (pg.Result as unknown as NativeResultClass)("array", types(conn));
  const deliver = (res: Result | null): void => {
    if (res != null) res._connection = conn;
    conn._results.push(res);
    for (const waiter of [...conn._resultWaiters]) waiter();
  };
  const pipelined = (): boolean => conn._pipelineStatus !== Constants.PQ_PIPELINE_OFF;
  const endCommand = (): void => {
    conn._chunkSize = 0;
    native = new (pg.Result as unknown as NativeResultClass)("array", types(conn));
    if (!pipelined()) return;
    conn._cmdQueue.shift();
    deliver(null);
    if (conn._cmdQueue.length === 0) release();
  };
  const reseat = (): void => {
    client._activeQuery = submittable;
    (client as { readyForQuery?: boolean }).readyForQuery = false;
  };
  const release = (): void => {
    if (conn._submittable !== submittable) return;
    conn._submittable = null;
    if (client._activeQuery !== submittable) return;
    client._activeQuery = null;
    (client as { readyForQuery?: boolean }).readyForQuery = true;
    (client as unknown as { _pulseQueryQueue(): void })._pulseQueryQueue();
  };
  const submittable = {
    submitted: false,
    writes: [] as ProtocolWrite[],
    submit(connection: Protocol): null {
      submittable.submitted = true;
      for (const write of submittable.writes) write(connection);
      submittable.writes = [];
      return null;
    },
    handleRowDescription(msg: { fields: pg.FieldDef[] }): void {
      native.addFields(msg.fields);
    },
    handleDataRow(msg: { fields: unknown[] }): void {
      native.addRow(native.parseRow(msg.fields));
      if (conn._chunkSize > 0 && native.rows.length === conn._chunkSize) {
        deliver(new Result({ ...native }, null, Constants.PGRES_TUPLES_CHUNK));
        native.rows = [];
      }
    },
    handleCommandComplete(msg: object): void {
      if (conn._chunkSize > 0 && native.rows.length > 0) {
        deliver(new Result({ ...native }, null, Constants.PGRES_TUPLES_CHUNK));
        native.rows = [];
      }
      native.addCommandComplete(msg);
      deliver(new Result({ ...native }));
      endCommand();
    },
    handleEmptyQuery(): void {
      deliver(new Result({ ...native }, null, Constants.PGRES_EMPTY_QUERY));
      endCommand();
    },
    handleParseComplete(): void {},
    handlePortalSuspended(): void {},
    handleError(error: unknown): void {
      if (!(error instanceof pg.DatabaseError)) {
        conn._sendError = pgError(conn, error);
        conn._cmdQueue.length = 0;
        if (conn._submittable === submittable) conn._submittable = null;
        for (const waiter of [...conn._resultWaiters]) waiter();
        return;
      }
      deliver(emptyResult(error));
      if (!pipelined()) return;
      conn._pipelineStatus = Constants.PQ_PIPELINE_ABORTED;
      endCommand();
      while (conn._cmdQueue[0] === "query") {
        deliver(
          new Result(
            { command: "", rowCount: null, oid: 0, fields: [], rows: [] },
            null,
            Constants.PGRES_PIPELINE_ABORTED,
          ),
        );
        endCommand();
      }
      if (conn._cmdQueue.length > 0) reseat();
    },
    handleReadyForQuery(): void {
      conn._cmdQueue.shift();
      if (pipelined()) {
        deliver(new Result({ ...native }, null, Constants.PGRES_PIPELINE_SYNC));
      } else {
        deliver(null);
      }
      if (conn._cmdQueue.length > 0) reseat();
      else if (conn._submittable === submittable) conn._submittable = null;
    },
  };
  submittable.writes.push(write);
  conn._submittable = submittable;
  submit(conn, submittable).catch((error: unknown) => {
    conn._sendError = error;
    conn._cmdQueue.length = 0;
    if (conn._submittable === submittable) conn._submittable = null;
    for (const waiter of [...conn._resultWaiters]) waiter();
  });
}

export function bindValues(conn: Connection, params: unknown[], typemap: TypeMap): unknown[] {
  return params.map((v) => {
    const value = param(conn, v, typemap);
    return value == null || typeof value === "string" || value instanceof Uint8Array
      ? value
      : String(value);
  });
}
