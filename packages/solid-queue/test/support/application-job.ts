import { Base } from "@blazetrails/activejob";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import "./dummy-application.js";
import type { ConcurrencyControls } from "../../lib/active-job/concurrency-controls.js";

export class ApplicationJob extends Base {
  declare concurrencyLimit: number | null;
  declare concurrencyKey: typeof ConcurrencyControls.prototype.concurrencyKey;
}
constSet(TopLevel, "ApplicationJob", ApplicationJob);
