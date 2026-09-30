import "./active-model.js";
import "./action-controller.js";
import {
  constantize,
  include,
  type EncryptedConfiguration,
  isPresent,
  onLoad,
  TopLevel,
  upcaseFirst,
  type Deprecators,
} from "@blazetrails/activesupport";
import { except, prepend, Process, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Callbacks } from "@blazetrails/actionpack";
import * as ActiveRecord from "@blazetrails/activerecord";
import {
  ActiveRecordError,
  AsynchronousQueriesTracker,
  AutoFilteredParameters,
  Base,
  ConnectionPool,
  ControllerRuntime,
  LogSubscriber,
  QueryCache,
  Relation,
  SchemaReflection,
  Migration,
  UniquenessValidator,
  deprecator,
  QueryLogs,
  type AutoFilteredParametersApp,
} from "@blazetrails/activerecord";
import type { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import type { PostgreSQLAdapter } from "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import {
  Encryption,
  EncryptedAttributeType,
  EncryptedFixtures,
  EncryptedUniquenessValidator,
  ExtendedDeterministicQueries,
  ExtendedDeterministicUniquenessValidator,
} from "@blazetrails/activerecord/encryption";
import { Trails } from "../rails.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { databaseConfiguration } from "../database.js";

export type ActiveRecordEncryptionConfig = Parameters<typeof Encryption.configure>[0];

export interface ActiveRecordConfig {
  encryption: ActiveRecordEncryptionConfig;
  useSchemaCacheDump: boolean;
  checkSchemaCacheDumpVersion: boolean;
  maintainTestSchema: boolean;
  hasManyInversing: boolean;
  sqlite3AdapterStrictStringsByDefault?: boolean;
  postgresqlAdapterDecodeDates?: boolean;
  queryLogTagsEnabled: boolean;
  queryLogTags: string[];
  queryLogTagsFormat: "legacy" | "sqlcommenter";
  cacheQueryLogTags: boolean;
  raiseOnAssignToAttrReadonly: boolean;
  partialInserts?: boolean;
  belongsToRequiredByDefault?: boolean;
  belongsToRequiredValidatesForeignKey: boolean;
  generateSecureTokenOn: "create" | "initialize";
  queues: Record<string, unknown>;
  migrationError?: "page_load" | false;
  verboseQueryLogs?: boolean;
  dumpSchemaAfterMigration?: boolean;
  attributesForInspect?: string[] | "all";
  databaseSelector?: Record<string, unknown> | null;
  databaseResolver?: unknown;
  databaseResolverContext?: unknown;
  shardSelector?: { lock?: boolean } | null;
  shardResolver?: ((request: unknown) => unknown) | null;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    activeRecord: ActiveRecordConfig;
  }
}

const setTimeZoneAwareAttributes = (base: typeof Base): void => {
  base.timeZoneAwareAttributes = true;
};

const pushTimestamptzToTimeZoneAwareTypes = (base: typeof Base): void => {
  if (!base.timeZoneAwareTypes.includes("timestamptz")) {
    base.timeZoneAwareTypes.push("timestamptz");
  }
};

const setLogSubscriberBacktraceCleaner = (): void => {
  LogSubscriber.backtraceCleaner = Trails.backtraceCleaner;
};

const onPostgresqlAdapterLoadedPushTimestamptz = (): void => {
  onLoad("active_record", { runOnce: true }, pushTimestamptzToTimeZoneAwareTypes);
};

const installEncryptionExtendedQueries = (): void => {
  if (Encryption.config.extendQueries) {
    ExtendedDeterministicQueries.installSupport({ Relation, Base, EncryptedAttributeType });
    ExtendedDeterministicUniquenessValidator.installSupport({
      UniquenessValidator,
      EncryptedUniquenessValidator,
    });
  }
};

const setSqlite3StrictStringsByDefault = (adapter: typeof SQLite3Adapter): void => {
  adapter.strictStringsByDefault = true;
};

const setPostgresqlDecodeDates = (adapter: typeof PostgreSQLAdapter): void => {
  adapter.decodeDates = true;
};

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
  config: { get(key: string): unknown; fileWatcher: unknown };
  credentials(): Promise<EncryptedConfiguration>;
}

