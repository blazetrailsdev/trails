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

  free(): void {
    this.rows = [];
  }
}

Mysql2.Result = Result;
