import type { DatabaseAdapter } from "./adapter.js";
import { TableDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { detectAdapterName } from "./adapter-name.js";
import { quoteIdentifier, quoteTableName } from "./quoting.js";

/**
 * Schema — defines database schema declaratively.
 *
 * Mirrors: ActiveRecord::Schema
 */
export class Schema {
  static async define(
    adapter: DatabaseAdapter,
    fn: (schema: Schema) => void | Promise<void>,
  ): Promise<void> {
    const schema = new Schema(adapter);
    await fn(schema);
  }

  private adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this.adapter);
  }

  async createTable(name: string, fn?: (t: TableDefinition) => void): Promise<void> {
    const td = new TableDefinition(name, { adapterName: this._adapterName });
    if (fn) fn(td);
    await this.adapter.executeMutation(td.toSql());

    const adp = this._adapterName;
    for (const idx of td.indexes) {
      const indexName = idx.name ?? `index_${name}_on_${idx.columns.join("_and_")}`;
      const unique = idx.unique ? "UNIQUE " : "";
      const cols = idx.columns.map((c) => quoteIdentifier(c, adp)).join(", ");
      await this.adapter.executeMutation(
        `CREATE ${unique}INDEX ${quoteIdentifier(indexName, adp)} ON ${quoteTableName(name, adp)} (${cols})`,
      );
    }
  }
}
