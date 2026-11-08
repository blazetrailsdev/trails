import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { UpdateResultJob } from "./update-result-job.js";

export class SequentialUpdateResultJob extends UpdateResultJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult });
  }
}
constSet(TopLevel, "SequentialUpdateResultJob", SequentialUpdateResultJob);
