import { TopLevel, type Deprecators } from "@blazetrails/activesupport";
import * as ActiveModel from "@blazetrails/activemodel";
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

    this.config.eagerLoadNamespaces.push(ActiveModel.ActiveModel);

    this.config.set("activeModel", {} satisfies ActiveModelConfig);

    this.initializer("active_model.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeModel", ActiveModel.deprecator());
    });

    this.initializer("active_model.secure_password", () => {
      ActiveModel.SecurePassword.minCost = TopLevel.Trails!.env["test?"]();
    });

    this.initializer("active_model.i18n_customize_full_message", () => {
      const activeModel = this.config.get("activeModel") as ActiveModelConfig;
      const i18nCustomizeFullMessage = activeModel.i18nCustomizeFullMessage;
      delete activeModel.i18nCustomizeFullMessage;
      ActiveModel.Error.i18nCustomizeFullMessage = i18nCustomizeFullMessage || false;
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveModel::Railtie" });
