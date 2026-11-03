import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";

export const JobBuffer = {
  values: [] as unknown[],

  add(value: unknown): void {
    JobBuffer.values.push(value);
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
