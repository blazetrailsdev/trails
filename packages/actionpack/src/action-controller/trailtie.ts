/**
 * Trailtie — initialization hooks for ActionController.
 *
 * Mirrors: ActionController::Railtie < Rails::Railtie (railtie.rb)
 *
 * Extends the base Railtie from `@blazetrails/activesupport`, registers
 * itself in the global initialization pipeline, and seeds the
 * `config.actionController` namespace with the same defaults Rails sets at
 * the top of `actionpack/lib/action_controller/railtie.rb` (the
 * `ActiveSupport::OrderedOptions` block).
 *
 * Unported targets (assets_config — paths["public"] not ported; helpers
 * path wiring; parameters_config — needs on_load + ActionController
 * ::Parameters; set_configs setter-dispatch; compile_config_methods;
 * request_forgery_protection — needs RequestForgeryProtection.protect_from_forgery
 * wiring; query_log_tags — needs ActiveRecord QueryLogs wiring;
 * test_case — needs ActiveSupport executor) are left out and will land as
 * those frameworks gain the matching surface — see docs/trailties-plan.md
 * PR 2.7 follow-ups.
 *
 * @see https://api.rubyonrails.org/classes/ActionController/Railtie.html
 */
import {
  Trailtie as BaseTrailtie,
  registerTrailtie,
  type Deprecators,
} from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

/**
 * Shape of `config.actionController` — mirrors the
 * `ActiveSupport::OrderedOptions` block at the top of Rails' railtie.rb.
 */
export interface ActionControllerConfig {
  raiseOnOpenRedirects: boolean;
  logQueryTagsAroundActions: boolean;
  wrapParametersByDefault: boolean;
}

function defaultActionControllerConfig(): ActionControllerConfig {
  return {
    raiseOnOpenRedirects: false,
    logQueryTagsAroundActions: true,
    wrapParametersByDefault: false,
  };
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    registerTrailtie(this);

    this.config["actionController"] = defaultActionControllerConfig();

    this.initializer("action_controller.deprecator", (app) => {
      (app as TrailtieApp).deprecators.set("actionController", deprecator());
    });
  }
}
