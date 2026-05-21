/**
 * Trailtie — initialization hooks for ActiveSupport.
 *
 * Mirrors: ActiveSupport::Railtie < ::Rails::Railtie
 * (activesupport/lib/active_support/railtie.rb)
 *
 * Resolves docs/trailties-plan.md open question #2: the activesupport
 * trailtie lives **inside the trailties package** (not in activesupport
 * itself) so the dependency direction stays trailties → activesupport.
 * Putting it under `packages/activesupport/src/` would force activesupport
 * to depend on `@blazetrails/activesupport`'s own Railtie base via a
 * self-import, and worse, would couple the leaf framework to the
 * application-runner concept it should stay agnostic of.
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
import {
  Railtie as BaseRailtie,
  registerRailtie,
  deprecator,
  type Deprecation,
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
  disallowedDeprecationWarnings?: (string | RegExp | "all")[];
}

/**
 * Trailtie wiring for ActiveSupport.
 *
 * Mirrors: ActiveSupport::Railtie (activesupport/lib/active_support/railtie.rb)
 */
export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    // Mirrors `config.active_support = ActiveSupport::OrderedOptions.new`.
    this.config["activeSupport"] ??= {};

    this.initializer("active_support.deprecator", () => {
      BaseRailtie.deprecators["activeSupport"] = deprecator;
    });

    // ORDERING CAVEAT: in Rails, every `<framework>.deprecator` initializer
    // is annotated `before: :load_environment_config`, while
    // `active_support.deprecation_behavior` carries no `before:` — so by the
    // time this fires, *every* framework's deprecator has been registered
    // and Rails' `app.deprecators` proxy iterates them all. Our BaseRailtie
    // does not yet support `before:`/`after:` initializer ordering, and
    // `app.deprecators` is a plain `Record`, not a proxy that tracks future
    // additions. This means a framework whose `.deprecator` initializer
    // runs *after* this block (registration order) won't get these
    // settings applied. The Rails-shaped fix lives on BaseRailtie
    // (ordering + DeprecatorsProxy) and is a follow-up on PR 2.7a, not a
    // local patch here.
    this.initializer("active_support.deprecation_behavior", () => {
      const cfg = (this.config["activeSupport"] as ActiveSupportConfig | undefined) ?? {};
      const all = Object.values(BaseRailtie.deprecators).filter((d): d is Deprecation => d != null);
      if (cfg.reportDeprecations === false) {
        for (const d of all) {
          d.silenced = true;
          d.behavior = "silence";
          d.disallowedBehavior = "silence";
        }
        return;
      }
      if (cfg.deprecation !== undefined) {
        for (const d of all) d.behavior = cfg.deprecation;
      }
      if (cfg.disallowedDeprecation !== undefined) {
        for (const d of all) d.disallowedBehavior = cfg.disallowedDeprecation;
      }
      if (cfg.disallowedDeprecationWarnings !== undefined) {
        for (const d of all) d.disallowedWarnings = cfg.disallowedDeprecationWarnings;
      }
    });

    this.initializer("active_support.set_hash_digest_class", () => {
      const klass = (this.config["activeSupport"] as ActiveSupportConfig | undefined)
        ?.hashDigestClass;
      if (klass) {
        Digest.hashDigestClass = klass;
      }
    });
  }
}
