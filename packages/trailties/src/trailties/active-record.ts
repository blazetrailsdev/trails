import "./active-model.js";
import "./action-controller.js";
import { onLoad, type Deprecators } from "@blazetrails/activesupport";
import {
  ActiveRecord,
  AsynchronousQueriesTracker,
  Base,
  ConnectionPool,
  QueryCache,
  AutoFilteredParameters,
  type AutoFilteredParametersApp,
  SchemaReflection,
  deprecator,
} from "@blazetrails/activerecord";
import type { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import type { PostgreSQLAdapter } from "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import { Configurable as EncryptionConfigurable } from "@blazetrails/activerecord/encryption";
import { installExtendedQueriesIfConfigured } from "@blazetrails/activerecord/encryption/install";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";

export type ActiveRecordEncryptionConfig = Parameters<typeof EncryptionConfigurable.configure>[0];

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
  installExtendedQueriesIfConfigured();
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
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      ActiveRecord.maintainTestSchema = cfg.maintainTestSchema;
      ActiveRecord.raiseOnAssignToAttrReadonly = cfg.raiseOnAssignToAttrReadonly;
      ActiveRecord.belongsToRequiredValidatesForeignKey = cfg.belongsToRequiredValidatesForeignKey;
      ActiveRecord.generateSecureTokenOn = cfg.generateSecureTokenOn;
      ActiveRecord.queues = cfg.queues;
      const partialInserts = cfg.partialInserts;
      if (partialInserts !== undefined) {
        onLoad("active_record", (base: typeof Base) => {
          base.partialInserts = partialInserts;
        });
      }
    });

    this.initializer("active_record.set_executor_hooks", () => {
      QueryCache.installExecutorHooks();
      AsynchronousQueriesTracker.installExecutorHooks();
      ConnectionPool.installExecutorHooks();
    });

    this.initializer("active_record_encryption.configuration", (app) => {
      const cfg = this.config.get("activeRecord") as ActiveRecordConfig;
      const enc = cfg.encryption;
      if (enc && Object.keys(enc).length > 0) {
        EncryptionConfigurable.configure(enc);
      }

      const autoFilteredParameters = new AutoFilteredParameters(app as AutoFilteredParametersApp);
      if (EncryptionConfigurable.config.addToFilterParameters) autoFilteredParameters.enable();

      onLoad("active_record", { runOnce: true }, installEncryptionExtendedQueries);
    });
  }
}

setRubyClassPath(Trailtie, "ActiveRecord::Railtie");
