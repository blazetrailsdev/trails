import { Base } from "@blazetrails/activejob";
import { include, onLoad, type Duration } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import {
  ConcurrencyControls,
  type ClassMethods as ConcurrencyControlsClassMethods,
} from "../active-job/concurrency-controls.js";

onLoad("active_job", function (this: typeof Base) {
  include(this, ConcurrencyControls);
});

export class ApplicationJob extends Base {
  declare static concurrencyKey: unknown;
  declare static concurrencyGroup: unknown;
  declare static concurrencyLimit: number | null;
  declare static concurrencyDuration: Duration;
  declare static limitsConcurrency: typeof ConcurrencyControlsClassMethods.limitsConcurrency;
  declare concurrencyLimit: number | null;
  declare concurrencyKey: typeof ConcurrencyControls.prototype.concurrencyKey;

  static toString(): string {
    return "ApplicationJob";
  }
}
registerConstant("ApplicationJob", ApplicationJob);
