import { configurationsStore as configurations } from "../database-configurations.js";
import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

export class HashConfig extends DatabaseConfig {
  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    super(envName, name, configuration);
  }

  isPrimary(): boolean {
    return configurations().isPrimary(this.name);
  }

  /** @missingRailsCall fetch — PERMANENT */
  get seeds(): boolean | null {
    return "seeds" in this.configuration
      ? (this.configuration.seeds as boolean | null)
      : this.isPrimary();
  }

  schemaDump(format: "ruby" | "sql" | "ts" = "ts"): string | null {
    if (
      Object.hasOwn(this.configuration, "schemaDump") &&
      this.configuration.schemaDump !== undefined
    ) {
      const val = this.configuration.schemaDump;
      if (val === false || val === null) return null;
      return val;
    }
    const typeFile = this.schemaFileType(format);
    if (!typeFile) return null;
    return this.isPrimary() ? typeFile : `${this.name}_${typeFile}`;
  }

  defaultSchemaCachePath(dbDir: string = "db"): string {
    const file = this.isPrimary() ? "schema_cache.json" : `${this.name}_schema_cache.json`;
    return `${dbDir}/${file}`;
  }

  lazySchemaCachePath(): string {
    return this.schemaCachePath ?? this.defaultSchemaCachePath();
  }

  /** @missingRailsCall fetch — PERMANENT */
  databaseTasks(): boolean {
    if (this.replica) return false;
    const val = this.configuration.databaseTasks;
    return val === undefined ? true : !!val;
  }

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
