/**
 * Trailtie — initialization hooks for ActiveSupport.
 *
 * Mirrors: ActiveSupport::Railtie < ::Rails::Railtie
 * (activesupport/lib/active_support/railtie.rb)
 *
 * Only the initializers whose targets are already ported to trails are
 * wired here. The rest are documented as skipped on the PR (and become
 * follow-ups as the underlying helpers land):
 *
 *   - active_support.isolation_level — IsolatedExecutionState has no
 *     `isolationLevel` setter yet
 *   - active_support.raise_on_invalid_cache_expiration_time — Cache::Store
 *     has no equivalent flag
 *   - active_support.set_authenticated_message_encryption — MessageEncryptor
 *     has no `useAuthenticatedMessageEncryption` toggle
 *   - active_support.reset_execution_context — no reloader/executor in trails
 *   - active_support.reset_all_current_attributes_instances — same
 *   - active_support.initialize_time_zone — no TZInfo binding
 *   - active_support.to_time_preserves_timezone — flag not ported
 *   - active_support.initialize_beginning_of_week — Date.beginning_of_week
 *     not ported
 *   - active_support.require_master_key — credentials key lookup runs
 *     elsewhere
 *   - active_support.set_configs — generic setter-dispatch loop;
 *     intentionally deferred until each target landed
 *   - active_support.set_key_generator_hash_digest_class — KeyGenerator's
 *     hashDigestClass is per-instance, not class-level
 *   - active_support.set_default_message_serializer — Messages::Codec not
 *     ported
 *   - active_support.set_use_message_serializer_for_metadata — same
 */
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import {
  deprecator,
  type Deprecation,
  type Deprecators,
  type DeprecationBehavior,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";

type HashDigestClass = typeof Digest.hashDigestClass;

type DeprecationCallable = (...args: unknown[]) => void;
type BehaviorSetting = DeprecationBehavior | DeprecationBehavior[] | DeprecationCallable | null;
type DisallowedBehaviorSetting = DeprecationBehavior | DeprecationCallable | null;

export interface ActiveSupportConfig {
  hashDigestClass?: HashDigestClass;
  reportDeprecations?: boolean;
  deprecation?: BehaviorSetting;
  disallowedDeprecation?: DisallowedBehaviorSetting;
  disallowedDeprecationWarnings?: Deprecation["disallowedWarnings"];
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  config: { get(key: string): unknown };
  deprecators: Deprecators;
}

/**
 * Trailtie wiring for ActiveSupport.
 *
 * Mirrors: ActiveSupport::Railtie (activesupport/lib/active_support/railtie.rb)
 */
export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    // Mirrors `config.active_support = ActiveSupport::OrderedOptions.new`.
    if (this.config.get("activeSupport") === undefined) this.config.set("activeSupport", {});

    this.initializer("active_support.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeSupport", deprecator());
    });

    this.initializer("active_support.deprecation_behavior", (app) => {
      const activeSupport =
        ((app as TrailtieApp).config.get("activeSupport") as ActiveSupportConfig | undefined) ??
        (this.config.get("activeSupport") as ActiveSupportConfig | undefined) ??
        {};
      const deprecators = (app as TrailtieApp).deprecators;
      if (activeSupport.reportDeprecations === false) {
        deprecators.setSilenced(true);
        deprecators.setBehavior("silence");
        deprecators.setDisallowedBehavior("silence");
      } else {
        const deprecation = activeSupport.deprecation;
        if (deprecation != null) {
          deprecators.setBehavior(deprecation);
        }

        const disallowedDeprecation = activeSupport.disallowedDeprecation;
        if (disallowedDeprecation != null) {
          deprecators.setDisallowedBehavior(disallowedDeprecation);
        }

        const disallowedWarnings = activeSupport.disallowedDeprecationWarnings;
        if (disallowedWarnings != null) {
          deprecators.setDisallowedWarnings(disallowedWarnings);
        }
      }
    });

    this.initializer("active_support.set_hash_digest_class", () => {
      const klass = (this.config.get("activeSupport") as ActiveSupportConfig | undefined)
        ?.hashDigestClass;
      if (klass) {
        Digest.hashDigestClass = klass;
      }
    });
  }
}
