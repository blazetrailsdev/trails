import {
  Deprecation,
  Logger,
  Notifications,
  runLoadHooks,
  days,
  delegate,
  mattrAccessor,
  minutes,
  seconds,
  TimeZone,
  type Duration,
} from "@blazetrails/activesupport";
import { STDOUT, TopLevel, constSet } from "@blazetrails/ruby-compat";

import { nextMajorVersion } from "./version.js";

let _timeZone: string | null = null;
let _deprecator: Deprecation | undefined;

export const SolidQueue = {
  name: "SolidQueue",

  Processes: { name: "SolidQueue::Processes" },

  DEFAULT_LOGGER: new Logger(STDOUT),

  onWorkerStart(block: () => unknown): void {
    SolidQueue.Worker!.onStart(block);
  },

  onWorkerStop(block: () => unknown): void {
    SolidQueue.Worker!.onStop(block);
  },

  onWorkerExit(block: () => unknown): void {
    SolidQueue.Worker!.onExit(block);
  },

  onDispatcherStart(block: () => unknown): void {
    SolidQueue.Dispatcher!.onStart(block);
  },

  onDispatcherStop(block: () => unknown): void {
    SolidQueue.Dispatcher!.onStop(block);
  },

  onDispatcherExit(block: () => unknown): void {
    SolidQueue.Dispatcher!.onExit(block);
  },

  onSchedulerStart(block: () => unknown): void {
    SolidQueue.Scheduler!.onStart(block);
  },

  onSchedulerStop(block: () => unknown): void {
    SolidQueue.Scheduler!.onStop(block);
  },

  onSchedulerExit(block: () => unknown): void {
    SolidQueue.Scheduler!.onExit(block);
  },

  get timeZone(): string | null {
    return _timeZone;
  },

  setTimeZone(zone: unknown): void {
    if (zone != null && zone !== false) {
      const resolved =
        typeof (zone as { tzinfo?: unknown }).tzinfo !== "undefined"
          ? (zone as TimeZone)
          : TimeZone.find(zone);
      _timeZone = resolved?.tzinfo?.name ?? String(zone);
    } else {
      _timeZone = null;
    }
  },

  async scheduleRecurringTask(
    key: string,
    options: { [key: string]: unknown } = {},
  ): Promise<unknown> {
    return await SolidQueue.RecurringTask!.createDynamicTask(key, options);
  },

  async unscheduleRecurringTask(key: string): Promise<unknown> {
    return await SolidQueue.RecurringTask!.deleteDynamicTask(key);
  },

  isSupervisor(): boolean {
    return SolidQueue.supervisor;
  },

  isSilencePolling(): boolean {
    return SolidQueue.silencePolling;
  },

  isPreserveFinishedJobs(): boolean {
    return SolidQueue.preserveFinishedJobs;
  },

  deprecator(): Deprecation {
    return (_deprecator ??= new Deprecation(String(nextMajorVersion()), "SolidQueue"));
  },

  instrument<T>(
    channel: string,
    options: Record<string, unknown> = {},
    block?: (payload: Record<string, unknown>) => T,
  ): T extends undefined ? void : T {
    return Notifications.instrument(`${channel}.solid_queue`, options, block) as never;
  },
} as {
  name: string;
  Processes: { name: string };
  DEFAULT_LOGGER: Logger;
  logger: Logger;
  appExecutor: { wrap<T>(block: () => T, options?: { source?: string }): T } | null;
  onThreadError: ((error: unknown) => unknown) | null;
  connectsTo: Record<string, unknown> | null;
  useSkipLocked: boolean;
  processHeartbeatInterval: Duration;
  processAliveThreshold: Duration;
  shutdownTimeout: Duration;
  forkBootTimeout: Duration;
  silencePolling: boolean;
  supervisorPidfile: unknown;
  supervisor: boolean;
  preserveFinishedJobs: boolean;
  clearFinishedJobsAfter: Duration;
  defaultConcurrencyControlPeriod: Duration;
  Worker?: {
    onStart(block: () => unknown): void;
    onStop(block: () => unknown): void;
    onExit(block: () => unknown): void;
  };
  onWorkerExit(block: () => unknown): void;
  onWorkerStart(block: () => unknown): void;
  onWorkerStop(block: () => unknown): void;
  Dispatcher?: {
    onStart(block: () => unknown): void;
    onStop(block: () => unknown): void;
    onExit(block: () => unknown): void;
  };
  onDispatcherExit(block: () => unknown): void;
  Scheduler?: {
    onStart(block: () => unknown): void;
    onStop(block: () => unknown): void;
    onExit(block: () => unknown): void;
  };
  onSchedulerExit(block: () => unknown): void;
  Supervisor?: typeof import("./supervisor.js").Supervisor;
  onStart(block: () => unknown): void;
  onStop(block: () => unknown): void;
  onExit(block: () => unknown): void;
  Process?: typeof import("./process.js").Process;
  Job?: typeof import("./job.js").Job;
  Batch?: typeof import("./batch.js").Batch;
  BatchExecution?: typeof import("./batch-execution.js").BatchExecution;
  onSchedulerStart(block: () => unknown): void;
  onSchedulerStop(block: () => unknown): void;
  onDispatcherStart(block: () => unknown): void;
  onDispatcherStop(block: () => unknown): void;
  readonly timeZone: string | null;
  setTimeZone(zone: unknown): void;
  scheduleRecurringTask(key: string, options?: { [key: string]: unknown }): Promise<unknown>;
  unscheduleRecurringTask(key: string): Promise<unknown>;
  RecurringTask?: typeof import("./recurring-task.js").RecurringTask;
  isSupervisor(): boolean;
  isSilencePolling(): boolean;
  isPreserveFinishedJobs(): boolean;
  deprecator(): Deprecation;
  instrument<T>(
    channel: string,
    options?: Record<string, unknown>,
    block?: (payload: Record<string, unknown>) => T,
  ): T extends undefined ? void : T;
};

mattrAccessor.call(SolidQueue, "logger", { default: SolidQueue.DEFAULT_LOGGER });
mattrAccessor.call(SolidQueue, "appExecutor", "onThreadError", "connectsTo");
mattrAccessor.call(SolidQueue, "useSkipLocked", { default: true });
mattrAccessor.call(SolidQueue, "processHeartbeatInterval", { default: seconds(60) });
mattrAccessor.call(SolidQueue, "processAliveThreshold", { default: minutes(5) });
mattrAccessor.call(SolidQueue, "forkBootTimeout", { default: minutes(5) });
mattrAccessor.call(SolidQueue, "shutdownTimeout", { default: seconds(5) });
mattrAccessor.call(SolidQueue, "silencePolling", { default: true });
mattrAccessor.call(SolidQueue, "supervisorPidfile");
mattrAccessor.call(SolidQueue, "supervisor", { default: false });

mattrAccessor.call(SolidQueue, "preserveFinishedJobs", { default: true });
mattrAccessor.call(SolidQueue, "clearFinishedJobsAfter", { default: days(1) });
mattrAccessor.call(SolidQueue, "defaultConcurrencyControlPeriod", { default: minutes(3) });

delegate.call(SolidQueue, "onStart", "onStop", "onExit", { to: "Supervisor" });

constSet(TopLevel, "SolidQueue", SolidQueue);

runLoadHooks("solid_queue", SolidQueue);
