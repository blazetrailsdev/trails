/**
 * Trailtie — initialization hooks for ActiveRecord.
 *
 * Mirrors: ActiveRecord::Railtie < Rails::Railtie (railtie.rb)
 *
 * Extends the base Railtie from `@blazetrails/activesupport` and registers
 * itself in the global initialization pipeline.
 */
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

export class Trailtie extends BaseRailtie {
  constructor() {
    super();
  }

  static {
    registerRailtie(this);

    this.initializer("active_record.deprecator", () => {
      BaseRailtie.deprecators["activeRecord"] = deprecator();
    });
  }
}
