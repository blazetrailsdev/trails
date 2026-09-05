import "./action-dispatch.js";
import "./action-view.js";
import { include, onLoad, type Deprecators } from "@blazetrails/activesupport";
import { ActionController, AbstractController } from "@blazetrails/actionpack";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";

export interface ActionControllerConfig {
  raiseOnOpenRedirects: boolean;
  logQueryTagsAroundActions: boolean;
  wrapParametersByDefault: boolean;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
  routes(): AppRoutes;
}

type AppRoutes = Parameters<typeof AbstractController.withRoutesHelpers>[0] & {
  mountedHelpers(): object;
};

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionController", {
      raiseOnOpenRedirects: false,
      logQueryTagsAroundActions: true,
      wrapParametersByDefault: false,
    } satisfies ActionControllerConfig);

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

setRubyClassPath(Trailtie, "ActionController::Railtie");
