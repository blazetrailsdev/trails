import {
  LogSubscriber as ActiveSupportLogSubscriber,
  pluralize,
  isPresent,
  Logger,
  BacktraceCleaner,
  classAttribute,
} from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { Identification } from "@blazetrails/globalid";
import {
  rbObjClassname,
  Enumerator,
  rbFSend,
  round,
  excBacktrace,
  aryJoin,
  rbInspect,
  transformValues,
  rbObjIsKindOf,
  StandardError,
  Thread,
  rbIterBreakValue,
  cmp,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./active-job.js";
import { Base } from "./base.js";
import { rbBinop } from "./codegen-runtime.js";
import { adapterName } from "./queue-adapter.js";

export class LogSubscriber extends ActiveSupportLogSubscriber {
  static toString(): string {
    return "ActiveJob::LogSubscriber";
  }

  enqueue(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["exception_object"] ?? job.enqueueError;
    if (ex != null && ex !== false) {
      return this.error(
        undefined,
        () =>
          `Failed enqueuing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} to ${this.queueName(event)}: ${rbObjClassname(ex)} (${ex.message ?? ""})`,
      );
    } else if ((event.payload["aborted"] ?? false) !== false) {
      return this.info(
        undefined,
        () =>
          `Failed enqueuing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} to ${this.queueName(event)}, a before_enqueue callback halted the enqueuing execution.`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Enqueued ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) to ${this.queueName(event)}` +
          this.argsInfo(job),
      );
    }
  }

  enqueueAt(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["exception_object"] ?? job.enqueueError;
    if (ex != null && ex !== false) {
      return this.error(
        undefined,
        () =>
          `Failed enqueuing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} to ${this.queueName(event)}: ${rbObjClassname(ex)} (${ex.message ?? ""})`,
      );
    } else if ((event.payload["aborted"] ?? false) !== false) {
      return this.info(
        undefined,
        () =>
          `Failed enqueuing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} to ${this.queueName(event)}, a before_enqueue callback halted the enqueuing execution.`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Enqueued ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) to ${this.queueName(event)} at ${this.scheduledAt(event) ?? ""}` +
          this.argsInfo(job),
      );
    }
  }

  enqueueAll(event: Record<string, unknown>) {
    return this.info(undefined, () => {
      let enqueuedJobs, failedEnqueueCount;
      const jobs = event.payload["jobs"];
      const adapter = event.payload["adapter"];
      const enqueuedCount = parseInt(String(event.payload["enqueued_count"]), 10) || 0;
      if (enqueuedCount === jobs.length) {
        return this.enqueuedJobsMessage(adapter, jobs);
      } else if (
        (jobs instanceof globalThis.Set ||
        jobs instanceof globalThis.Map ||
        jobs instanceof Enumerator
          ? [...jobs]
          : Object.getPrototypeOf(jobs) === Object.prototype
            ? Object.entries(jobs as object)
            : (jobs as unknown[])
        ).some((x) => x.isSuccessfullyEnqueued()) ??
        null
      ) {
        enqueuedJobs = (
          jobs instanceof globalThis.Set ||
          jobs instanceof globalThis.Map ||
          jobs instanceof Enumerator
            ? [...jobs]
            : Object.getPrototypeOf(jobs) === Object.prototype
              ? Object.entries(jobs as object)
              : (jobs as unknown[])
        ).filter((x) => x.isSuccessfullyEnqueued());
        failedEnqueueCount = jobs.length - enqueuedCount;
        if (failedEnqueueCount === 0) {
          return this.enqueuedJobsMessage(adapter, enqueuedJobs);
        } else {
          return `${`${this.enqueuedJobsMessage(adapter, enqueuedJobs)}. `}${`Failed enqueuing ${failedEnqueueCount} ${pluralize("job", failedEnqueueCount) ?? ""}`}`;
        }
      } else {
        failedEnqueueCount = jobs.length - enqueuedCount;
        return `${`Failed enqueuing ${failedEnqueueCount} ${pluralize("job", failedEnqueueCount) ?? ""} `}${`to ${adapterName(adapter) ?? ""}`}`;
      }
    });
  }

  performStart(event: Record<string, unknown>) {
    return this.info(undefined, () => {
      const job = event.payload["job"];
      const enqueueInfo = isPresent(job.enqueuedAt)
        ? ` enqueued at ${rbFSend(job.enqueuedAt.utc(), "iso8601", 9) ?? ""}`
        : "";
      return (
        `Performing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) from ${this.queueName(event)}` +
        enqueueInfo +
        this.argsInfo(job)
      );
    });
  }

  perform(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["exception_object"];
    if (ex != null && ex !== false) {
      return this.error(
        undefined,
        () =>
          `Error performing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) from ${this.queueName(event)} in ${round(event.duration, 2)}ms: ${rbObjClassname(ex)} (${ex.message ?? ""}):\n` +
          aryJoin(
            ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(excBacktrace(ex)),
            "\n",
          ),
      );
    } else if ((event.payload["aborted"] ?? false) !== false) {
      return this.error(
        undefined,
        () =>
          `Error performing ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) from ${this.queueName(event)} in ${round(event.duration, 2)}ms: a before_perform callback halted the job execution`,
      );
    } else {
      return this.info(
        undefined,
        () =>
          `Performed ${(Object.hasOwn(job.constructor, "toString") ? String(job.constructor) : job.constructor.name || null) ?? ""} (Job ID: ${job.jobId ?? ""}) from ${this.queueName(event)} in ${round(event.duration, 2)}ms`,
      );
    }
  }

  enqueueRetry(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["error"];
    const wait = event.payload["wait"];
    return this.info(undefined, () => {
      if (ex != null && ex !== false) {
        return `Retrying ${rbObjClassname(job)} (Job ID: ${job.jobId ?? ""}) after ${job.executions ?? ""} attempts in ${parseInt(String(wait), 10) || 0} seconds, due to a ${rbObjClassname(ex)} (${ex.message ?? ""}).`;
      } else {
        return `Retrying ${rbObjClassname(job)} (Job ID: ${job.jobId ?? ""}) after ${job.executions ?? ""} attempts in ${parseInt(String(wait), 10) || 0} seconds.`;
      }
    });
  }

  retryStopped(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["error"];
    return this.error(
      undefined,
      () =>
        `Stopped retrying ${rbObjClassname(job)} (Job ID: ${job.jobId ?? ""}) due to a ${rbObjClassname(ex)} (${ex.message ?? ""}), which reoccurred on ${job.executions ?? ""} attempts.`,
    );
  }

  discard(event: Record<string, unknown>) {
    const job = event.payload["job"];
    const ex = event.payload["error"];
    return this.error(
      undefined,
      () =>
        `Discarded ${rbObjClassname(job)} (Job ID: ${job.jobId ?? ""}) due to a ${rbObjClassname(ex)} (${ex.message ?? ""}).`,
    );
  }

  /** @internal */
  protected queueName(event: Record<string, unknown>): string {
    return rbBinop(
      adapterName(event.payload["adapter"]),
      "+",
      `(${event.payload["job"].queueName ?? ""})`,
    );
  }

  /** @internal */
  protected argsInfo(job: Record<string, unknown>): string {
    if (
      job.constructor.isLogArguments &&
      job.arguments.some((x: unknown) => x != null && x !== false)
    ) {
      return (
        " with arguments: " +
        aryJoin(
          job.arguments.map((arg: unknown) => rbInspect(this.format(arg))),
          ", ",
        )
      );
    } else {
      return "";
    }
  }

  /** @internal */
  protected format(arg: unknown): unknown {
    if (
      typeof arg === "object" &&
      arg !== null &&
      ([Object.prototype, null].includes(Object.getPrototypeOf(arg)) ||
        (arg instanceof Map && arg.constructor !== Map))
    ) {
      return transformValues(arg, (value) => this.format(value));
    } else if (Array.isArray(arg)) {
      return (
        arg instanceof globalThis.Set || arg instanceof globalThis.Map || arg instanceof Enumerator
          ? [...arg]
          : Object.getPrototypeOf(arg) === Object.prototype
            ? Object.entries(arg as object)
            : (arg as unknown[])
      ).map((value): unknown => this.format(value));
    } else if (rbObjIsKindOf(arg, Identification)) {
      try {
        return arg.toGlobalId();
      } catch (error) {
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
  protected scheduledAt(event: Record<string, unknown>): RubyTime {
    return RubyTime.at(event.payload["job"].scheduledAt).utc();
  }

  /** @internal */
  get logger(): Logger | null {
    return Base.logger;
  }

  /** @internal */
  protected info(
    progname: string | null = null,
    block?: (...args: unknown[]) => unknown,
  ): boolean | null {
    if (!((super.info(progname, block) ?? false) !== false)) {
      return null;
    }
    if (ActiveJob.verboseEnqueueLogs) {
      return this.logEnqueueSource();
    }
    return null;
  }

  /** @internal */
  protected error(
    progname: string | null = null,
    block?: (...args: unknown[]) => unknown,
  ): boolean | null {
    if (!((super.error(progname, block) ?? false) !== false)) {
      return null;
    }
    if (ActiveJob.verboseEnqueueLogs) {
      return this.logEnqueueSource();
    }
    return null;
  }

  /** @internal */
  protected logEnqueueSource(): boolean | null {
    const source = this.enqueueSourceLocation();
    if (source != null) {
      return this.logger!.info(`↳ ${source}`);
    }
    return null;
  }

  /** @internal */
  protected enqueueSourceLocation(): string | null {
    return Thread.eachCallerLocation((location) => {
      const frame = this.backtraceCleaner.cleanFrame(location);
      if (frame != null) {
        rbIterBreakValue(frame);
      }
      return null;
    });
  }

  /** @internal */
  protected enqueuedJobsMessage(adapter: unknown, enqueuedJobs: unknown[]): string {
    const enqueuedCount = enqueuedJobs.length;
    const jobClassesCounts = [
      ...((x) =>
        x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
          ? [...x]
          : Object.getPrototypeOf(x) === Object.prototype
            ? Object.entries(x as object)
            : (x as unknown[]))(
        enqueuedJobs
          .map((x) => x.constructor)
          .reduce((h: Map<unknown, number>, x) => h.set(x, (h.get(x) ?? 0) + 1), new Map()),
      ),
    ]
      .map((x) => [(([_k, v]: unknown) => -v)(x), x])
      .sort((a, b) => cmp(a[0], b[0]) ?? 0)
      .map((p) => p[1]);
    return `${`Enqueued ${enqueuedCount} ${pluralize("job", enqueuedCount) ?? ""} to ${adapterName(adapter) ?? ""}`}${` (${
      aryJoin(
        jobClassesCounts.map(([klass, count]) => `${count ?? ""} ${klass ?? ""}`),
        ", ",
      ) ?? ""
    })`}`;
  }
}
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
LogSubscriber.attachTo("active_job");
