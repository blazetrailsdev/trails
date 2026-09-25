import "./active-model.js";
import "./action-controller.js";
import {
  constantize,
  include,
  onLoad,
  upcaseFirst,
  type Deprecators,
} from "@blazetrails/activesupport";
import { except, prepend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import * as ActiveRecord from "@blazetrails/activerecord";
import {
  AsynchronousQueriesTracker,
  AutoFilteredParameters,
  Base,
  ConnectionPool,
  ControllerRuntime,
  QueryCache,
  Relation,
  SchemaReflection,
  UniquenessValidator,
  deprecator,
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
  belongsToRequiredValidatesForeignKey: boolean;
  generateSecureTokenOn: "create" | "initialize";
  queues: Record<string, unknown>;
  migrationError?: "page_load" | "raise" | false;
  verboseQueryLogs?: boolean;
  dumpSchemaAfterMigration?: boolean;
  attributesForInspect?: string[] | "all";
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

          return base.establishConnection();
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

    this.initializer("active_record_encryption.configuration", (app) => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      const enc = cfg.encryption;
      if (enc && Object.keys(enc).length > 0) {
        Encryption.configure(enc);
      }

      const autoFilteredParameters = new AutoFilteredParameters(app as AutoFilteredParametersApp);
      if (Encryption.config.addToFilterParameters) autoFilteredParameters.enable();

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
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveRecord::Railtie" });
