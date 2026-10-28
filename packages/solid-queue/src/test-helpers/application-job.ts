import { Base } from "@blazetrails/activejob";
import { type Duration } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import "./dummy-application.js";
import {
  ConcurrencyControls,
  type ClassMethods as ConcurrencyControlsClassMethods,
} from "../active-job/concurrency-controls.js";

export class ApplicationJob extends Base {
  declare static concurrencyKey: unknown;
  declare static concurrencyGroup: unknown;
  declare static concurrencyLimit: number | null;
  declare static concurrencyDuration: Duration;
  declare static limitsConcurrency: typeof ConcurrencyControlsClassMethods.limitsConcurrency;
  declare concurrencyLimit: number | null;
  declare concurrencyKey: typeof ConcurrencyControls.prototype.concurrencyKey;
}
registerConstant("ApplicationJob", ApplicationJob);
