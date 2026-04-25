import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";

export interface RailtieConfig {
  env?: string;
  i18nCustomizeFullMessage?: boolean;
}

/**
 * Railtie — initialization hooks for ActiveModel.
 *
 * Mirrors: ActiveModel::Railtie < ::Rails::Railtie
 * (activemodel/lib/active_model/railtie.rb)
 *
 * Extends the base Railtie exported from `@blazetrails/activesupport`,
 * matching the Rails inheritance pattern, and registers itself so it
 * participates in the global initialization pipeline.
 */
export class Railtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.initializer("active_model.secure_password", () => {
      SecurePassword.minCost = Railtie.detectEnv() === "test";
    });
  }

  /**
   * One-shot configuration helper (non-Rails convenience kept for
   * backwards-compat with existing callers).
   */
  static initialize(config?: RailtieConfig): void {
    const env = config?.env ?? Railtie.detectEnv();
    SecurePassword.minCost = env === "test";
    ActiveModelError.i18nCustomizeFullMessage = config?.i18nCustomizeFullMessage ?? false;
  }

  private static detectEnv(): string {
    return (typeof process !== "undefined" && process.env?.NODE_ENV) || "development";
  }
}
