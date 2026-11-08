import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";

export const JobBuffer = {
  values: [] as unknown[],

  clear(): void {
    JobBuffer.values.length = 0;
  },

  size(): number {
    return JobBuffer.values.length;
  },

  add(value: unknown): void {
    JobBuffer.values.push(value);
  },

  lastValue(): unknown {
    return JobBuffer.values.at(-1) ?? null;
  },

  isInclude(value: unknown): boolean {
    return JobBuffer.values.includes(value);
  },
};

export class AddToBufferJob extends ApplicationJob {
  static {
    this.queueAs("background");
  }

  perform(arg: unknown): void {
    JobBuffer.add(arg);
  }
}
constSet(TopLevel, "AddToBufferJob", AddToBufferJob);
