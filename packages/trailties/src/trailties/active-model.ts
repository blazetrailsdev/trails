import { type Deprecators } from "@blazetrails/activesupport";
import { env as processEnv } from "@blazetrails/ruby-compat";
import { SecurePassword, Error as ActiveModelError, deprecator } from "@blazetrails/activemodel";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";

export interface ActiveModelConfig {
  i18nCustomizeFullMessage?: boolean;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeModel", {} satisfies ActiveModelConfig);

    this.initializer("active_model.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeModel", deprecator());
    });

    this.initializer("active_model.secure_password", () => {
      SecurePassword.minCost = Trailtie.detectEnv() === "test";
    });

    this.initializer("active_model.i18n_customize_full_message", () => {
      const activeModel = this.config.get("activeModel") as ActiveModelConfig;
      const i18nCustomizeFullMessage = activeModel.i18nCustomizeFullMessage;
      delete activeModel.i18nCustomizeFullMessage;
      ActiveModelError.i18nCustomizeFullMessage = i18nCustomizeFullMessage || false;
    });
  }

  private static detectEnv(): string {
    return processEnv.TRAILS_ENV || "development";
  }
}

setRubyClassPath(Trailtie, "ActiveModel::Railtie");
