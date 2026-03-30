import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";

export interface RailtieConfig {
  env?: string;
  i18nCustomizeFullMessage?: boolean;
}

/**
 * Railtie — initialization hooks for ActiveModel.
 *
 * Mirrors: ActiveModel::Railtie
 *
 * In Rails, the Railtie sets:
 *   - ActiveModel::SecurePassword.min_cost based on environment
 *   - ActiveModel::Error.i18n_customize_full_message from config
 *
 * Since we don't have a full Rails application context, the Railtie
 * exposes a static `initialize` method that applies the same defaults.
 */
export class Railtie {
  static initialize(config?: RailtieConfig): void {
    const env = config?.env ?? Railtie.detectEnv();

    SecurePassword.minCost = env === "test";

    ActiveModelError.i18nCustomizeFullMessage = config?.i18nCustomizeFullMessage ?? false;
  }

  private static detectEnv(): string {
    return (typeof process !== "undefined" && process.env?.NODE_ENV) || "development";
  }
}
