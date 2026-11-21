import { rbScanArgs } from "@blazetrails/ruby-compat";
import { driverError } from "./client.js";
import type { Client, Mysql2Result, QueryOptions } from "./client.js";
import { Mysql2 } from "./mysql2.js";

declare module "./mysql2.js" {
  interface Mysql2Namespace {
    Statement: typeof Statement;
  }
}

export class Statement {
  affectedRows = 0;

  constructor(
    private client: Client,
    private sql: string,
  ) {}

  execute(...args: unknown[]): Promise<Mysql2Result | null> {
    return this._execute(args);
  }

  /** @internal */
  async _execute(argv: unknown[]): Promise<Mysql2Result | null> {
    const [args, kwargs] = rbScanArgs<QueryOptions>(argv);
    const currentQueryOptions = { ...this.client.queryOptions, ...kwargs, cast: true };
    const result = this.client["storeResult"](
      await this.client["execute"](
        this.client["options"](this.sql, currentQueryOptions),
        args,
      ).catch((e: unknown) => driverError(e, this.client["connection"])),
    );
    this.affectedRows = result?.size ?? this.client.affectedRows;
    return result;
  }

  close(): void {
    this.client["unprepare"](this.client["options"](this.sql, this.client.queryOptions));
  }
}

Mysql2.Statement = Statement;
