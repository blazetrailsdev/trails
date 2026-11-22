import type { QueryOptions } from "./client.js";
import { Mysql2 } from "./mysql2.js";

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
    if (this.error) throw this.error;
    return this.rows;
  }

  /**
   * @missingRailsCall cast — CONVERGEABLE mysql2-client-prepare-prepares-on-the-server
   * @missingRailsCall cast_booleans — CONVERGEABLE mysql2-client-prepare-prepares-on-the-server
   */
  each(
    opts: QueryOptions | ((row: unknown[] | Record<string, unknown>) => unknown) = {},
    block?: (row: unknown[] | Record<string, unknown>) => unknown,
  ): Array<unknown[] | Record<string, unknown>> {
    if (typeof opts === "function") [opts, block] = [{}, opts];
    if (this.error) throw this.error;
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

  free(): void {
    this.rows = [];
  }
}

Mysql2.Result = Result;
