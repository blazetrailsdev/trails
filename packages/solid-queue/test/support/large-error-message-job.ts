import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";
import { ExpectedTestError } from "./expected-test-error.js";

export class LargeErrorMessageJob extends ApplicationJob {
  static {
    this.queueAs("background");
  }

  perform(messageSize: number): void {
    throw new ExpectedTestError("x".repeat(messageSize));
  }
}
constSet(TopLevel, "LargeErrorMessageJob", LargeErrorMessageJob);
