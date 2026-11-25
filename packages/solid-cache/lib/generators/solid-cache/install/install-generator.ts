import "../../../constants.solid-cache-install-install-generator.generated.js";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { File, Pathname, RuntimeError, rbInspect } from "@blazetrails/ruby-compat";
import type * as ThorActions from "@blazetrails/thor/actions";
import { Trails } from "@blazetrails/trailties";
import type {} from "@blazetrails/trailties/trailties/active-record";
import { Base } from "@blazetrails/trailties/generators";

export class InstallGenerator extends Base {
  static {
    this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );
    this.methodAdded("copyFiles");
    this.methodAdded("configureCacheStoreAdapter");
  }

  declare copyFile: OmitThisParameter<typeof ThorActions.Actions.copyFile>;

  /** @missingRailsArgs template — CONVERGEABLE solid-cache-install-generator-writes-cache-yml */
  async copyFiles(): Promise<void> {
    await this.template("config/cache.ts");

    if (Trails.application!.config.activeRecord.schemaFormat === "sql") {
      await this.copySqlSchemaForAdapter();
    } else {
      await this.template("db/cache_schema.ts");
    }
  }

  async configureCacheStoreAdapter(): Promise<void> {
    await this.gsubFile(
      new Pathname(this.destinationRoot).join("config/environments/production.ts").toPath(),
      /(\/\/ )?this\.config\.cacheStore = (".*")/,
      'this.config.cacheStore = ":solid_cache_store"',
    );
  }

  /** @internal */
  private async copySqlSchemaForAdapter(): Promise<void> {
    const sqlFile = this.sqlSchemaFileForAdapter();

    if (sqlFile != null) {
      await this.copyFile(sqlFile, "db/cache_structure.sql");
    } else {
      this.raiseUnsupportedAdapterError();
    }
  }

  /** @internal */
  private sqlSchemaFileForAdapter(): string | null {
    switch (ActiveRecordBase.connectionDbConfig().adapter) {
      case "postgresql":
        return "db/cache_structure.postgresql.sql";
      case "mysql2":
      case "trilogy":
        return "db/cache_structure.mysql.sql";
      case "sqlite3":
        return "db/cache_structure.sqlite3.sql";
      default:
        return null;
    }
  }

  /** @internal */
  private raiseUnsupportedAdapterError(): never {
    const errorMessage = `
ERROR: Unsupported database adapter for SQL schema format: ${rbInspect(ActiveRecordBase.connectionDbConfig().adapter)}

SolidCache supports installing for the following Rails adapters with schema_format = :sql:
  - PostgreSQL (postgresql)
  - MySQL (mysql2, trilogy)
  - SQLite (sqlite3)
`;

    throw new RuntimeError(errorMessage);
  }
}
