import { fetch, hasKey } from "@blazetrails/ruby-compat";
import { configurationsStore as configurations } from "../database-configurations.js";
import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

export class HashConfig extends DatabaseConfig {
  protected _configurationHash: DatabaseConfigOptions;

  constructor(envName: string, name: string, configurationHash: DatabaseConfigOptions = {}) {
    super(envName, name);
    this._configurationHash = Object.freeze({ ...configurationHash });
  }

  get configurationHash(): DatabaseConfigOptions {
    return this._configurationHash;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE converge-hash-config-configuration-alias
   */
  get configuration(): DatabaseConfigOptions {
    return this.configurationHash;
  }

  override get replica(): boolean | undefined {
    return this.configurationHash.replica;
  }

  override get migrationsPaths(): string | string[] | undefined {
    return this.configurationHash.migrationsPaths;
  }

  override get host(): string | undefined {
    return this.configurationHash.host;
  }

  get socket(): string | undefined {
    return this.configurationHash.socket;
  }

  override get database(): string | undefined {
    return this.configurationHash.database;
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  override set _database(database: string) {
    this._configurationHash = Object.freeze({ ...this._configurationHash, database });
  }

  override get pool(): number {
    return toInt(this.configurationHash.pool ?? 5);
  }

  override get minThreads(): number {
    return toInt(this.configurationHash.minThreads ?? 0);
  }

  override get maxThreads(): number {
    return toInt(this.configurationHash.maxThreads ?? this.pool);
  }

  override get queryCache(): unknown {
    return this.configurationHash.queryCache;
  }

  override get maxQueue(): number {
    return this.maxThreads * 4;
  }

  override get checkoutTimeout(): number {
    return toFloat(this.configurationHash.checkoutTimeout ?? 5);
  }

  override get reapingFrequency(): number | null {
    const raw = fetch<unknown>(
      this.configurationHash as Record<string, unknown>,
      "reapingFrequency",
      60,
    );
    return raw == null ? null : toFloat(raw);
  }

  override get idleTimeout(): number | null {
    const timeout = toFloat(
      fetch<unknown>(this.configurationHash as Record<string, unknown>, "idleTimeout", 300),
    );
    return timeout > 0 ? timeout : null;
  }

  override get adapter(): string | undefined {
    return this.configurationHash.adapter;
  }

  override get schemaCachePath(): string | undefined {
    return this.configurationHash.schemaCachePath;
  }

  defaultSchemaCachePath(dbDir: string = "db"): string {
    const file = this.isPrimary() ? "schema_cache.json" : `${this.name}_schema_cache.json`;
    return `${dbDir}/${file}`;
  }

  lazySchemaCachePath(): string {
    return this.schemaCachePath ?? this.defaultSchemaCachePath();
  }

  isPrimary(): boolean {
    return configurations().isPrimary(this.name);
  }

  override get seeds(): boolean | null {
    return fetch<boolean | null>(
      this.configurationHash as Record<string, unknown>,
      "seeds",
      this.isPrimary(),
    );
  }

  schemaDump(format: "ruby" | "sql" | "ts" = "ts"): string | null {
    if (
      hasKey(this.configurationHash, "schemaDump") &&
      this.configurationHash.schemaDump !== undefined
    ) {
      const val = this.configurationHash.schemaDump;
      if (val === false || val === null) return null;
      return val;
    }
    const typeFile = this.schemaFileType(format);
    if (!typeFile) return null;
    return this.isPrimary() ? typeFile : `${this.name}_${typeFile}`;
  }

  databaseTasks(): boolean {
    return (
      !this.replica &&
      !!fetch<unknown>(this.configurationHash as Record<string, unknown>, "databaseTasks", true)
    );
  }

  override get useMetadataTable(): boolean {
    return fetch<boolean>(
      this.configurationHash as Record<string, unknown>,
      "useMetadataTable",
      true,
    );
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

function toInt(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const match = String(value).match(/^\s*[+-]?\d+/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toFloat(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const match = String(value).match(/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : 0;
}
