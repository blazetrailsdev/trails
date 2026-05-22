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
import type { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import type { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
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
export type ActiveRecordEncryptionConfig = Parameters<typeof EncryptionConfigurable.configure>[0];

export interface ActiveRecordConfig {
  encryption: ActiveRecordEncryptionConfig;
  useSchemaCacheDump: boolean;
  checkSchemaCacheDumpVersion: boolean;
  maintainTestSchema: boolean;
  hasManyInversing: boolean;
  /**
   * Rails 8 opt-in flag (`config.active_record.sqlite3_adapter_strict_strings_by_default`).
   * Defaults to nil in Rails — only assigned to the adapter when truthy.
   */
  sqlite3AdapterStrictStringsByDefault?: boolean;
  /**
   * Rails opt-in flag (`config.active_record.postgresql_adapter_decode_dates`).
   * Defaults to nil in Rails — only assigned to the adapter when truthy.
   */
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

// onLoad callbacks are module-level consts so that repeated
// `Trailtie.runInitializers()` calls (common in tests) register the same
// callback reference with `{ once: true }`, preventing the hook registry
// from growing unboundedly.
const setTimeZoneAwareAttributes = (base: typeof Base): void => {
  base.timeZoneAwareAttributes = true;
};

const pushTimestamptzToTimeZoneAwareTypes = (base: typeof Base): void => {
  if (!base.timeZoneAwareTypes.includes("timestamptz")) {
    base.timeZoneAwareTypes.push("timestamptz");
  }
};

const onPostgresqlAdapterLoadedPushTimestamptz = (): void => {
  onLoad("active_record", { once: true }, pushTimestamptzToTimeZoneAwareTypes);
};

const setSqlite3StrictStringsByDefault = (adapter: typeof SQLite3Adapter): void => {
  adapter.strictStringsByDefault = true;
};

const setPostgresqlDecodeDates = (adapter: typeof PostgreSQLAdapter): void => {
  adapter.decodeDates = true;
};

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["activeRecord"] = defaultActiveRecordConfig();

    this.initializer("active_record.deprecator", () => {
      BaseRailtie.deprecators["activeRecord"] = deprecator();
    });

    this.initializer("active_record.initialize_timezone", () => {
      // Rails: `ActiveSupport.on_load(:active_record) { self.time_zone_aware_attributes = true }`.
      onLoad("active_record", { once: true }, setTimeZoneAwareAttributes);
    });

    this.initializer("active_record.postgresql_time_zone_aware_types", () => {
      // Rails (railtie.rb:89-95):
      //   on_load(:active_record_postgresqladapter) do
      //     on_load(:active_record) { Base.time_zone_aware_types << :timestamptz }
      //   end
      // No config gate — Rails pushes unconditionally when the PG adapter is
      // loaded. We add an `includes` check so the consumer is safely
      // idempotent (Rails' `<<` would duplicate on hypothetical re-runs).
      onLoad(
        "active_record_postgresqladapter",
        { once: true },
        onPostgresqlAdapterLoadedPushTimestamptz,
      );
    });

    this.initializer("active_record.copy_schema_cache_config", () => {
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      SchemaReflection.useSchemaCacheDump = cfg.useSchemaCacheDump;
      SchemaReflection.checkSchemaCacheDumpVersion = cfg.checkSchemaCacheDumpVersion;
    });

    this.initializer("active_record.sqlite3_adapter_strict_strings_by_default", () => {
      // Rails: only sets to `true` when the flag is true (no-op otherwise),
      // gated on `on_load(:active_record_sqlite3adapter)`.
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      if (cfg.sqlite3AdapterStrictStringsByDefault) {
        onLoad("active_record_sqlite3adapter", { once: true }, setSqlite3StrictStringsByDefault);
      }
    });

    this.initializer("active_record.postgresql_adapter_decode_dates", () => {
      // Rails: only sets to `true` when the flag is true (no-op otherwise),
      // gated on `on_load(:active_record_postgresqladapter)`.
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      if (cfg.postgresqlAdapterDecodeDates) {
        onLoad("active_record_postgresqladapter", { once: true }, setPostgresqlDecodeDates);
      }
    });

    this.initializer("active_record_encryption.configuration", () => {
      // Rails (railtie.rb:336-363) also reads app.credentials and registers
      // AutoFilteredParameters / ExtendedDeterministicQueries / EncryptedFixtures.
      // Credentials wiring needs the Application instance (deferred), and
      // the load events `:active_record_encryption` / `:active_record_fixture_set`
      // aren't yet emitted by their respective modules. For now we forward
      // `config.activeRecord.encryption` to Encryption.Configurable.configure
      // which is the single behavior-load-bearing piece (Encryption.config
      // is what runtime callsites read).
      const cfg = this.config["activeRecord"] as ActiveRecordConfig;
      const enc = cfg.encryption;
      if (enc && Object.keys(enc).length > 0) {
        EncryptionConfigurable.configure(enc);
      }
    });
  }
}
