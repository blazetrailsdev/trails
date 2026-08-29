import { getEnv, isPresent } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Current } from "./migration.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";

export interface SchemaDefineInfo {
  version?: string | number;
  environment?: string;
}

export class Schema<A extends DatabaseAdapter = DatabaseAdapter> extends Current<A> {
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    fn: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void>;
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    info: SchemaDefineInfo,
    fn: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void>;
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    infoOrFn: SchemaDefineInfo | ((schema: Schema<A>) => void | Promise<void>),
    fnOpt?: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void> {
    const {
      info,
      block,
    }: { info: SchemaDefineInfo; block: (s: Schema<A>) => void | Promise<void> } =
      typeof infoOrFn === "function"
        ? { info: {}, block: infoOrFn }
        : { info: infoOrFn, block: fnOpt! };

    await new Schema<A>().define(info, block);
  }

  async define(
    info: SchemaDefineInfo,
    block: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void> {
    await this.connectionPool.withConnection(async (connection) => {
      this.connection = connection;
      await block(this as Schema<A>);

      const schemaMigration = new SchemaMigration(this.connectionPool);
      await schemaMigration.createTable();
      if (isPresent(info.version)) {
        await connection.assumeMigratedUptoVersion(info.version!);
      }
      const currentEnvironment =
        info.environment ??
        getEnv("TRAILS_ENV") ??
        getEnv("NODE_ENV") ??
        DatabaseConfigurations.defaultEnv;
      const internalMetadata = new InternalMetadata(this.connectionPool);
      await internalMetadata.createTableAndSetFlags(currentEnvironment);
    });
  }

  constructor(adapter?: A) {
    super();
    this.connection = adapter;
  }
}

export interface Definition {
  define(info: SchemaDefineInfo, block: (schema: Schema) => void | Promise<void>): Promise<void>;
}
