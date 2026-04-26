/**
 * Sync SqlJsAdapter-compatible wrapper over the async SwAdapterProxy.
 * Maintains cached tables/columns so DatabaseBrowser can use its
 * existing sync API without modification.
 *
 * execRaw() caches per-table COUNT(*) and preview queries during hydrate
 * so DatabaseBrowser's sync refresh() gets real data on first call.
 */

import type { SwAdapterProxy } from "./sw-adapter-proxy.js";
import type { SwClient } from "./sw-client.js";
import type { SwBroadcast } from "./sw-protocol.js";

export class SyncSwAdapter {
  private _tables: string[] = [];
  private _columns = new Map<
    string,
    Array<{ name: string; type: string; notnull: boolean; pk: boolean }>
  >();
  private _queryCache = new Map<string, Array<{ columns: string[]; values: unknown[][] }>>();
  private _listeners: Array<() => void> = [];
  private _unsubBroadcast: (() => void) | null = null;

  constructor(
    private proxy: SwAdapterProxy,
    client: SwClient,
  ) {
    this._unsubBroadcast = client.onBroadcast((msg: SwBroadcast) => {
      if (msg.type === "db:changed") {
        void this._rehydrate().catch(() => {});
      }
    });
  }

  async hydrate(): Promise<void> {
    this._tables = await this.proxy.getTables();
    this._columns.clear();
    this._queryCache.clear();
    for (const table of this._tables) {
      this._columns.set(table, await this.proxy.getColumns(table));
      const escaped = table.replace(/"/g, '""');
      const countResult = await this.proxy.execRaw(`SELECT COUNT(*) FROM "${escaped}"`);
      this._queryCache.set(`SELECT COUNT(*) FROM "${escaped}"`, countResult);
    }
    this._notify();
  }

  private async _rehydrate(): Promise<void> {
    await this.hydrate();
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }

  getTables(): string[] {
    return this._tables;
  }

  getColumns(table: string): Array<{ name: string; type: string; notnull: boolean; pk: boolean }> {
    return this._columns.get(table) ?? [];
  }

  execRaw(sql: string): Array<{ columns: string[]; values: unknown[][] }> {
    const cached = this._queryCache.get(sql);
    if (cached) return cached;

    // For uncached queries, fire async and cache for next call
    void this.proxy.execRaw(sql).then((results) => {
      this._queryCache.set(sql, results);
      this._notify();
    });
    return [];
  }

  onChange(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  dispose(): void {
    this._unsubBroadcast?.();
    this._listeners = [];
  }
}
