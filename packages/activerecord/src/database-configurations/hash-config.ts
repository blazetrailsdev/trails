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
import { configurationsStore as configurations } from "../database-configurations.js";
import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

export class HashConfig extends DatabaseConfig {
  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    super(envName, name, configuration);
  }

  /**
   * Mirrors: HashConfig#primary?
   *
   * `Base.configurations` reads the one process-global registry and takes no
   * receiver, so `configurations()` here is that same `@@configurations`
   * (`core.rb:71-79`) under its Rails name. It is read at call time, so the
   * import back into `database-configurations.ts` never needs that module to
   * have finished evaluating.
   */
  isPrimary(): boolean {
    return configurations().isPrimary(this.name);
  }

  /**
   * Mirrors: HashConfig#seeds?
   *
   * `Hash#fetch` returns the stored value whenever the key is present — a stored
   * nil included — so this reads by key presence: if `seeds` is present it
   * returns its value, otherwise true for the primary database and false for
   * others.
   */
  get seeds(): boolean | null {
    return "seeds" in this.configuration
      ? (this.configuration.seeds as boolean | null)
      : this.isPrimary();
  }

  /**
   * Mirrors: HashConfig#schema_dump
   *
   * Returns the schema dump filename for this config, or null if schema
   * dumping is disabled (configured as either `false` or `null`).
   */
  schemaDump(format: "ruby" | "sql" | "ts" = "ts"): string | null {
    if (
      Object.hasOwn(this.configuration, "schemaDump") &&
      this.configuration.schemaDump !== undefined
    ) {
      const val = this.configuration.schemaDump;
      // Rails: `if config = configuration_hash[:schema_dump]` — both `nil` and
      // `false` short-circuit to a nil return. JS `undefined` is treated as
      // "key absent" (fall through to the default).
      if (val === false || val === null) return null;
      return val;
    }
    const typeFile = this.schemaFileType(format);
    if (!typeFile) return null;
    return this.isPrimary() ? typeFile : `${this.name}_${typeFile}`;
  }

  /**
   * Mirrors: HashConfig#default_schema_cache_path
   */
  defaultSchemaCachePath(dbDir: string = "db"): string {
    // Rails writes YAML; trails writes JSON (no Ruby Marshal/YAML in TS), so
    // the on-disk extension is .json to match what DatabaseTasks.dumpSchemaCache
    // actually produces.
    const file = this.isPrimary() ? "schema_cache.json" : `${this.name}_schema_cache.json`;
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

  /**
   * Mirrors: HashConfig#schema_file_type (hash_config.rb:170-177, private).
   * The "ts" arm is trails' own schema format.
   */
  private schemaFileType(format: string): string | null {
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
