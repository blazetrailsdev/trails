import {
  Logger,
  Notifications,
  runLoadHooks,
  days,
  mattrAccessor,
  minutes,
  seconds,
  type Duration,
} from "@blazetrails/activesupport";
import { STDOUT } from "@blazetrails/ruby-compat";

export const SolidQueue = {
  name: "SolidQueue",
  tableNamePrefix: "solid_queue_",

  DEFAULT_LOGGER: new Logger(STDOUT),

  onWorkerStart(block: () => unknown): void {
    SolidQueue.Worker!.onStart(block);
  },

  onWorkerStop(block: () => unknown): void {
    SolidQueue.Worker!.onStop(block);
  },

  onDispatcherStart(block: () => unknown): void {
    SolidQueue.Dispatcher!.onStart(block);
  },

  onDispatcherStop(block: () => unknown): void {
    SolidQueue.Dispatcher!.onStop(block);
  },

  onSchedulerStart(block: () => unknown): void {
    SolidQueue.Scheduler!.onStart(block);
  },

  onSchedulerStop(block: () => unknown): void {
    SolidQueue.Scheduler!.onStop(block);
  },

  isSilencePolling(): boolean {
    return SolidQueue.silencePolling;
  },

  isPreserveFinishedJobs(): boolean {
    return SolidQueue.preserveFinishedJobs;
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
  tableNamePrefix: string;
  DEFAULT_LOGGER: Logger;
  logger: Logger;
  appExecutor: { wrap<T>(block: () => T, options?: { source?: string }): T } | null;
  onThreadError: ((error: unknown) => unknown) | null;
  connectsTo: Record<string, unknown> | null;
  useSkipLocked: boolean;
  processHeartbeatInterval: Duration;
  shutdownTimeout: Duration;
  silencePolling: boolean;
  preserveFinishedJobs: boolean;
  clearFinishedJobsAfter: Duration;
  defaultConcurrencyControlPeriod: Duration;
  Worker?: { onStart(block: () => unknown): void; onStop(block: () => unknown): void };
  onWorkerStart(block: () => unknown): void;
  onWorkerStop(block: () => unknown): void;
  Dispatcher?: { onStart(block: () => unknown): void; onStop(block: () => unknown): void };
  Scheduler?: { onStart(block: () => unknown): void; onStop(block: () => unknown): void };
  onSchedulerStart(block: () => unknown): void;
  onSchedulerStop(block: () => unknown): void;
  onDispatcherStart(block: () => unknown): void;
  onDispatcherStop(block: () => unknown): void;
  isSilencePolling(): boolean;
  isPreserveFinishedJobs(): boolean;
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
mattrAccessor.call(SolidQueue, "shutdownTimeout", { default: seconds(5) });
mattrAccessor.call(SolidQueue, "silencePolling", { default: true });
mattrAccessor.call(SolidQueue, "preserveFinishedJobs", { default: true });
mattrAccessor.call(SolidQueue, "clearFinishedJobsAfter", { default: days(1) });
mattrAccessor.call(SolidQueue, "defaultConcurrencyControlPeriod", { default: minutes(3) });

runLoadHooks("solid_queue", SolidQueue);
