/**
 * Trailtie — initialization hooks for ActiveRecord.
 *
 * Mirrors: ActiveRecord::Railtie < Rails::Railtie (railtie.rb)
 *
 * Extends the base Railtie from `@blazetrails/activesupport` and registers
 * itself in the global initialization pipeline.
 *
 * Also re-exports the ActionController and ActiveJob mixin objects that
 * `railtie.rb` wires into those frameworks:
 *   - `ControllerRuntime` — SQL runtime tracking per request
 *   - `JobRuntime` — SQL runtime tracking per job
 */
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";
import {
  processAction,
  cleanupViewRuntime,
  appendInfoToPayload,
} from "./trailties/controller-runtime.js";
import { instrument } from "./trailties/job-runtime.js";

export const ControllerRuntime = { processAction, cleanupViewRuntime, appendInfoToPayload };
export const JobRuntime = { instrument };

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
