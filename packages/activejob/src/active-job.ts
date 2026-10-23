import "./version.js";
import "./deprecator.js";
import { Autoload } from "@blazetrails/activesupport";
import { extend, classModule } from "@blazetrails/ruby-compat";

export class ActiveJob {
  declare static _verboseEnqueueLogs: unknown;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob";
  }

  static get verboseEnqueueLogs() {
    return this._verboseEnqueueLogs ?? null;
  }

  static set verboseEnqueueLogs(value) {
    this._verboseEnqueueLogs = value;
  }
}
extend(ActiveJob, Autoload);
{
  ActiveJob.verboseEnqueueLogs = false;
}
