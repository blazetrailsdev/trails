/**
 * DatabaseTasks — coordinates database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::DatabaseTasks
 */

import { DatabaseConfigurations, DatabaseConfig } from "../database-configurations.js";

export class DatabaseTasks {
  static env: string = process.env.RAILS_ENV ?? process.env.NODE_ENV ?? "development";
  static databaseConfiguration: DatabaseConfigurations | null = null;
  static dbDir: string = "db";
  static migrationsPath: string[] = ["db/migrate"];
  static schemaFormat: "ruby" | "sql" = "ruby";

  private static _registeredTasks: Array<{ pattern: RegExp; handler: DatabaseTaskHandler }> = [];

  static registerTask(pattern: RegExp | string, handler: DatabaseTaskHandler): void {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    this._registeredTasks.push({ pattern: regex, handler });
  }

  static resolveTask(adapter: string): DatabaseTaskHandler | undefined {
    for (let i = this._registeredTasks.length - 1; i >= 0; i--) {
      const { pattern, handler } = this._registeredTasks[i];
      pattern.lastIndex = 0;
      if (pattern.test(adapter)) return handler;
    }
    return undefined;
  }

  static clearRegisteredTasks(): void {
    this._registeredTasks = [];
  }

  static async create(config: DatabaseConfig): Promise<void> {
    const handler = this.resolveTask(config.adapter ?? "");
    if (handler?.create) {
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
    const envs = this._environmentsToCreate(environment);
    for (const env of envs) {
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.create(config);
      }
    }
  }

  static async drop(config: DatabaseConfig): Promise<void> {
    const handler = this.resolveTask(config.adapter ?? "");
    if (handler?.drop) {
      await handler.drop(config);
    }
  }

  static async dropAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.checkProtectedEnvironments(config.envName);
      await this.drop(config);
    }
  }

  static async dropCurrent(environment?: string): Promise<void> {
    await this.checkProtectedEnvironments(environment);
    const envs = this._environmentsToDrop(environment);
    for (const env of envs) {
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.drop(config);
      }
    }
  }

  static async migrate(version?: number | string): Promise<void> {
    this.checkTargetVersion(version);
  }

  static async purge(config: DatabaseConfig): Promise<void> {
    const handler = this.resolveTask(config.adapter ?? "");
    if (handler?.purge) {
      await handler.purge(config);
    }
  }

  static async purgeCurrent(environment?: string): Promise<void> {
    await this.checkProtectedEnvironments(environment);
    const env = environment ?? this.env;
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
      await this.purge(config);
    }
  }

  static async truncateAll(environment?: string): Promise<void> {
    await this.checkProtectedEnvironments(environment);
    const env = environment ?? this.env;
    const configs = this.configsFor(env);
    for (const config of configs) {
      const handler = this.resolveTask(config.adapter ?? "");
      if (handler?.truncateAll) {
        await handler.truncateAll(config);
      }
    }
  }

  static async charset(config: DatabaseConfig): Promise<string | null> {
    const handler = this.resolveTask(config.adapter ?? "");
    if (handler?.charset) {
      return handler.charset(config);
    }
    return null;
  }

  static async charsetCurrent(environment?: string): Promise<string | null> {
    const env = environment ?? this.env;
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    return this.charset(configs[0]);
  }

  static async collation(config: DatabaseConfig): Promise<string | null> {
    const handler = this.resolveTask(config.adapter ?? "");
    if (handler?.collation) {
      return handler.collation(config);
    }
    return null;
  }

  static async collationCurrent(environment?: string): Promise<string | null> {
    const env = environment ?? this.env;
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    return this.collation(configs[0]);
  }

  static targetVersion(): number | null {
    const version = process.env.VERSION;
    if (!version || version.trim() === "") return null;
    const parsed = parseInt(version, 10);
    if (isNaN(parsed)) return null;
    return parsed;
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
    const envSchema = process.env.SCHEMA;
    if (envSchema) return envSchema;
    if (config && config.name !== "primary") {
      return `${this.dbDir}/${config.name}_schema.rb`;
    }
    return `${this.dbDir}/schema.rb`;
  }

  static checkSchemaFile(filename: string): void {
    if (!filename || filename.trim() === "") {
      throw new Error("Schema file not specified");
    }
  }

  static async checkProtectedEnvironments(environment?: string): Promise<void> {
    const env = environment ?? this.env;
    const protectedEnvs = ["production"];
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

  static eachLocalConfiguration(): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configurations.filter((c) => {
      if (!c.database) return false;
      const host = c.host;
      return !host || host === "localhost" || host === "127.0.0.1" || host === "" || host === "::1";
    });
  }

  private static _environmentsToCreate(environment?: string): string[] {
    const env = environment ?? this.env;
    if (!environment && (env === "development" || env === "")) {
      return ["development", "test"];
    }
    return [env];
  }

  private static _environmentsToDrop(environment?: string): string[] {
    const env = environment ?? this.env;
    if (!environment && (env === "development" || env === "")) {
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
