import { rbScanArgs } from "@blazetrails/ruby-compat";
import type { Client, Field, Mysql2Result, QueryOptions } from "./client.js";
import { Error as Mysql2Error } from "./error.js";
import { Mysql2 } from "./mysql2.js";
import type { Result } from "./result.js";

declare module "./mysql2.js" {
  interface Mysql2Namespace {
    Statement: typeof Statement;
  }
}

export class Statement {
  affectedRows = 0;
  lastId = 0;
  /** @internal */
  closed = false;

  constructor(
    private client: Client,
    private sql: string,
    private stmt: {
      statement: { columns: { name: string }[]; parameters: unknown[]; close(): unknown };
    },
  ) {}

  get paramCount(): number {
    return this.stmt.statement.parameters.length;
  }

  get fieldCount(): number {
    return this.stmt.statement.columns.length;
  }

  get fields(): string[] | null {
    const fields = this.stmt.statement.columns;
    if (fields.length === 0) return null;
    return fields.map((field) => field.name);
  }

  execute(...args: unknown[]): Promise<Mysql2Result | null> {
    return this._execute(args);
  }

  /** @internal */
  async _execute(argv: unknown[]): Promise<Mysql2Result | null> {
    if (this.closed) throw new Mysql2Error("Invalid statement handle");
    const [args, kwargs] = rbScanArgs<QueryOptions>(argv);
    const currentQueryOptions = { ...this.client.queryOptions, ...kwargs };
    const options = {
      ...this.client.options(this.sql, currentQueryOptions),
      supportBigNumbers: true,
      bigNumberStrings: true,
      typeCast: (field: Field, next: () => unknown) => {
        switch (field.type) {
          case "SHORT":
          case "LONG":
          case "INT24":
          case "YEAR":
          case "FLOAT":
          case "DOUBLE":
          case "LONGLONG":
          case "DECIMAL":
          case "NEWDECIMAL": {
            const value = next();
            return value == null ? null : String(value);
          }
          case "JSON":
            return field.string("binary");
          default:
            return field.string();
        }
      },
    };
    const native = await this.client
      .execute(options, args)
      .catch((e: unknown) => this.client.raiseMysql2Error(e));
    const result = this.client.storeResult(native, currentQueryOptions);
    this.lastId = (native[0] as { insertId?: number }).insertId ?? 0;
    if (result) (result as Result).stmtWrapper = this;
    this.affectedRows = result?.size ?? this.client.affectedRows;
    return result;
  }

  close(): void {
    this.closed = true;
    const options = this.client.options(this.sql, this.client.queryOptions);
    if (this.client.unprepare(options) !== this.stmt.statement) this.stmt.statement.close();
  }
}

Mysql2.Statement = Statement;
