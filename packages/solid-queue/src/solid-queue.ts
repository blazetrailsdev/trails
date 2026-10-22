import { Notifications, mattrAccessor } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { Job } from "./job.js";
import type { ReadyExecution } from "./ready-execution.js";
import type { ScheduledExecution } from "./scheduled-execution.js";

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
  Job: typeof Job;
  ReadyExecution: typeof ReadyExecution;
  ScheduledExecution: typeof ScheduledExecution;
  tableNamePrefix: string;
  connectsTo: Record<string, unknown> | null;
  useSkipLocked: boolean;
  preserveFinishedJobs: boolean;
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

registerConstant("SolidQueue", SolidQueue);
