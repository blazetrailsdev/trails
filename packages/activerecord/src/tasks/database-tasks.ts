/**
 * DatabaseTasks — coordinates database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::DatabaseTasks
 */

import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseConfigurations } from "../database-configurations/connection-url-resolver.js";

export class DatabaseTasks {
  static get env(): string {
    return DatabaseConfigurations.defaultEnv;
  }

  static set env(value: string) {
    DatabaseConfigurations.defaultEnv = value;
  }
  static databaseConfiguration: DatabaseConfigurations | null = null;
  static dbDir: string = "db";
  static migrationsPath: string[] = ["db/migrate"];
  static schemaFormat: "ruby" | "sql" = "ruby";

  private static _registeredTasks: Array<{
    pattern: RegExp | string;
    handler: DatabaseTaskHandler;
  }> = [];

  static registerTask(pattern: RegExp | string, handler: DatabaseTaskHandler): void {
    this._registeredTasks.push({ pattern, handler });
  }

  static resolveTask(adapter: string): DatabaseTaskHandler | undefined {
    for (let i = this._registeredTasks.length - 1; i >= 0; i--) {
      const { pattern, handler } = this._registeredTasks[i];
      if (typeof pattern === "string") {
        if (adapter.startsWith(pattern)) return handler;
      } else {
        pattern.lastIndex = 0;
        if (pattern.test(adapter)) return handler;
      }
    }
    return undefined;
  }

  private static _resolveTaskOrThrow(adapter: string): DatabaseTaskHandler {
    const handler = this.resolveTask(adapter);
    if (!handler) {
      throw new Error(
        `No database task handler registered for adapter '${adapter}'. ` +
          `Register one with DatabaseTasks.registerTask().`,
      );
    }
    return handler;
  }

  private static _adapterFor(config: DatabaseConfig): string {
    const adapter = config.adapter;
    if (!adapter) {
      throw new Error("database configuration does not specify adapter");
    }
    return adapter;
  }

  static clearRegisteredTasks(): void {
    this._registeredTasks = [];
  }

