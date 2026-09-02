import {
  Trailtie as BaseTrailtie,
  registerTrailtie,
  type Deprecators,
} from "@blazetrails/activesupport";
import { env as processEnv } from "@blazetrails/activesupport/process-adapter";
import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";
import { deprecator } from "./deprecator.js";

export interface ActiveModelConfig {
  i18nCustomizeFullMessage?: boolean;
}

export interface TrailtieConfig {
  env?: string;
  /** @deprecated */
  i18nCustomizeFullMessage?: boolean;
  activeModel?: ActiveModelConfig;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    registerTrailtie(this);

    this.initializer("active_model.deprecator", (app) => {
      (app as TrailtieApp).deprecators.set("activeModel", deprecator());
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

  static initialize(config?: TrailtieConfig): void {
    const env = config?.env ?? Trailtie.detectEnv();
    SecurePassword.minCost = env === "test";
    ActiveModelError.i18nCustomizeFullMessage = Trailtie.resolveI18nCustomizeFullMessage(config);
  }

  private static resolveI18nCustomizeFullMessage(cfg?: TrailtieConfig): boolean {
    return cfg?.activeModel?.i18nCustomizeFullMessage ?? cfg?.i18nCustomizeFullMessage ?? false;
  }

  private static detectEnv(): string {
    return processEnv.TRAILS_ENV || "development";
  }
}
