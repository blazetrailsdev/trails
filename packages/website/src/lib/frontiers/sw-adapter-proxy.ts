/**
 * Minimal async DB proxy backed by the sandbox service worker.
 * Provides the subset of schema/query operations needed by DatabaseBrowser
 * and CLI paths — not a full SqlJsAdapter replacement.
 */

import type { SwClient } from "./sw-client.js";

export class SwAdapterProxy {
  constructor(private client: SwClient) {}

  async getTables(): Promise<string[]> {
    const resp = await this.client.send({ type: "db:tables" });
    return resp.tables;
  }

  async getColumns(
    table: string,
  ): Promise<Array<{ name: string; type: string; notnull: boolean; pk: boolean }>> {
    const resp = await this.client.send({ type: "db:columns", table });
    return resp.columns;
  }

  async execRaw(sql: string): Promise<Array<{ columns: string[]; values: unknown[][] }>> {
    const resp = await this.client.send({ type: "db:query", sql });
    return resp.results;
  }
}
