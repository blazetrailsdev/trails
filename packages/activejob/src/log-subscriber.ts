import {
  LogSubscriber as ActiveSupportLogSubscriber,
  pluralize,
  isPresent,
  BacktraceCleaner,
  classAttribute,
} from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { Identification } from "@blazetrails/globalid";
import {
  rtest,
  rbObjAsString,
  rbModName,
  rbObjClassname,
  toI,
  rbEqual,
  round,
  rbFArray,
  excBacktrace,
  aryJoin,
  rbObjClass,
  rbInspect,
  rbObjIsKindOf,
  Hash,
  transformValues,
  StandardError,
  Thread,
  registerConstant,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { rbEnum, rbBinop, isAny, sortBy, tally } from "./codegen-runtime.js";
import { ActiveJob } from "./namespaces.js";
import { adapterName } from "./queue-adapter.js";

export class LogSubscriber extends ActiveSupportLogSubscriber {
  [key: string]: any;
  static [key: string]: any;

  enqueue(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["exception_object"] ?? job.enqueueError;
    if (rtest(ex)) {
      return this.error(
        undefined,
        () =>
          `Failed enqueuing ${rbObjAsString(rbModName(job.constructor))} to ${rbObjAsString(this.queueName(event))}: ${rbObjClassname(ex)} (${rbObjAsString(ex.message)})`,
      );
    } else if (rtest(event.payload["aborted"])) {
      return this.info(
        undefined,
        () =>
          `Failed enqueuing ${rbObjAsString(rbModName(job.constructor))} to ${rbObjAsString(this.queueName(event))}, a before_enqueue callback halted the enqueuing execution.`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Enqueued ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) to ${rbObjAsString(this.queueName(event))}` +
          this.argsInfo(job),
      );
    }
  }

  enqueueAt(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["exception_object"] ?? job.enqueueError;
    if (rtest(ex)) {
      return this.error(
        undefined,
        () =>
          `Failed enqueuing ${rbObjAsString(rbModName(job.constructor))} to ${rbObjAsString(this.queueName(event))}: ${rbObjClassname(ex)} (${rbObjAsString(ex.message)})`,
      );
    } else if (rtest(event.payload["aborted"])) {
      return this.info(
        undefined,
        () =>
          `Failed enqueuing ${rbObjAsString(rbModName(job.constructor))} to ${rbObjAsString(this.queueName(event))}, a before_enqueue callback halted the enqueuing execution.`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Enqueued ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) to ${rbObjAsString(this.queueName(event))} at ${rbObjAsString(this.scheduledAt(event))}` +
          this.argsInfo(job),
      );
    }
  }

  enqueueAll(event: any): any {
    return this.info(undefined, () => {
      let enqueuedJobs: any, failedEnqueueCount: any;
      const jobs: any = event.payload["jobs"];
      const adapter: any = event.payload["adapter"];
      const enqueuedCount: any = toI(event.payload["enqueued_count"]);
      if (rbEqual(enqueuedCount, jobs.length)) {
        return this.enqueuedJobsMessage(adapter, jobs);
      } else if (rbEnum(jobs).some((x: any) => x.isSuccessfullyEnqueued())) {
        enqueuedJobs = rbEnum(jobs).filter((x: any) => x.isSuccessfullyEnqueued());
        failedEnqueueCount = jobs.length - enqueuedCount;
        if (rbEqual(failedEnqueueCount, 0)) {
          return this.enqueuedJobsMessage(adapter, enqueuedJobs);
        } else {
          return `${`${rbObjAsString(this.enqueuedJobsMessage(adapter, enqueuedJobs))}. `}${`Failed enqueuing ${failedEnqueueCount} ${rbObjAsString(pluralize("job", failedEnqueueCount))}`}`;
        }
      } else {
        failedEnqueueCount = jobs.length - enqueuedCount;
        return `${`Failed enqueuing ${failedEnqueueCount} ${rbObjAsString(pluralize("job", failedEnqueueCount))} `}${`to ${rbObjAsString(adapterName(adapter))}`}`;
      }
    });
  }

  performStart(event: any): any {
    return this.info(undefined, () => {
      const job: any = event.payload["job"];
      const enqueueInfo: any = isPresent(job.enqueuedAt)
        ? ` enqueued at ${rbObjAsString(job.enqueuedAt.utc().iso8601(9))}`
        : "";
      return (
        `Performing ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) from ${rbObjAsString(this.queueName(event))}` +
        enqueueInfo +
        this.argsInfo(job)
      );
    });
  }

  perform(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["exception_object"];
    if (rtest(ex)) {
      return this.error(
        undefined,
        () =>
          `Error performing ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) from ${rbObjAsString(this.queueName(event))} in ${round(event.duration, 2)}ms: ${rbObjClassname(ex)} (${rbObjAsString(ex.message)}):\n` +
          aryJoin(rbFArray(excBacktrace(ex)), "\n"),
      );
    } else if (rtest(event.payload["aborted"])) {
      return this.error(
        undefined,
        () =>
          `Error performing ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) from ${rbObjAsString(this.queueName(event))} in ${round(event.duration, 2)}ms: a before_perform callback halted the job execution`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Performed ${rbObjAsString(rbModName(job.constructor))} (Job ID: ${rbObjAsString(job.jobId)}) from ${rbObjAsString(this.queueName(event))} in ${round(event.duration, 2)}ms`,
      );
    }
  }

  enqueueRetry(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["error"];
    const wait: any = event.payload["wait"];
    return this.info(undefined, () => {
      if (rtest(ex)) {
        return `Retrying ${rbObjClassname(job)} (Job ID: ${rbObjAsString(job.jobId)}) after ${rbObjAsString(job.executions)} attempts in ${toI(wait)} seconds, due to a ${rbObjClassname(ex)} (${rbObjAsString(ex.message)}).`;
      } else {
        return `Retrying ${rbObjClassname(job)} (Job ID: ${rbObjAsString(job.jobId)}) after ${rbObjAsString(job.executions)} attempts in ${toI(wait)} seconds.`;
      }
    });
  }

  retryStopped(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["error"];
    return this.error(
      undefined,
      () =>
        `Stopped retrying ${rbObjClassname(job)} (Job ID: ${rbObjAsString(job.jobId)}) due to a ${rbObjClassname(ex)} (${rbObjAsString(ex.message)}), which reoccurred on ${rbObjAsString(job.executions)} attempts.`,
    );
  }

  discard(event: any): any {
    const job: any = event.payload["job"];
    const ex: any = event.payload["error"];
    return this.error(
      undefined,
      () =>
        `Discarded ${rbObjClassname(job)} (Job ID: ${rbObjAsString(job.jobId)}) due to a ${rbObjClassname(ex)} (${rbObjAsString(ex.message)}).`,
    );
  }

  /** @internal */
  protected queueName(event: any): any {
    return rbBinop(
      adapterName(event.payload["adapter"]),
      "+",
      `(${rbObjAsString(event.payload["job"].queueName)})`,
    );
  }

  /** @internal */
  protected argsInfo(job: any): any {
    if (job.constructor.isLogArguments && isAny(job.arguments)) {
      return (
        " with arguments: " +
        aryJoin(
          rbEnum(job.arguments).map((arg?: any) => rbInspect(this.format(arg))),
          ", ",
        )
      );
    } else {
      return "";
    }
  }

  /** @internal */
  protected format(arg: any): any {
    if (rbObjIsKindOf(arg, Hash)) {
      return transformValues(arg, (value?: any) => this.format(value));
    } else if (Array.isArray(arg)) {
      return rbEnum(arg).map((value?: any) => this.format(value));
    } else if (rbObjIsKindOf(arg, Identification)) {
      try {
        return arg.toGlobalId();
      } catch (error: any) {
        if (error instanceof StandardError) {
          return arg;
        } else {
          throw error;
        }
      }
    } else {
      return arg;
    }
  }

  /** @internal */
  protected scheduledAt(event: any): any {
    return RubyTime.at(event.payload["job"].scheduledAt).utc();
  }

  get logger(): any {
    return Base.logger;
  }

  /** @internal */
  protected info(progname: any = null, block?: any): any {
    if (!rtest(super._info(block ?? progname))) {
      return null;
    }
    if ((ActiveJob as any).verboseEnqueueLogs()) {
      return this.logEnqueueSource();
    }
    return null;
  }

  /** @internal */
  protected error(progname: any = null, block?: any): any {
    if (!rtest(super._error(block ?? progname))) {
      return null;
    }
    if ((ActiveJob as any).verboseEnqueueLogs()) {
      return this.logEnqueueSource();
    }
    return null;
  }

  /** @internal */
  protected logEnqueueSource(): any {
    const source: any = this.enqueueSourceLocation();
    if (rtest(source)) {
      return this.logger.info(`↳ ${rbObjAsString(source)}`);
    }
    return null;
  }

  /** @internal */
  protected enqueueSourceLocation(): any {
    (Thread as any).eachCallerLocation((location?: any) => {
      const frame: any = this.backtraceCleaner.cleanFrame(location);
      if (rtest(frame)) {
        return frame;
      }
      return null;
    });
    return null;
  }

  /** @internal */
  protected enqueuedJobsMessage(adapter: any, enqueuedJobs: any): any {
    const enqueuedCount: any = enqueuedJobs.length;
    const jobClassesCounts: any = sortBy(
      tally(rbEnum(enqueuedJobs).map((x: any) => rbObjClass(x))),
      ([_k, v]: any) => -v,
    );
    return `${`Enqueued ${enqueuedCount} ${rbObjAsString(pluralize("job", enqueuedCount))} to ${rbObjAsString(adapterName(adapter))}`}${` (${rbObjAsString(
      aryJoin(
        jobClassesCounts.map(
          ([klass, count]: any) => `${rbObjAsString(count)} ${rbObjAsString(klass)}`,
        ),
        ", ",
      ),
    )})`}`;
  }
}
registerConstant("ActiveJob::LogSubscriber", LogSubscriber);
{
  classAttribute.call(LogSubscriber, "backtraceCleaner", { default: new BacktraceCleaner() });
  LogSubscriber.subscribeLogLevel("enqueue", "info");
  LogSubscriber.subscribeLogLevel("enqueue_at", "info");
  LogSubscriber.subscribeLogLevel("enqueue_all", "info");
  LogSubscriber.subscribeLogLevel("perform_start", "info");
  LogSubscriber.subscribeLogLevel("perform", "info");
  LogSubscriber.subscribeLogLevel("enqueue_retry", "info");
  LogSubscriber.subscribeLogLevel("retry_stopped", "error");
  LogSubscriber.subscribeLogLevel("discard", "error");
}
rbModConstSet(ActiveJob, "LogSubscriber", LogSubscriber);
