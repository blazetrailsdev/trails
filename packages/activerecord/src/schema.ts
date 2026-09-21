import { isPresent } from "@blazetrails/activesupport";
import { extend, include, included } from "@blazetrails/ruby-compat";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Current, Migration } from "./migration.js";

export interface SchemaDefineInfo {
  version?: string | number;
}

type DefineBlock<A extends DatabaseAdapter> = (schema: Schema<A>) => void | Promise<void>;

interface DefineClassMethod {
  <A extends DatabaseAdapter = DatabaseAdapter>(block: DefineBlock<A>): Promise<void>;
  <A extends DatabaseAdapter = DatabaseAdapter>(
    info: SchemaDefineInfo,
    block: DefineBlock<A>,
  ): Promise<void>;
}

async function defineClassMethod<A extends DatabaseAdapter>(
  this: new () => Schema<A>,
  info: SchemaDefineInfo | DefineBlock<A> = {},
  block?: DefineBlock<A>,
): Promise<void> {
  if (typeof info === "function") [info, block] = [{}, info];
  await new this().define(info, block!);
}

async function define<A extends DatabaseAdapter>(
  this: Schema<A>,
  info: SchemaDefineInfo,
  block: DefineBlock<A>,
): Promise<void> {
  await this.connectionPool.withConnection(async (connection) => {
    this.connection = connection;
    await block(this);

    await this.connectionPool.schemaMigration.createTable();
    if (isPresent(info.version)) {
      await connection.assumeMigratedUptoVersion(info.version!);
    }

    await this.connectionPool.internalMetadata.createTableAndSetFlags(
      this.connectionPool.migrationContext.currentEnvironment,
    );
  });
}

export const Definition = {
  ClassMethods: { define: defineClassMethod as DefineClassMethod },
  define,
  [included](base: object): void {
    extend(base, Definition.ClassMethods);
  },
};

export class Schema<A extends DatabaseAdapter = DatabaseAdapter> extends Current<A> {
  declare static define: DefineClassMethod;
  declare define: (info: SchemaDefineInfo, block: DefineBlock<A>) => Promise<void>;

  private static _classForVersion?: Map<string | number, typeof Migration>;

  static get(version: string | number): typeof Migration {
    if (!Object.hasOwn(this, "_classForVersion")) this._classForVersion = new Map();
    if (!this._classForVersion!.has(version)) {
      const klass = class extends (Migration.get(version) as new () => object) {};
      include(klass, Definition);
      this._classForVersion!.set(version, klass as unknown as typeof Migration);
    }
    return this._classForVersion!.get(version)!;
  }
}

include(Schema, Definition);
