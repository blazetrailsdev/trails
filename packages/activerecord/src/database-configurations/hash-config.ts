/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::HashConfig
 *
 * Created for each database configuration entry defined as a hash.
 *
 *   { "development" => { "database" => "db_name" } }
 *
 * Creates a HashConfig with envName="development", name="primary",
 * and configuration={ database: "db_name" }.
 */
import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

// Late-bound reference to the global configurations — set by
// database-configurations.ts to break circular dependency.
let _primaryChecker: ((name: string) => boolean) | null = null;

/** @internal */
export function _setPrimaryChecker(fn: (name: string) => boolean): void {
  _primaryChecker = fn;
}

export class HashConfig extends DatabaseConfig {
  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    super(envName, name, configuration);
  }

  /**
   * Mirrors: HashConfig#primary?
   *
   * True if this config is the primary database for its environment.
   * Named "primary" is always primary; otherwise checks global configurations.
   */
  isPrimary(): boolean {
    if (this.name === "primary") return true;
    return _primaryChecker ? _primaryChecker(this.name) : false;
  }

  /**
   * Mirrors: HashConfig#seeds?
   *
   * If the `seeds` key is present, returns its value. Otherwise returns
   * true for the primary database and false for others.
   */
  get seeds(): boolean {
    const raw = this.configuration.seeds;
    if (raw !== undefined) return !!raw;
    return this.isPrimary();
  }

  /**
   * Mirrors: HashConfig#schema_dump
   *
   * Returns the schema dump filename for this config, or false/null if
   * schema dumping is disabled.
   */
  schemaDump(format: "ruby" | "sql" | "ts" = "ts"): string | false | null {
    if ("schemaDump" in this.configuration) {
      const val = this.configuration.schemaDump;
      if (val === false || val === null) return val as false | null;
      return val as string;
    }
    const typeFile = this._schemaFileType(format);
    if (!typeFile) return null;
    return this.isPrimary() ? typeFile : `${this.name}_${typeFile}`;
  }

  /**
   * Mirrors: HashConfig#default_schema_cache_path
   */
  defaultSchemaCachePath(dbDir: string = "db"): string {
    const file = this.isPrimary() ? "schema_cache.yml" : `${this.name}_schema_cache.yml`;
    return `${dbDir}/${file}`;
  }

  /**
   * Mirrors: HashConfig#lazy_schema_cache_path
   */
  lazySchemaCachePath(): string {
    return this.schemaCachePath ?? this.defaultSchemaCachePath();
  }

  /**
   * Mirrors: HashConfig#database_tasks?
   *
   * Returns false for replicas; otherwise respects the :database_tasks key
   * (defaults to true).
   */
  databaseTasks(): boolean {
    if (this.replica) return false;
    const val = this.configuration.databaseTasks;
    return val === undefined ? true : !!val;
  }

  private _schemaFileType(format: string): string | null {
    switch (format) {
      case "ruby":
        return "schema.rb";
      case "sql":
        return "structure.sql";
      case "ts":
        return "schema.ts";
      default:
        return null;
    }
  }
}
