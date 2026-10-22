import { Base, registerModel } from "@blazetrails/activerecord";
import { include, type Included } from "@blazetrails/activesupport";
import { GlobalID, Identification } from "@blazetrails/globalid";
import { rbFSleep, registerConstant } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class JobResult extends Base {
  declare queue_name: string | null;
  declare status: string | null;
  declare value: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface JobResult extends Included<typeof Identification> {}
include(JobResult, Identification);
GlobalID.setApp("dummy");
registerConstant("JobResult", JobResult);
registerModel(JobResult);

export class StoreResultJob extends ApplicationJob {
  static toString(): string {
    return "StoreResultJob";
  }

  static {
    this.queueAs("background");
  }

  async perform(
    value: unknown,
    {
      status = "completed",
      pause = null,
      exception = null,
    }: { status?: string; pause?: number | null; exception?: (new () => Error) | null } = {},
  ): Promise<void> {
    const result = await JobResult.createBang({
      queue_name: this.queueName,
      status: "started",
      value,
    });

    if (pause != null) await rbFSleep(pause);
    if (exception != null) throw new exception();

    await result.updateBang({ status });
  }
}
registerConstant("StoreResultJob", StoreResultJob);
