import {
  any,
  BacktraceCleaner,
  callerLocations,
  classAttribute,
  isPresent,
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  pluralize,
  tally,
  type Logger,
} from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { Time } from "@blazetrails/date";
import {
  excBacktrace,
  Hash,
  rbFArray,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjAsString,
  rbObjClass,
  rbObjIsKindOf,
  round,
  StandardError,
  Exception,
  rtest,
  toI,
  transformValues,
} from "@blazetrails/ruby-compat";
import { verboseEnqueueLogs } from "./active-job.js";
import { ActiveJob } from "./namespaces.js";

interface LoggedJob {
  jobId: string | null;
  queueName: string;
  arguments: unknown[];
  executions: number | null;
  enqueuedAt: { utc(): { iso8601(fractionDigits: number): string } } | null;
  scheduledAt: unknown;
  enqueueError: unknown;
  isSuccessfullyEnqueued(): unknown;
}

export class LogSubscriber extends BaseLogSubscriber {
  static override toString(): string {
    return "ActiveJob::LogSubscriber";
  }

  declare static backtraceCleaner: BacktraceCleaner;
  declare backtraceCleaner: BacktraceCleaner;

  enqueue(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = (event.payload.exception_object as Error | null) || (job.enqueueError as Error);

    if (ex) {
      this.error(null, () => {
        return `Failed enqueuing ${rbModName(rbObjClass(job))} to ${this.queueName(event)}: ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)})`;
      });
    } else if (rtest(event.payload.aborted)) {
      this.info(null, () => {
        return `Failed enqueuing ${rbModName(rbObjClass(job))} to ${this.queueName(event)}, a before_enqueue callback halted the enqueuing execution.`;
      });
    } else {
      this.info(null, () => {
        return (
          `Enqueued ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) to ${this.queueName(event)}` +
          this.argsInfo(job)
        );
      });
    }
  }

  enqueueAt(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = (event.payload.exception_object as Error | null) || (job.enqueueError as Error);

    if (ex) {
      this.error(null, () => {
        return `Failed enqueuing ${rbModName(rbObjClass(job))} to ${this.queueName(event)}: ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)})`;
      });
    } else if (rtest(event.payload.aborted)) {
      this.info(null, () => {
        return `Failed enqueuing ${rbModName(rbObjClass(job))} to ${this.queueName(event)}, a before_enqueue callback halted the enqueuing execution.`;
      });
    } else {
      this.info(null, () => {
        return (
          `Enqueued ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) to ${this.queueName(event)} at ${rbObjAsString(this.scheduledAt(event))}` +
          this.argsInfo(job)
        );
      });
    }
  }

  enqueueAll(event: Event): void {
    this.info(null, () => {
      const jobs = event.payload.jobs as LoggedJob[];
      const adapter = event.payload.adapter;
      const enqueuedCount = Number(toI(event.payload.enqueued_count ?? null));

      if (enqueuedCount === jobs.length) {
        return this.enqueuedJobsMessage(adapter, jobs);
      } else if (any(jobs, (job) => job.isSuccessfullyEnqueued())) {
        const enqueuedJobs = jobs.filter((job) => rtest(job.isSuccessfullyEnqueued()));

        const failedEnqueueCount = jobs.length - enqueuedCount;
        if (failedEnqueueCount === 0) {
          return this.enqueuedJobsMessage(adapter, enqueuedJobs);
        } else {
          return (
            `${this.enqueuedJobsMessage(adapter, enqueuedJobs)}. ` +
            `Failed enqueuing ${failedEnqueueCount} ${pluralize("job", failedEnqueueCount)}`
          );
        }
      } else {
        const failedEnqueueCount = jobs.length - enqueuedCount;
        return (
          `Failed enqueuing ${failedEnqueueCount} ${pluralize("job", failedEnqueueCount)} ` +
          `to ${ActiveJob.adapterName(adapter)}`
        );
      }
    });
  }

  performStart(event: Event): void {
    this.info(null, () => {
      const job = event.payload.job as LoggedJob;
      const enqueueInfo = isPresent(job.enqueuedAt)
        ? ` enqueued at ${job.enqueuedAt!.utc().iso8601(9)}`
        : "";

      return (
        `Performing ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) from ${this.queueName(event)}` +
        enqueueInfo +
        this.argsInfo(job)
      );
    });
  }

  perform(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = event.payload.exception_object as Error | null | undefined;
    if (ex) {
      this.error(null, () => {
        return (
          `Error performing ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) from ${this.queueName(event)} in ${rbObjAsString(new Number(round(event.duration, 2)))}ms: ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)}):\n` +
          rbFArray(excBacktrace(ex)).join("\n")
        );
      });
    } else if (rtest(event.payload.aborted)) {
      this.error(null, () => {
        return `Error performing ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) from ${this.queueName(event)} in ${rbObjAsString(new Number(round(event.duration, 2)))}ms: a before_perform callback halted the job execution`;
      });
    } else {
      this.info(null, () => {
        return `Performed ${rbModName(rbObjClass(job))} (Job ID: ${job.jobId}) from ${this.queueName(event)} in ${rbObjAsString(new Number(round(event.duration, 2)))}ms`;
      });
    }
  }

