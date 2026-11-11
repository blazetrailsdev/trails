import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { UpdateResultJob } from "./update-result-job.js";

export class ThrottledUpdateResultJob extends UpdateResultJob {
  static {
    this.limitsConcurrency({ to: 3, key: (jobResult: unknown) => jobResult });
  }
}
constSet(TopLevel, "ThrottledUpdateResultJob", ThrottledUpdateResultJob);
