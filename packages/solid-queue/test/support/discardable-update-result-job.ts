import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { UpdateResultJob } from "./update-result-job.js";

export class DiscardableUpdateResultJob extends UpdateResultJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult, onConflict: "discard" });
  }
}
constSet(TopLevel, "DiscardableUpdateResultJob", DiscardableUpdateResultJob);