  enqueueRetry(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = event.payload.error as Error | null | undefined;
    const wait = event.payload.wait;

    this.info(null, () => {
      if (ex) {
        return `Retrying ${rbObjAsString(rbObjClass(job))} (Job ID: ${job.jobId}) after ${job.executions} attempts in ${toI(wait)} seconds, due to a ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)}).`;
      } else {
        return `Retrying ${rbObjAsString(rbObjClass(job))} (Job ID: ${job.jobId}) after ${job.executions} attempts in ${toI(wait)} seconds.`;
      }
    });
  }

  retryStopped(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = event.payload.error as Error;

    this.error(null, () => {
      return `Stopped retrying ${rbObjAsString(rbObjClass(job))} (Job ID: ${job.jobId}) due to a ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)}), which reoccurred on ${job.executions} attempts.`;
    });
  }

  discard(event: Event): void {
    const job = event.payload.job as LoggedJob;
    const ex = event.payload.error as Error;

    this.error(null, () => {
      return `Discarded ${rbObjAsString(rbObjClass(job))} (Job ID: ${job.jobId}) due to a ${rbObjAsString(rbObjClass(ex))} (${rbObjAsString(ex.message)}).`;
    });
  }

  /** @internal */
  private queueName(event: Event): string {
    return (
      ActiveJob.adapterName(event.payload.adapter) +
      `(${rbObjAsString((event.payload.job as LoggedJob).queueName)})`
    );
  }

  /** @internal */
  private argsInfo(job: LoggedJob): string {
    const klass = rbObjClass(job) as unknown as { isLogArguments: boolean };
    if (klass.isLogArguments && any(job.arguments)) {
      return (
        " with arguments: " + job.arguments.map((arg) => rbInspect(this.format(arg))).join(", ")
      );
    } else {
      return "";
    }
  }

  /** @internal */
  private format(arg: unknown): unknown {
    if (rbObjIsKindOf(arg, Hash)) {
      return transformValues(arg as Record<string, unknown>, (value) => this.format(value));
    } else if (Array.isArray(arg)) {
      return arg.map((value) => this.format(value));
    } else if (rbObjIsKindOf(arg, GlobalID.Identification)) {
      try {
        return (arg as { toGlobalId(): unknown }).toGlobalId();
      } catch (error) {
        if (error instanceof Exception && !(error instanceof StandardError)) throw error;
        return arg;
      }
    } else {
      return arg;
    }
  }

  /** @internal */
  private scheduledAt(event: Event): Time {
    return Time.at((event.payload.job as LoggedJob).scheduledAt).utc();
  }

  /** @internal */
  override get logger(): Logger | null {
    return ActiveJob.Base.logger as Logger | null;
  }

  protected override info(progname: string | null = null, block?: () => string): boolean | null {
    if (!super.info(progname, block)) return null;

    if (verboseEnqueueLogs()) {
      return this.logEnqueueSource();
    }
    return null;
  }

  protected override error(progname: string | null = null, block?: () => string): boolean | null {
    if (!super.error(progname, block)) return null;

    if (verboseEnqueueLogs()) {
      return this.logEnqueueSource();
    }
    return null;
  }

  /** @internal */
  private logEnqueueSource(): boolean | null {
    const source = this.enqueueSourceLocation();

    if (source) {
      return this.logger!.info(`↳ ${source}`);
    }
    return null;
  }

  /** @internal */
  private enqueueSourceLocation(): string | null {
    for (const location of callerLocations()) {
      const frame = this.backtraceCleaner.cleanFrame(String(location));
      if (frame) return frame;
    }
    return null;
  }

  /** @internal */
  private enqueuedJobsMessage(adapter: unknown, enqueuedJobs: LoggedJob[]): string {
    const enqueuedCount = enqueuedJobs.length;
    const jobClassesCounts = Object.entries(
      tally(enqueuedJobs.map((job) => rbObjClass(job) as never)),
    ).sort(([, a], [, b]) => b - a);
    return (
      `Enqueued ${enqueuedCount} ${pluralize("job", enqueuedCount)} to ${ActiveJob.adapterName(adapter)}` +
      ` (${jobClassesCounts.map(([klass, count]) => `${count} ${klass}`).join(", ")})`
    );
  }
}

classAttribute.call(LogSubscriber, "backtraceCleaner", { default: new BacktraceCleaner() });

LogSubscriber.subscribeLogLevel("enqueue", "info");
LogSubscriber.subscribeLogLevel("enqueue_at", "info");
LogSubscriber.subscribeLogLevel("enqueue_all", "info");
LogSubscriber.subscribeLogLevel("perform_start", "info");
LogSubscriber.subscribeLogLevel("perform", "info");
LogSubscriber.subscribeLogLevel("enqueue_retry", "info");
LogSubscriber.subscribeLogLevel("retry_stopped", "error");
LogSubscriber.subscribeLogLevel("discard", "error");

rbModConstSet(ActiveJob, "LogSubscriber", LogSubscriber);

LogSubscriber.attachTo("active_job");
