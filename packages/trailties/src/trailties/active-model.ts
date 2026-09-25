import { TopLevel, type Deprecators, type EnvironmentInquirer } from "@blazetrails/activesupport";
import { SecurePassword, Error as ActiveModelError, deprecator } from "@blazetrails/activemodel";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

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
      const env = TopLevel.Trails!.env as EnvironmentInquirer & Record<string, () => boolean>;
      SecurePassword.minCost = env["test?"]();
    });

    this.initializer("active_model.i18n_customize_full_message", () => {
      const activeModel = this.config.get("activeModel") as ActiveModelConfig;
      const i18nCustomizeFullMessage = activeModel.i18nCustomizeFullMessage;
      delete activeModel.i18nCustomizeFullMessage;
      ActiveModelError.i18nCustomizeFullMessage = i18nCustomizeFullMessage || false;
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveModel::Railtie" });
