import type pg from "pg";
import { PGResult } from "./pg-result.js";

export interface PGConnection extends pg.Client {
  prepare(stmtName: string, sql: string): Promise<void>;
  execPrepared(stmtName: string, params: unknown[]): Promise<PGResult>;
  asyncExec(sql: string | null): Promise<PGResult>;
  execParams(sql: string | null, params: unknown[]): Promise<PGResult>;
  unescapeBytea(value: string | Uint8Array): Buffer;
}

type QueryConfig = string | Record<string, unknown> | null;
type Query = (config: QueryConfig) => Promise<pg.QueryResult | pg.QueryResult[]>;

const PREPARED = new WeakMap<object, Map<string, string>>();

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
    }),
  );
}

async function asyncExec(this: pg.Client, sql: string | null): Promise<PGResult> {
  return result(
    await (this.query as unknown as Query)(sql != null ? { text: sql, rowMode: "array" } : sql),
  );
}

async function execParams(
  this: pg.Client,
  sql: string | null,
  params: unknown[],
): Promise<PGResult> {
  return result(
    await (this.query as unknown as Query)({ text: sql, values: params, rowMode: "array" }),
  );
}

function result(raw: pg.QueryResult | pg.QueryResult[]): PGResult {
  return new PGResult(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

/** @noRailsEquivalent CONVERGEABLE pg-gem-connection-surface-scores-against-the-pg-gem */
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

/** @noRailsEquivalent CONVERGEABLE pg-gem-connection-surface-scores-against-the-pg-gem */
export function pgConnection<T extends object>(client: T): T & PGConnection {
  return Object.assign(client, {
    prepare,
    execPrepared,
    asyncExec,
    execParams,
    unescapeBytea,
  }) as unknown as T & PGConnection;
}
