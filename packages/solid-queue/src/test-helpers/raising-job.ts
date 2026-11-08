import { ordinalize, seconds } from "@blazetrails/activesupport";
import { constSet, rbModName, StandardError, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";
import { JobBuffer } from "./add-to-buffer-job.js";

class DefaultError extends StandardError {}
class DiscardableError extends StandardError {}

export class RaisingJob extends ApplicationJob {
  static DefaultError = DefaultError;
  static DiscardableError = DiscardableError;

  static {
    this.queueAs("background");
  }

  perform(raising: unknown, identifier: string, failCount = 1): void {
    if (Array.isArray(raising)) raising = raising.shift();

    if (raising != null && raising !== false && this.executions! <= failCount) {
      const klass = raising as new (message: string) => Error;
      JobBuffer.add(
        `${identifier}: raised ${rbModName(klass)} for the ${ordinalize(this.executions!)} time`,
      );
      throw new klass(`This is a ${rbModName(klass)} exception`);
    } else {
      JobBuffer.add("Successfully completed job");
    }
  }
}
constSet(TopLevel, "RaisingJob", RaisingJob);
constSet(RaisingJob, "DefaultError", DefaultError);
constSet(RaisingJob, "DiscardableError", DiscardableError);

RaisingJob.retryOn(DefaultError, { attempts: 3, wait: seconds(0.1) });
RaisingJob.discardOn(DiscardableError);
