import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { env as processEnv } from "@blazetrails/activesupport/process-adapter";
import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";
import { deprecator } from "./deprecator.js";

export interface ActiveModelConfig {
  i18nCustomizeFullMessage?: boolean;
}

export interface TrailtieConfig {
  env?: string;
  /** @deprecated Use `activeModel.i18nCustomizeFullMessage` instead. Kept for backwards compat. */
  i18nCustomizeFullMessage?: boolean;
  activeModel?: ActiveModelConfig;
}

/**
 * Trailtie — initialization hooks for ActiveModel.
 *
 * Mirrors: ActiveModel::Railtie < ::Rails::Railtie
 * (activemodel/lib/active_model/railtie.rb)
 *
 * Extends the base Railtie exported from `@blazetrails/activesupport`,
 * matching the Rails inheritance pattern, and registers itself so it
 * participates in the global initialization pipeline.
 */
export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.initializer("active_model.deprecator", () => {
      BaseRailtie.deprecators["activeModel"] = deprecator();
    });

    this.initializer("active_model.secure_password", () => {
      SecurePassword.minCost = Trailtie.detectEnv() === "test";
    });

    this.initializer("active_model.i18n_customize_full_message", () => {
      ActiveModelError.i18nCustomizeFullMessage = Trailtie.resolveI18nCustomizeFullMessage(
        Trailtie.config as TrailtieConfig,
      );
    });
  }

  /**
   * One-shot configuration helper (non-Rails convenience kept for
   * backwards-compat with existing callers).
   */
  static initialize(config?: TrailtieConfig): void {
    const env = config?.env ?? Trailtie.detectEnv();
    SecurePassword.minCost = env === "test";
    ActiveModelError.i18nCustomizeFullMessage = Trailtie.resolveI18nCustomizeFullMessage(config);
  }

  private static resolveI18nCustomizeFullMessage(cfg?: TrailtieConfig): boolean {
    return cfg?.activeModel?.i18nCustomizeFullMessage ?? cfg?.i18nCustomizeFullMessage ?? false;
  }

  private static detectEnv(): string {
    // processEnv is the activesupport process-adapter snapshot —
    // populated at module load on Node, empty on browser hosts. Either
    // way, no `typeof process !== "undefined"` guard needed. Aliased to
    // avoid shadowing the local `env` variable in `initialize()` and
    // the `TrailtieConfig.env` property.
    //
    // Mirrors Rails' RAILS_ENV: TRAILS_ENV only. We deliberately do
    // NOT fall back to NODE_ENV — the JS ecosystem treats NODE_ENV as
    // a build-time hint (bundler optimization, dependency dead-code
    // elimination), not a runtime environment selector. Conflating
    // the two has bitten us: a script running with NODE_ENV=test
    // silently dropping into test-mode SecurePassword.minCost
    // settings is the kind of action-at-a-distance we want to avoid.
    return processEnv.TRAILS_ENV || "development";
  }
}
