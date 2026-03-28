/**
 * Schema dumper — dumps database schema to a Ruby-like DSL string.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 *
 * Stub — not yet wired to adapter introspection. Will eventually delegate
 * to adapter-specific dumpers in connection-adapters/abstract/schema-dumper.ts.
 */

import type { DatabaseAdapter } from "./adapter.js";

export class SchemaDumper {
  private _adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  static async dump(adapter: DatabaseAdapter): Promise<string> {
    const dumper = new SchemaDumper(adapter);
    return dumper.dump();
  }

  async dump(): Promise<string> {
    const lines: string[] = [];
    lines.push("Schema.define(version: 0) {");
    lines.push("}");
    return lines.join("\n");
  }
}
