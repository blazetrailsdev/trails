/**
 * ActiveRecord::ExplainRegistry — thread-local registry for EXPLAIN queries.
 *
 * Collects SQL/binds pairs when `collect` is enabled, so they can be
 * passed to the adapter's EXPLAIN.
 */
export class ExplainRegistry {
  private static _instance: ExplainRegistry | null = null;

  private static get instance(): ExplainRegistry {
    if (!this._instance) this._instance = new ExplainRegistry();
    return this._instance;
  }

  static get collect(): boolean {
    return this.instance._collect;
  }

  static set collect(value: boolean) {
    this.instance._collect = value;
  }

  static collectEnabled(): boolean {
    return this.instance._collect;
  }

  static get queries(): [string, unknown[]][] {
    return this.instance._queries;
  }

  static reset(): void {
    if (this._instance) {
      this._instance._collect = false;
      this._instance._queries = [];
    } else {
      this._instance = new ExplainRegistry();
    }
  }

  // -- Instance state ------------------------------------------------------

  private _collect = false;
  private _queries: [string, unknown[]][] = [];
}
