/**
 * Trailtie — initialization hooks for ActionController.
 *
 * Mirrors: ActionController::Railtie < Rails::Railtie (railtie.rb)
 *
 * Registers itself in the global initialization pipeline and seeds the
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
 * `set_configs` declares only the routing arms of its `on_load` block
 * (`railtie.rb:69-71`); the rest of that body configures
 * `config.action_controller` options whose receivers
 * (`ActionController::Parameters`, the assets paths) are unported.
 *
 * The two side-effect imports are `require "action_dispatch/railtie"`
 * (`railtie.rb:7`) and `require "action_view/railtie"` (`:10`).
 *
 * @see https://api.rubyonrails.org/classes/ActionController/Railtie.html
 */
import "./action-dispatch.js";
import "./action-view.js";
import { include, onLoad, type Deprecators } from "@blazetrails/activesupport";
import { ActionController, AbstractController } from "@blazetrails/actionpack";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

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
  routes(): AppRoutes;
}

/** The `app.routes` slice `set_configs` reads (`railtie.rb:69-70`). */
type AppRoutes = Parameters<typeof AbstractController.withRoutesHelpers>[0] & {
  mountedHelpers(): object;
};

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionController", defaultActionControllerConfig());

    this.initializer("action_controller.set_configs", (app) => {
      onLoad("action_controller", (base: AbstractController.RoutesHelpersControllerClass) => {
        const routes = (app as TrailtieApp).routes();
        include(base as unknown as new (...args: never[]) => unknown, routes.mountedHelpers());
        AbstractController.withRoutesHelpers(routes)(base);
      });
    });

    this.initializer(
      "action_controller.deprecator",
      { before: "load_environment_config" },
      (app) => {
        (app as TrailtieApp).deprecators.set("actionController", ActionController.deprecator());
      },
    );
  }
}
