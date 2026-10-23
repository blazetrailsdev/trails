import {
  Notifications,
  days,
  mattrAccessor,
  minutes,
  type Duration,
} from "@blazetrails/activesupport";

export const SolidQueue = {
  tableNamePrefix: "solid_queue_",

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
  connectsTo: Record<string, unknown> | null;
  useSkipLocked: boolean;
  preserveFinishedJobs: boolean;
  clearFinishedJobsAfter: Duration;
  defaultConcurrencyControlPeriod: Duration;
  isPreserveFinishedJobs(): boolean;
  instrument<T>(
    channel: string,
    options?: Record<string, unknown>,
    block?: (payload: Record<string, unknown>) => T,
  ): T extends undefined ? void : T;
};

mattrAccessor.call(SolidQueue, "connectsTo");
mattrAccessor.call(SolidQueue, "useSkipLocked", { default: true });
mattrAccessor.call(SolidQueue, "preserveFinishedJobs", { default: true });
mattrAccessor.call(SolidQueue, "clearFinishedJobsAfter", { default: days(1) });
mattrAccessor.call(SolidQueue, "defaultConcurrencyControlPeriod", { default: minutes(3) });
