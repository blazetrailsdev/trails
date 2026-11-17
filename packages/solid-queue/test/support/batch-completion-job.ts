import { Trails } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Batch } from "../../lib/index.js";
import { ApplicationJob } from "./application-job.js";

export class BatchCompletionJob extends ApplicationJob {
  declare batch: () => Promise<Batch | null>;

  static {
    this.queueAs("background");
  }

  async perform(): Promise<void> {
    Trails.logger?.info(`${await (await this.batch())!.jobs.size()} jobs completed!`);
  }
}
constSet(TopLevel, "BatchCompletionJob", BatchCompletionJob);
