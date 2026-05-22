/**
 * Trailtie — initialization hooks for ActiveRecord.
 *
 * Mirrors: ActiveRecord::Railtie < Rails::Railtie (railtie.rb)
 *
 * Extends the base Railtie from `@blazetrails/activesupport`, registers
 * itself in the global initialization pipeline, and seeds the
 * `config.activeRecord` namespace with the same defaults Rails sets at the
 * top of `activerecord/lib/active_record/railtie.rb` (the
 * `ActiveSupport::OrderedOptions` block).
 *
 * Also re-exports the ActionController and ActiveJob mixin objects that
 * `railtie.rb` wires into those frameworks:
 *   - `ControllerRuntime` — SQL runtime tracking per request
 *   - `JobRuntime` — SQL runtime tracking per job
 *
 * Unported targets (rake tasks, console/runner hooks, migration_error
 * middleware insertion, set_configs setter-dispatch loop, set_reloader_hooks,
 * set_executor_hooks, watchable_files, log_runtime subscriber,
 * clear_active_connections, set_filter_attributes,
 * set_signed_id_verifier_secret, logger, backtrace_cleaner) are intentionally
 * left out for now — they each depend on either an Application-instance
 * argument to the initializer block (which `Railtie.initializer` does not
 * supply) or on Trails-level infrastructure that has not yet been ported.
 * See docs/trailties-plan.md PR 2.7 follow-ups.
 */
import { onLoad, Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { Configurable as EncryptionConfigurable } from "./encryption/configurable.js";
import { SchemaReflection } from "./connection-adapters/schema-cache.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
import { deprecator } from "./deprecator.js";
import {
  processAction,
  cleanupViewRuntime,
  appendInfoToPayload,
} from "./trailties/controller-runtime.js";
import { instrument } from "./trailties/job-runtime.js";

export const ControllerRuntime = { processAction, cleanupViewRuntime, appendInfoToPayload };
export const JobRuntime = { instrument };

/**
 * Shape of `config.activeRecord` — mirrors the
 * `ActiveSupport::OrderedOptions` block at the top of Rails' railtie.rb.
 */
export interface ActiveRecordEncryptionConfig {
  [key: string]: unknown;
}

export interface ActiveRecordConfig {
  encryption: ActiveRecordEncryptionConfig;
  useSchemaCacheDump: boolean;
  checkSchemaCacheDumpVersion: boolean;
  maintainTestSchema: boolean;
  hasManyInversing: boolean;
  postgresqlTimeZoneAwareTypes: boolean;
  sqlite3AdapterStrictStringsByDefault: boolean;
  postgresqlAdapterDecodeDates: boolean;
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
    postgresqlTimeZoneAwareTypes: true,
    sqlite3AdapterStrictStringsByDefault: false,
    postgresqlAdapterDecodeDates: false,
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

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["activeRecord"] = defaultActiveRecordConfig();

    this.initializer("active_record.deprecator", () => {
      BaseRailtie.deprecators["activeRecord"] = deprecator();
    });

    this.initializer("active_record.initialize_timezone", () => {
      // Rails: `ActiveSupport.on_load(:active_record) { self.time_zone_aware_attributes = true }`.
      onLoad("active_record", (base: typeof Base) => {
        base.timeZoneAwareAttributes = true;
      });
    });

    this.initializer("active_record.postgresql_time_zone_aware_types", () => {
      // Rails: removes then conditionally re-adds `:timestamptz` so the
      // initializer is idempotent under repeated `runInitializers` calls.
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      onLoad("active_record", (base: typeof Base) => {
        base.timeZoneAwareTypes = base.timeZoneAwareTypes.filter((t) => t !== "timestamptz");
        if (cfg.postgresqlTimeZoneAwareTypes) base.timeZoneAwareTypes.push("timestamptz");
      });
    });

    this.initializer("active_record.copy_schema_cache_config", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      SchemaReflection.useSchemaCacheDump = cfg.useSchemaCacheDump;
      SchemaReflection.checkSchemaCacheDumpVersion = cfg.checkSchemaCacheDumpVersion;
    });

    this.initializer("active_record.sqlite3_adapter_strict_strings_by_default", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      SQLite3Adapter.strictStringsByDefault = cfg.sqlite3AdapterStrictStringsByDefault;
    });

    this.initializer("active_record.postgresql_adapter_decode_dates", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      PostgreSQLAdapter.decodeDates = cfg.postgresqlAdapterDecodeDates;
    });

    this.initializer("active_record_encryption.configuration", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      const enc = cfg.encryption;
      if (enc && Object.keys(enc).length > 0) {
        EncryptionConfigurable.configure(
          enc as Parameters<typeof EncryptionConfigurable.configure>[0],
        );
      }
    });
  }
}
