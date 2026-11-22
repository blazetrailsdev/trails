import mysql from "mysql2/promise";
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
    if (this.client) {
      const client = this.client;
      client["INVALID_DATE"] = undefined;
      this.rows = this.rows.map((row) => this.fetchRow(row, opts));
      this.client = undefined;
      const error = client["INVALID_DATE"];
      client["INVALID_DATE"] = undefined;
      if (error) throw error;
    }
    const asArray = opts.as === "array";
    const asHash = opts.as != null && !asArray;
    const rows = this.rows.map((row) => {
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
    opts: QueryOptions,
  ): unknown[] | Record<string, unknown> {
    const typeCast = this.client!["typeCast"](opts);
    const castField = (bytes: unknown, i: number): unknown => {
      const packet = this.fieldPackets[i];
      const raw = bytes as Uint8Array | null;
      const text = (encoding = packet.encoding ?? "utf8") => {
        if (raw === null) return null;
        if (Buffer.isEncoding(encoding))
          return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(encoding);
        return new TextDecoder(encoding === "cesu8" ? "utf-8" : encoding).decode(raw);
      };
      const type = TYPE_NAMES[packet.type!];
      const field: Field = {
        type,
        name: packet.name,
        length: packet.columnLength,
        string: text,
        buffer: () => raw,
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
          case "LONGLONG": {
            const value = text("ascii")!;
            return Number.isSafeInteger(Number(value)) ? Number(value) : value;
          }
          default:
            return packet.characterSet === mysql.Charsets.BINARY ? raw : text();
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
