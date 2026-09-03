import { type Deprecators } from "@blazetrails/activesupport";
import { env as processEnv } from "@blazetrails/activesupport/process-adapter";
import { SecurePassword, Error as ActiveModelError, deprecator } from "@blazetrails/activemodel";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

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
    BaseTrailtie.register(this);

    this.initializer("active_model.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeModel", deprecator());
    });

    this.initializer("active_model.secure_password", () => {
      SecurePassword.minCost = Trailtie.detectEnv() === "test";
    });

    this.initializer("active_model.i18n_customize_full_message", () => {
      ActiveModelError.i18nCustomizeFullMessage = Trailtie.resolveI18nCustomizeFullMessage({
        i18nCustomizeFullMessage: Trailtie.config.get("i18nCustomizeFullMessage") as
          | boolean
          | undefined,
        activeModel: Trailtie.config.get("activeModel") as ActiveModelConfig | undefined,
      });
    });
  }

  /** @noRailsEquivalent PERMANENT */
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
