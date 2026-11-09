import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";
import { sleep } from "./processes-test-helper.js";
import type { JobResult } from "./job-result.js";

export class UpdateResultJob extends ApplicationJob {
  async perform(
    jobResult: JobResult,
    {
      name,
      pause = null,
      exception = null,
    }: { name: string; pause?: number | null; exception?: (new () => Error) | null },
  ): Promise<void> {
    jobResult.status += `s${name}`;

    if (pause != null) await sleep(pause);
    if (exception != null) throw new exception();

    jobResult.status += `c${name}`;
    await jobResult.saveBang();
  }
}
constSet(TopLevel, "UpdateResultJob", UpdateResultJob);
