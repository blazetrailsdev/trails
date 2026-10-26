import {
  isPresent,
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  type Logger,
} from "@blazetrails/activesupport";
import { rbInspect, rbModName, rbObjClass, round, slice } from "@blazetrails/ruby-compat";
import { SolidQueue } from "./solid-queue.js";
import { VERSION } from "./version.js";

type Attributes = Record<string, unknown>;

interface LoggedProcess {
  id?: unknown;
  pid: unknown;
  hostname: unknown;
  processId?: unknown;
  name: unknown;
  kind: string;
  last_heartbeat_at?: { iso8601(): string };
  metadata?(): Attributes;
}

export class LogSubscriber extends BaseLogSubscriber {
  static override toString(): string {
    return "SolidQueue::LogSubscriber";
  }

  dispatchScheduled(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Dispatch scheduled jobs",
        ...slice(event.payload, "batch_size", "size"),
      }),
    );
  }

  claim(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Claim jobs",
        ...slice(event.payload, "process_id", "job_ids", "claimed_job_ids", "size"),
      }),
    );
  }

  releaseManyClaimed(event: Event): void {
    this.info(
      this.formattedEvent(event, {
        action: "Release claimed jobs",
        ...slice(event.payload, "size"),
      }),
    );
  }

  failManyClaimed(event: Event): void {
    this.warn(
      this.formattedEvent(event, {
        action: "Fail claimed jobs",
        ...slice(event.payload, "job_ids", "process_ids"),
      }),
    );
  }

  releaseClaimed(event: Event): void {
    this.info(
      this.formattedEvent(event, {
        action: "Release claimed job",
        ...slice(event.payload, "job_id", "process_id"),
      }),
    );
  }

  retryAll(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Retry failed jobs",
        ...slice(event.payload, "jobs_size", "size"),
      }),
    );
  }

  retry(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Retry failed job",
        ...slice(event.payload, "job_id"),
      }),
    );
  }

  discardAll(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Discard jobs",
        ...slice(event.payload, "jobs_size", "size", "status"),
      }),
    );
  }

  discard(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Discard job",
        ...slice(event.payload, "job_id", "status"),
      }),
    );
  }

  releaseManyBlocked(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Unblock jobs",
        ...slice(event.payload, "limit", "size"),
      }),
    );
  }

  releaseBlocked(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Release blocked job",
        ...slice(event.payload, "job_id", "concurrency_key", "released"),
      }),
    );
  }

  enqueueRecurringTask(event: Event): void {
    const attributes: Attributes = slice(event.payload, "task", "active_job_id", "enqueue_error");
    attributes.at = (event.payload.at as { iso8601(): string } | null | undefined)?.iso8601();

    if (attributes.active_job_id == null && event.payload.skipped == null) {
      this.error(
        this.formattedEvent(event, { action: "Error enqueuing recurring task", ...attributes }),
      );
    } else if (event.payload.other_adapter != null && event.payload.other_adapter !== false) {
      this.debug(
        this.formattedEvent(event, {
          action: "Enqueued recurring task outside Solid Queue",
          ...attributes,
        }),
      );
    } else {
      const action = isPresent(event.payload.skipped)
        ? "Skipped recurring task – already dispatched"
        : "Enqueued recurring task";
      this.debug(this.formattedEvent(event, { action: action, ...attributes }));
    }
  }

  startProcess(event: Event): void {
    const process = event.payload.process as LoggedProcess;

    const attributes = {
      pid: process.pid,
      hostname: process.hostname,
      process_id: process.processId,
      name: process.name,
      ...process.metadata!(),
    };

    this.info(this.formattedEvent(event, { action: `Started ${process.kind}`, ...attributes }));
  }

  shutdownProcess(event: Event): void {
    const process = event.payload.process as LoggedProcess;

    const attributes = {
      pid: process.pid,
      hostname: process.hostname,
      process_id: process.processId,
      name: process.name,
      ...process.metadata!(),
    };

    this.info(this.formattedEvent(event, { action: `Shutdown ${process.kind}`, ...attributes }));
  }

  registerProcess(event: Event): void {
    const processKind = event.payload.kind as string;
    const attributes = slice(event.payload, "pid", "hostname", "process_id", "name");

    const error = event.payload.error;
    if (error != null && error !== false) {
      this.warn(
        this.formattedEvent(event, {
          action: `Error registering ${processKind}`,
          ...attributes,
          error: this.formattedError(error as Error),
        }),
      );
    } else {
      this.debug(this.formattedEvent(event, { action: `Register ${processKind}`, ...attributes }));
    }
  }

  deregisterProcess(event: Event): void {
    const process = event.payload.process as LoggedProcess;

    const attributes = {
      process_id: process.id,
      pid: process.pid,
      hostname: process.hostname,
      name: process.name,
      last_heartbeat_at: process.last_heartbeat_at!.iso8601(),
      claimed_size: event.payload.claimed_size,
      pruned: event.payload.pruned,
    };

    const error = event.payload.error;
    if (error != null && error !== false) {
      this.warn(
        this.formattedEvent(event, {
          action: `Error deregistering ${process.kind}`,
          ...attributes,
          error: this.formattedError(error as Error),
        }),
      );
    } else {
      this.debug(
        this.formattedEvent(event, { action: `Deregister ${process.kind}`, ...attributes }),
      );
    }
  }

  pruneProcesses(event: Event): void {
    this.debug(
      this.formattedEvent(event, {
        action: "Prune dead processes",
        ...slice(event.payload, "size"),
      }),
    );
  }

  threadError(event: Event): void {
    this.error(
      this.formattedEvent(event, {
        action: "Error in thread",
        error: this.formattedError(event.payload.error as Error),
      }),
    );
  }

  gracefulTermination(event: Event): void {
    const attributes = slice(event.payload, "process_id", "supervisor_pid", "supervised_processes");

    const exceeded = event.payload.shutdown_timeout_exceeded;
    if (exceeded != null && exceeded !== false) {
      this.warn(
        this.formattedEvent(event, {
          action: "Supervisor wasn't terminated gracefully - shutdown timeout exceeded",
          ...attributes,
        }),
      );
    } else {
      this.info(
        this.formattedEvent(event, { action: "Supervisor terminated gracefully", ...attributes }),
      );
    }
  }

  immediateTermination(event: Event): void {
    this.info(
      this.formattedEvent(event, {
        action: "Supervisor terminated immediately",
        ...slice(event.payload, "process_id", "supervisor_pid", "supervised_processes"),
      }),
    );
  }

  unhandledSignalError(event: Event): void {
    this.error(
      this.formattedEvent(event, {
        action: "Received unhandled signal",
        ...slice(event.payload, "signal"),
      }),
    );
  }

  replaceFork(event: Event): void {
    const supervisorPid = event.payload.supervisor_pid;
    const status = event.payload.status as {
      exitstatus: unknown;
      pid: unknown;
      isSignaled(): boolean;
      stopsig: unknown;
      termsig: unknown;
    };
    const attributes = {
      ...slice(event.payload, "pid"),
      status: status.exitstatus ?? "no exit status set",
      pid_from_status: status.pid,
      signaled: status.isSignaled(),
      stopsig: status.stopsig,
      termsig: status.termsig,
    };

    const replacedFork = event.payload.fork as LoggedProcess | null | undefined;
    if (replacedFork != null) {
      this.info(
        this.formattedEvent(event, {
          action: `Replaced terminated ${replacedFork.kind}`,
          ...attributes,
          hostname: replacedFork.hostname,
          name: replacedFork.name,
        }),
      );
    } else if (supervisorPid !== 1) {
      this.warn(
        this.formattedEvent(event, {
          action: "Tried to replace forked process but it had already died",
          ...attributes,
        }),
      );
    }
  }

  /** @internal */
  private formattedEvent(
    event: Event,
    { action, ...attributes }: { action: string } & Attributes,
  ): string {
    return `SolidQueue-${VERSION} ${action} (${round(event.duration, 1)}ms)  ${this.formattedAttributes(attributes)}`;
  }

  /** @internal */
  private formattedAttributes(attributes: Attributes): string {
    return Object.entries(attributes)
      .map(([attr, value]) => `${attr}: ${rbInspect(value)}`)
      .join(", ");
  }

  /** @internal */
  private formattedError(error: Error): string {
    return [rbModName(rbObjClass(error)), error.message].filter((part) => part != null).join(" ");
  }

  override get logger(): Logger | null {
    return SolidQueue.logger;
  }
}
