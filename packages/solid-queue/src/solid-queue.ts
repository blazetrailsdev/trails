import {
  Notifications,
  days,
  mattrAccessor,
  minutes,
  seconds,
  type Duration,
} from "@blazetrails/activesupport";

export const SolidQueue = {
  tableNamePrefix: "solid_queue_",

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
  tableNamePrefix: string;
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
  isSilencePolling(): boolean;
  isPreserveFinishedJobs(): boolean;
  instrument<T>(
    channel: string,
    options?: Record<string, unknown>,
    block?: (payload: Record<string, unknown>) => T,
  ): T extends undefined ? void : T;
};

mattrAccessor.call(SolidQueue, "appExecutor", "onThreadError", "connectsTo");
mattrAccessor.call(SolidQueue, "useSkipLocked", { default: true });
mattrAccessor.call(SolidQueue, "processHeartbeatInterval", { default: seconds(60) });
mattrAccessor.call(SolidQueue, "shutdownTimeout", { default: seconds(5) });
mattrAccessor.call(SolidQueue, "silencePolling", { default: true });
mattrAccessor.call(SolidQueue, "preserveFinishedJobs", { default: true });
mattrAccessor.call(SolidQueue, "clearFinishedJobsAfter", { default: days(1) });
mattrAccessor.call(SolidQueue, "defaultConcurrencyControlPeriod", { default: minutes(3) });
