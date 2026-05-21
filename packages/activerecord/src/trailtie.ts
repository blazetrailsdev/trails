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
 * Unported targets (rake tasks, console/runner hooks, on_load callback
 * registry, migration_error middleware insertion, schema-cache-config
 * copy, define_attribute_methods, sqlite3/postgresql adapter strict
 * defaults, set_configs setter-dispatch loop, set_reloader_hooks,
 * set_executor_hooks, watchable_files, encryption.configuration,
 * query_log_tags_config, log_runtime subscriber) are intentionally left
 * out for now — they each depend on Rails infrastructure that has not yet
 * been ported to trails. See docs/trailties-plan.md PR 2.7 follow-ups.
 */
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { Base } from "./base.js";
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

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["activeRecord"] = defaultActiveRecordConfig();

    this.initializer("active_record.deprecator", () => {
      BaseRailtie.deprecators["activeRecord"] = deprecator();
    });

    this.initializer("active_record.initialize_timezone", () => {
      // Rails: `ActiveSupport.on_load(:active_record) { self.time_zone_aware_attributes = true }`.
      // The on_load registry isn't ported yet, so apply directly to Base.
      Base.timeZoneAwareAttributes = true;
    });
  }
}
