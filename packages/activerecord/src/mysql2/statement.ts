import { rbScanArgs } from "@blazetrails/ruby-compat";
import { driverError, options, storeResult } from "./client.js";
import type { Mysql2Client, Mysql2Result, QueryOptions } from "./client.js";

export class Statement {
  affectedRows = 0;

  constructor(
    private client: Mysql2Client,
    private sql: string,
  ) {}

  execute(...args: unknown[]): Promise<Mysql2Result | null> {
    return this._execute(...args);
  }

  /** @internal */
  async _execute(...argv: unknown[]): Promise<Mysql2Result | null> {
    const [args, kwargs] = rbScanArgs<QueryOptions>(argv);
    const currentQueryOptions = { ...this.client.queryOptions, ...kwargs, cast: true };
    const result = storeResult(
      this.client,
      (await this.client
        .execute(options(this.client, this.sql, currentQueryOptions) as never, args as never)
        .catch((e: unknown) => driverError(e, this.client))) as [unknown, never],
    );
    this.affectedRows = result?.size ?? this.client.affectedRows;
    return result;
  }

  close(): void {
    this.client.unprepare(options(this.client, this.sql, this.client.queryOptions) as never);
  }
}
