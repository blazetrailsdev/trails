import { onLoad, Trailtie as BaseTrailtie, registerTrailtie } from "@blazetrails/activesupport";
import type { Deprecators } from "@blazetrails/activesupport";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { Base } from "./base.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { QueryCache } from "./query-cache.js";
import { Configurable as EncryptionConfigurable } from "./encryption/configurable.js";
import { installExtendedQueriesIfConfigured } from "./encryption/install.js";
import {
  AutoFilteredParameters,
  type AutoFilteredParametersApp,
} from "./encryption/auto-filtered-parameters.js";
import { SchemaReflection } from "./connection-adapters/schema-cache.js";
import type { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import type { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
import { deprecator } from "./deprecator.js";
import {
  processAction,
  cleanupViewRuntime,
  appendInfoToPayload,
} from "./trailties/controller-runtime.js";
import { instrument } from "./trailties/job-runtime.js";
import { ActiveRecord } from "./ar-config.js";

export const ControllerRuntime = { processAction, cleanupViewRuntime, appendInfoToPayload };
export const JobRuntime = { instrument };

type FrameworkDefaultsEntry = {
  partialInserts?: boolean;
  raiseOnAssignToAttrReadonly?: boolean;
};

const KNOWN_VERSIONS = new Set(["5.0", "5.1", "5.2", "6.0", "6.1", "7.0", "7.1", "7.2", "8.0"]);

const FRAMEWORK_DEFAULTS: Array<[string, FrameworkDefaultsEntry]> = [
  ["7.0", { partialInserts: false }],
  ["7.1", { raiseOnAssignToAttrReadonly: true }],
];

function compareVersions(a: string, b: string): number {
  const [aMaj = 0, aMin = 0] = a.split(".").map(Number);
  const [bMaj = 0, bMin = 0] = b.split(".").map(Number);
  return aMaj !== bMaj ? aMaj - bMaj : aMin - bMin;
}

export function loadDefaults(version: string): void {
  if (!KNOWN_VERSIONS.has(version)) {
    throw new Error(`Unknown version ${JSON.stringify(version)}`);
  }
  for (const [v, defaults] of FRAMEWORK_DEFAULTS) {
    if (compareVersions(v, version) <= 0) {
      if (defaults.partialInserts !== undefined) Base.partialInserts = defaults.partialInserts;
      if (defaults.raiseOnAssignToAttrReadonly !== undefined) {
        ActiveRecord.raiseOnAssignToAttrReadonly = defaults.raiseOnAssignToAttrReadonly;
      }
    }
  }
}

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
  belongsToRequiredValidatesForeignKey: boolean;
  generateSecureTokenOn: "create" | "initialize";
  queues: Record<string, unknown>;
}

function defaultActiveRecordConfig(): ActiveRecordConfig {
  return {
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
  };
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
    registerTrailtie(this);

    this.config["activeRecord"] = defaultActiveRecordConfig();

    this.initializer("active_record.deprecator", (app) => {
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
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      SchemaReflection.useSchemaCacheDump = cfg.useSchemaCacheDump;
      SchemaReflection.checkSchemaCacheDumpVersion = cfg.checkSchemaCacheDumpVersion;
    });

    this.initializer("active_record.sqlite3_adapter_strict_strings_by_default", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      if (cfg.sqlite3AdapterStrictStringsByDefault) {
        onLoad("active_record_sqlite3adapter", { runOnce: true }, setSqlite3StrictStringsByDefault);
      }
    });

    this.initializer("active_record.postgresql_adapter_decode_dates", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      if (cfg.postgresqlAdapterDecodeDates) {
        onLoad("active_record_postgresqladapter", { runOnce: true }, setPostgresqlDecodeDates);
      }
    });

    this.initializer("active_record.set_configs", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      ActiveRecord.maintainTestSchema = cfg.maintainTestSchema;
      ActiveRecord.raiseOnAssignToAttrReadonly = cfg.raiseOnAssignToAttrReadonly;
      ActiveRecord.belongsToRequiredValidatesForeignKey = cfg.belongsToRequiredValidatesForeignKey;
      ActiveRecord.generateSecureTokenOn = cfg.generateSecureTokenOn;
      ActiveRecord.queues = cfg.queues;
    });

    this.initializer("active_record.set_executor_hooks", () => {
      QueryCache.installExecutorHooks();
      AsynchronousQueriesTracker.installExecutorHooks();
      ConnectionPool.installExecutorHooks();
    });

    this.initializer("active_record_encryption.configuration", (app) => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
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
