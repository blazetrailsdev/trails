import { registerConstant } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";

export const JobBuffer = {
  values: [] as unknown[],

  add(value: unknown): void {
    JobBuffer.values.push(value);
  },
};

export class AddToBufferJob extends ApplicationJob {
  static toString(): string {
    return "AddToBufferJob";
  }

  static {
    this.queueAs("background");
  }

  perform(arg: unknown): void {
    JobBuffer.add(arg);
  }
}
registerConstant("AddToBufferJob", AddToBufferJob);
