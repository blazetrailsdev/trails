import { Base } from "@blazetrails/activejob";
import { registerConstant } from "@blazetrails/ruby-compat";
import "./dummy-application.js";
import type { ConcurrencyControls } from "../active-job/concurrency-controls.js";

export class ApplicationJob extends Base {
  declare concurrencyLimit: number | null;
  declare concurrencyKey: typeof ConcurrencyControls.prototype.concurrencyKey;
}
registerConstant("ApplicationJob", ApplicationJob);
