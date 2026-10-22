import {
  Notifications,
  days,
  mattrAccessor,
  minutes,
  type Duration,
} from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { BlockedExecution } from "./blocked-execution.js";
import type { ClaimedExecution } from "./claimed-execution.js";
import type { FailedExecution } from "./failed-execution.js";
import type { Job } from "./job.js";
import type { Pause } from "./pause.js";
import type { ReadyExecution } from "./ready-execution.js";
import type { RecurringExecution } from "./recurring-execution.js";
import type { ScheduledExecution } from "./scheduled-execution.js";
import type { Semaphore } from "./semaphore.js";

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
  BlockedExecution: typeof BlockedExecution;
  ClaimedExecution: typeof ClaimedExecution;
  FailedExecution: typeof FailedExecution;
  Job: typeof Job;
  Pause: typeof Pause;
  ReadyExecution: typeof ReadyExecution;
  RecurringExecution: typeof RecurringExecution;
  ScheduledExecution: typeof ScheduledExecution;
  Semaphore: typeof Semaphore;
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

registerConstant("SolidQueue", SolidQueue);