/** @noRailsEquivalent PERMANENT */
interface QueryLogsContext {
  connection: {
    pool: { dbConfig: { socket?: string; host?: string; database?: string } };
  };
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeRecord", {
      encryption: {},
      useSchemaCacheDump: true,
      checkSchemaCacheDumpVersion: true,
      maintainTestSchema: true,
      hasManyInversing: false,
      queryLogTagsEnabled: false,
      queryLogTags: ["application"],
      queryLogTagsFormat: "legacy",
      cacheQueryLogTags: false,
      raiseOnAssignToAttrReadonly: false,
      belongsToRequiredValidatesForeignKey: true,
      generateSecureTokenOn: "create",
      queues: {},
    } satisfies ActiveRecordConfig);

    Object.assign(this.config.actionDispatch.rescueResponses, {
      "ActiveRecord::RecordNotFound": ":not_found",
      "ActiveRecord::StaleObjectError": ":conflict",
      "ActiveRecord::RecordInvalid": ":unprocessable_entity",
      "ActiveRecord::RecordNotSaved": ":unprocessable_entity",
    });

    this.config.eagerLoadNamespaces.push(ActiveRecord.ActiveRecord);

    this.initializer("active_record.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeRecord", deprecator());
    });

    this.initializer("active_record.initialize_timezone", () => {
      onLoad("active_record", { runOnce: true }, setTimeZoneAwareAttributes);
    });

    this.initializer("active_record.postgresql_time_zone_aware_types", () => {
      onLoad(
        "active_record_postgresqladapter",
        { runOnce: true },
        onPostgresqlAdapterLoadedPushTimestamptz,
      );
    });

    this.initializer("active_record.backtrace_cleaner", () => {
      onLoad("active_record", { runOnce: true }, setLogSubscriberBacktraceCleaner);
    });

    this.initializer("active_record.migration_error", (app) => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      if (cfg.migrationError === "page_load") {
        this.config.appMiddleware().insertAfter(Callbacks, Migration.CheckPending, {
          fileWatcher: (app as TrailtieApp).config.fileWatcher,
        });
      }
    });

    this.initializer("active_record.copy_schema_cache_config", () => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      SchemaReflection.useSchemaCacheDump = cfg.useSchemaCacheDump;
      SchemaReflection.checkSchemaCacheDumpVersion = cfg.checkSchemaCacheDumpVersion;
    });

    this.initializer("active_record.sqlite3_adapter_strict_strings_by_default", () => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      if (cfg.sqlite3AdapterStrictStringsByDefault) {
        onLoad("active_record_sqlite3adapter", { runOnce: true }, setSqlite3StrictStringsByDefault);
      }
    });

    this.initializer("active_record.postgresql_adapter_decode_dates", () => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      if (cfg.postgresqlAdapterDecodeDates) {
        onLoad("active_record_postgresqladapter", { runOnce: true }, setPostgresqlDecodeDates);
      }
    });

    this.initializer("active_record.set_configs", () => {
      const configs = this.config.get("activeRecord") as Record<string, unknown>;

      this.config.afterInitialize(() => {
        for (const [k, v] of Object.entries(configs)) {
          if (k === "encryption") continue;
          const setter = `set${upcaseFirst(k)}`;
          if (rbObjRespondTo(ActiveRecord, setter)) {
            (ActiveRecord as unknown as Record<string, (v: unknown) => void>)[setter](v);
          }
        }
      });

      onLoad("active_record", (base: typeof Base) => {
        const configsUsedInOtherInitializers = except(
          configs,
          "migrationError",
          "databaseSelector",
          "databaseResolver",
          "databaseResolverContext",
          "shardSelector",
          "shardResolver",
          "queryLogTagsEnabled",
          "queryLogTags",
          "queryLogTagsFormat",
          "cacheQueryLogTags",
          "sqlite3AdapterStrictStringsByDefault",
          "checkSchemaCacheDumpVersion",
          "useSchemaCacheDump",
          "postgresqlAdapterDecodeDates",
        );

        for (const [k, v] of Object.entries(configsUsedInOtherInitializers)) {
          if (k === "encryption") continue;
          const setter = `set${upcaseFirst(k)}`;
          if (rbObjRespondTo(ActiveRecord, setter)) {
            (ActiveRecord as unknown as Record<string, (v: unknown) => void>)[setter](v);
          } else {
            (base as unknown as Record<string, unknown>)[k] = v;
          }
        }
      });
    });

    this.initializer("active_record.initialize_database", async () => {
      let initializeDatabase: Promise<unknown> | undefined;
      onLoad("active_record", (base: typeof Base) => {
        initializeDatabase = (async () => {
          base.configurations(
            (await databaseConfiguration()) as Parameters<typeof base.configurations>[0],
          );

          const pool = await base.establishConnection();

          if (!Trails.env["test?"]()) {
            try {
              await pool.schemaReflection.loadAllBang(pool);
            } catch (error) {
              if (!(error instanceof ActiveRecordError)) throw error;
              console.warn(
                `Failed to load the schema cache because of ${error.constructor.name}: ${error.message}`,
              );
            }
          }
        })();
      });
      await initializeDatabase;
    });

    this.initializer("active_record.set_executor_hooks", () => {
      QueryCache.installExecutorHooks();
      AsynchronousQueriesTracker.installExecutorHooks();
      ConnectionPool.installExecutorHooks();
    });

    this.initializer("active_record.log_runtime", () => {
      onLoad("action_controller", (base: unknown) => {
        include(base as never, ControllerRuntime);
      });
    });

    this.initializer("active_record_encryption.configuration", async (app) => {
      const credentials = await (app as TrailtieApp).credentials();
      onLoad("active_record_encryption", () => {
        Encryption.configure({
          primaryKey: credentials.dig("active_record_encryption", "primary_key") as string,
          deterministicKey: credentials.dig(
            "active_record_encryption",
            "deterministic_key",
          ) as string,
          keyDerivationSalt: credentials.dig(
            "active_record_encryption",
            "key_derivation_salt",
          ) as string,
          ...(this.config.get("activeRecord") as ActiveRecordConfig).encryption,
        });

        const autoFilteredParameters = new AutoFilteredParameters(app as AutoFilteredParametersApp);
        if (Encryption.config.addToFilterParameters) autoFilteredParameters.enable();
      });

      onLoad("active_record", { runOnce: true }, installEncryptionExtendedQueries);

      onLoad("active_record_fixture_set", () => {
        if (Encryption.config.encryptFixtures) {
          prepend(
            (constantize("ActiveRecord::Fixture") as { prototype: object }).prototype,
            EncryptedFixtures,
          );
        }
      });
    });

    this.initializer("active_record.query_log_tags_config", (app) => {
      this.config.afterInitialize(() => {
        const cfg = (app as TrailtieApp).config.get("activeRecord") as ActiveRecordConfig;
        if (cfg.queryLogTagsEnabled) {
          ActiveRecord.queryTransformers().push(QueryLogs);
          QueryLogs.taggings = {
            ...QueryLogs.taggings,
            application: TopLevel.Trails!.application!.constructor.name.split("::")[0],
            pid: () => Process.pid.toString(),
            socket: (context) =>
              (context as unknown as QueryLogsContext).connection.pool.dbConfig.socket,
            db_host: (context) =>
              (context as unknown as QueryLogsContext).connection.pool.dbConfig.host,
            database: (context) =>
              (context as unknown as QueryLogsContext).connection.pool.dbConfig.database,
            source_location: () => QueryLogs.querySourceLocation(),
          };
          ActiveRecord.setDisablePreparedStatements(true);

          if (isPresent(cfg.queryLogTags)) {
            QueryLogs.tags = cfg.queryLogTags;
          }

          if (cfg.queryLogTagsFormat) {
            QueryLogs.tagsFormatter = cfg.queryLogTagsFormat;
          }

          if (cfg.cacheQueryLogTags) {
            QueryLogs.cacheQueryLogTags = true;
          }
        }
      });
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveRecord::Railtie" });
