/**
 * Trailtie — initialization hooks for ActionController.
 *
 * Mirrors: ActionController::Railtie < Rails::Railtie (railtie.rb)
 *
 * Extends the base Railtie from `@blazetrails/activesupport` and registers
 * itself in the global initialization pipeline.
 *
 * @see https://api.rubyonrails.org/classes/ActionController/Railtie.html
 */
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.initializer("action_controller.deprecator", () => {
      BaseRailtie.deprecators["actionController"] = deprecator();
    });
  }
}