  static async create(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.create) {
      await handler.create(config);
    }
  }

  static async createAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.create(config);
    }
  }

  static async createCurrent(environment?: string): Promise<void> {
    const envs = this._environmentsFor(environment);
    for (const env of envs) {
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.create(config);
      }
    }
  }

  static async drop(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.drop) {
      await handler.drop(config);
    }
  }

  static async dropAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.checkProtectedEnvironments(config.envName);
    }
    for (const config of configs) {
      await this.drop(config);
    }
  }

  static async dropCurrent(environment?: string): Promise<void> {
    const envs = this._environmentsFor(environment);
    for (const env of envs) {
      await this.checkProtectedEnvironments(env);
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.drop(config);
      }
    }
  }

  private static _migrations: Array<import("../migration.js").MigrationProxy> = [];

  static registerMigrations(migrations: Array<import("../migration.js").MigrationProxy>): void {
    this._migrations = migrations;
  }

  static async migrate(version?: number | string): Promise<void> {
    const raw = version ?? this.targetVersion();
    const effectiveVersion = typeof raw === "string" ? raw.trim() || null : raw;
    this.checkTargetVersion(effectiveVersion ?? undefined);

    if (!this.databaseConfiguration) return;
    const configs = this.configsFor(this._normalizeEnv());
    if (configs.length === 0) return;

    const config = configs.find((c) => c.name === "primary") ?? configs[0];
    const { Migrator } = await import("../migration.js");
    const adapter = await this._resolveAdapter(config);
    if (!adapter) {
      throw new Error("No database adapter configured. Call DatabaseTasks.setAdapter() first.");
    }

    const migrator = new Migrator(adapter, this._migrations);
    await migrator.migrate(effectiveVersion ?? null);
  }

  private static _adapterInstance: import("../adapter.js").DatabaseAdapter | null = null;

  static setAdapter(adapter: import("../adapter.js").DatabaseAdapter | null): void {
    this._adapterInstance = adapter;
  }

  private static async _resolveAdapter(
    _config: DatabaseConfig,
  ): Promise<import("../adapter.js").DatabaseAdapter | null> {
    return this._adapterInstance;
  }

  static async purge(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.purge) {
      await handler.purge(config);
    }
  }

  static async purgeCurrent(environment?: string): Promise<void> {
    await this.checkProtectedEnvironments(environment);
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    for (const config of configs) {
      await this.purge(config);
    }
  }

  static async purgeAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.checkProtectedEnvironments(config.envName);
    }
    for (const config of configs) {
      await this.purge(config);
    }
  }

  static async truncateAll(environment?: string): Promise<void> {
    await this.checkProtectedEnvironments(environment);
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    for (const config of configs) {
      const handler = this._resolveTaskOrThrow(this._adapterFor(config));
      if (handler.truncateAll) {
        await handler.truncateAll(config);
      }
    }
  }

  static async charset(config: DatabaseConfig): Promise<string | null> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    return handler.charset ? handler.charset(config) : null;
  }

  static async charsetCurrent(environment?: string): Promise<string | null> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    const primary = configs.find((c) => c.name === "primary") ?? configs[0];
    return this.charset(primary);
  }

  static async collation(config: DatabaseConfig): Promise<string | null> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.collation) {
      return handler.collation(config);
    }
    return null;
  }

  static async collationCurrent(environment?: string): Promise<string | null> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    const primary = configs.find((c) => c.name === "primary") ?? configs[0];
    return this.collation(primary);
  }

  static targetVersion(): number | null {
    const version = process.env.VERSION;
    if (!version) return null;
    const str = version.trim();
    if (str === "" || !/^\d+$/.test(str)) return null;
    return parseInt(str, 10);
  }

  static checkTargetVersion(version?: number | string): void {
    const v = version ?? process.env.VERSION;
    if (v === undefined || v === null || String(v).trim() === "") return;
    const str = String(v).trim();
    if (!/^\d+$/.test(str)) {
      throw new Error(`Invalid format of target version: '${str}'`);
    }
  }

  static dumpSchemaFilename(config?: DatabaseConfig): string {
    const envSchema = process.env.SCHEMA?.trim();
    if (envSchema) return envSchema;
    const ext = this.schemaFormat === "sql" ? "structure.sql" : "schema.rb";
    if (config && config.name !== "primary") {
      const base = this.schemaFormat === "sql" ? "structure" : "schema";
      return `${this.dbDir}/${config.name}_${base}.${this.schemaFormat === "sql" ? "sql" : "rb"}`;
    }
    return `${this.dbDir}/${ext}`;
  }

  static checkSchemaFile(filename: string): void {
    if (!filename || filename.trim() === "") {
      throw new Error("Schema file not specified");
    }
  }

  static async checkProtectedEnvironments(environment?: string): Promise<void> {
    const env = this._normalizeEnv(environment);
    const { Base } = await import("../base.js");
    const protectedEnvs = Base.protectedEnvironments;
    if (protectedEnvs.includes(env)) {
      throw new Error(
        `You are attempting to run a destructive action against your '${env}' database. Aborting.`,
      );
    }
  }

  static configsFor(environment: string): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configsFor({ envName: environment });
  }

  private static _normalizeEnv(environment?: string): string {
    const trimmed = environment?.trim();
    return trimmed || this.env;
  }

  static eachLocalConfiguration(): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configurations.filter((c) => {
      if (!c.database) return false;
      const host = c.host;
      return !host || host === "localhost" || host === "127.0.0.1" || host === "::1";
    });
  }

  private static _environmentsFor(environment?: string): string[] {
    const env = this._normalizeEnv(environment);
    if (!environment?.trim() && env === "development") {
      return ["development", "test"];
    }
    return [env];
  }
}

export interface DatabaseTaskHandler {
  create?(config: DatabaseConfig): Promise<void>;
  drop?(config: DatabaseConfig): Promise<void>;
  purge?(config: DatabaseConfig): Promise<void>;
  truncateAll?(config: DatabaseConfig): Promise<void>;
  charset?(config: DatabaseConfig): Promise<string | null>;
  collation?(config: DatabaseConfig): Promise<string | null>;
}
