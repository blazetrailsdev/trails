import mysql from "mysql2/promise";
import { rtest } from "@blazetrails/ruby-compat";
import type { Client, Field, QueryOptions } from "./client.js";
import { Mysql2 } from "./mysql2.js";

const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(mysql.Types).map(([name, code]) => [code, name]),
);

declare module "./mysql2.js" {
  interface Mysql2Namespace {
    Result: typeof Result;
  }
}

export class Result {
  readonly fields: string[];
  private rows: Array<unknown[] | Record<string, unknown>>;

  constructor(
    fields: string[],
    rows: Array<unknown[] | Record<string, unknown>>,
    private error?: Error,
    private client?: Client,
    private queryOptions: QueryOptions = {},
    private fieldPackets: mysql.FieldPacket[] = [],
  ) {
    this.fields = fields;
    this.rows = rows;
  }

  count(): number {
    return this.rows.length;
  }

  get size(): number {
    return this.rows.length;
  }

  toA(): Array<unknown[] | Record<string, unknown>> {
    return this.each();
  }

  each(
    opts: QueryOptions | ((row: unknown[] | Record<string, unknown>) => unknown) = {},
    block?: (row: unknown[] | Record<string, unknown>) => unknown,
  ): Array<unknown[] | Record<string, unknown>> {
    if (typeof opts === "function") [opts, block] = [{}, opts];
    if (this.error) throw this.error;
    opts = { ...this.queryOptions, ...opts };
    let source = this.rows;
    if (this.client) {
      const client = this.client;
      const typeCast = client.typeCast(opts);
      client.INVALID_DATE = undefined;
      source = this.rows.map((row) => this.fetchRow(row, typeCast));
      const error = client.INVALID_DATE;
      client.INVALID_DATE = undefined;
      if (error) throw error;
      if (rtest(opts.cacheRows)) {
        this.rows = source;
        this.client = undefined;
      }
    }
    const asArray = opts.as === "array";
    const asHash = opts.as != null && !asArray;
    const rows = source.map((row) => {
      if (asArray && !Array.isArray(row)) return this.fields.map((f) => row[f]);
      if (asHash && Array.isArray(row)) {
        return Object.fromEntries(this.fields.map((f, i) => [f, row[i]]));
      }
      return row;
    });
    if (block) for (const row of rows) block(row);
    return rows;
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

Mysql2.Result = Result;
