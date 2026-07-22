/**
 * Migration compatibility — versioned migration behavior.
 *
 * Mirrors: ActiveRecord::Migration::Compatibility
 *
 * Each version class preserves the migration behavior from that version.
 * Old migrations continue to work as originally written even as the
 * migration DSL evolves.
 *
 * Usage:
 *   class CreateUsers extends Migration.forVersion(1.0) {
 *     async change() { ... }
 *   }
 *
 * The current version can be obtained via currentVersion() / CURRENT_VERSION
 * and used with Migration.forVersion(currentVersion()).
 */

import type { Migration } from "../migration.js";

export type MigrationClass =
  | (abstract new (...args: any[]) => Migration)
  | (new (...args: any[]) => Migration);

const CURRENT_VERSION = "1.0";

const versionRegistry = new Map<string, MigrationClass>();

/**
 * Normalize a version input to a canonical string key.
 * Ensures numeric 1.0 becomes "1.0" (not "1").
 */
function normalizeVersion(version: string | number): string {
  if (typeof version === "number") {
    const str = String(version);
    return str.includes(".") ? str : `${str}.0`;
  }
  return version;
}

/**
 * Parse a version string into [major, minor] for comparison.
 */
function parseVersion(v: string): [number, number] {
  const parts = v.split(".");
  return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0];
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin] = parseVersion(a);
  const [bMaj, bMin] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aMin - bMin;
}

/**
 * Register a migration version class.
 */
export function registerVersion(version: string, klass: MigrationClass): void {
  versionRegistry.set(normalizeVersion(version), klass);
}

/**
 * Reset the version registry (for testing only).
 */
export function resetVersionRegistry(): void {
  versionRegistry.clear();
}

/**
 * Look up the migration base class for a given version.
 * Returns the exact version if registered, or the nearest lower version.
 *
 * Mirrors: ActiveRecord::Migration::Compatibility.find(version)
 */
export function findVersion(version: string | number): MigrationClass {
  const key = normalizeVersion(version);
  const exact = versionRegistry.get(key);
  if (exact) return exact;

  // Find nearest lower version using proper version comparison
  let best: MigrationClass | undefined;
  let bestKey = "";

  for (const [v, klass] of versionRegistry) {
    if (compareVersions(v, key) <= 0) {
      if (!best || compareVersions(v, bestKey) > 0) {
        bestKey = v;
        best = klass;
      }
    }
  }

  if (best) return best;

  const sorted = [...versionRegistry.keys()].sort(compareVersions).join(", ");
  const err = new Error(`Unknown migration version: ${version}. Registered versions: ${sorted}`);
  err.name = "MigrationError";
  throw err;
}

/**
 * Get the current (latest) migration version string.
 */
export function currentVersion(): string {
  return CURRENT_VERSION;
}

/**
 * Mirrors: ActiveRecord::Migration::Compatibility
 */
export interface Compatibility {
  version: string;
}

/**
 * Mirrors: ActiveRecord::Migration::Compatibility::V6_1::PostgreSQLCompat
 */
export class PostgreSQLCompat {
  static compatibleTimestampType(type: string, connection: { adapterName: string }): string {
    if (connection.adapterName === "postgres") {
      // For Rails <= 6.1, :datetime was aliased to :timestamp
      // See: https://github.com/rails/rails/blob/v6.1.3.2/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb#L108
      // From Rails 7 onwards, you can define what :datetime resolves to (the default is still :timestamp)
      // See `ActiveRecord::ConnectionAdapters::PostgreSQLAdapter.datetime_type`
      return type === "datetime" ? "timestamp" : type;
    }
    return type;
  }
}

/** @internal Shape of a TableDefinition the V6_1 compat layer patches. */
interface CompatTableDefinition {
  newColumnDefinition(name: string, type: string, options?: Record<string, unknown>): unknown;
  column(name: string, type: string, options?: Record<string, unknown>): unknown;
}

/**
 * Define and register the versioned compatibility classes.
 *
 * Ruby declares `class V6_1 < V7_0` inline in compatibility.rb; here a
 * top-level `extends Current` would hit the migration.ts ⇄ compatibility.ts
 * import cycle before `Current` is initialized, so the class bodies are
 * deferred behind this hook, called from migration.ts once `Current` exists.
 */
export function installCompatibilityVersions(current: MigrationClass): void {
  const CurrentClass = current as abstract new (...args: unknown[]) => Migration;

  /**
   * Mirrors: ActiveRecord::Migration::Compatibility::V6_1
   */
  abstract class V6_1 extends CurrentClass {
    override async addColumn(
      tableName: string,
      columnName: string,
      type: Parameters<Migration["addColumn"]>[2],
      options: Parameters<Migration["addColumn"]>[3] = {},
    ): Promise<void> {
      if ((type as string) === "datetime" && !("precision" in options)) {
        options = { ...options, precision: null };
      }
      type = PostgreSQLCompat.compatibleTimestampType(
        type as string,
        this.connection,
      ) as typeof type;
      await super.addColumn(tableName, columnName, type, options);
    }

    override async changeColumn(
      tableName: string,
      columnName: string,
      type: Parameters<Migration["changeColumn"]>[2],
      options: Parameters<Migration["changeColumn"]>[3] = {},
    ): Promise<void> {
      if ((type as string) === "datetime" && !("precision" in options)) {
        options = { ...options, precision: null };
      }
      type = PostgreSQLCompat.compatibleTimestampType(
        type as string,
        this.connection,
      ) as typeof type;
      await super.changeColumn(tableName, columnName, type, options);
    }

    /**
     * Mirrors: V6_1#compatible_table_definition — Ruby prepends
     * `V6_1::TableDefinition` to the yielded table definition's singleton
     * class; here the equivalent is patching the instance's methods so they
     * run before the prototype's.
     */
    override compatibleTableDefinition(t: unknown): unknown {
      const td = t as CompatTableDefinition;
      const conn = this.connection;
      const origNewColumnDefinition = td.newColumnDefinition;
      // Mirrors: V6_1::TableDefinition#new_column_definition
      td.newColumnDefinition = function (name, type, options = {}) {
        type = PostgreSQLCompat.compatibleTimestampType(type, conn);
        return origNewColumnDefinition.call(this, name, type, options);
      };
      const origColumn = td.column;
      // Mirrors: V6_1::TableDefinition#column — `options[:precision] ||= nil`
      td.column = function (name, type, options = {}) {
        if (type === "datetime" && !("precision" in options)) {
          options = { ...options, precision: null };
        }
        return origColumn.call(this, name, type, options);
      };
      return super.compatibleTableDefinition(t);
    }
  }

  registerVersion("6.1", V6_1 as unknown as MigrationClass);
}

export { CURRENT_VERSION };
