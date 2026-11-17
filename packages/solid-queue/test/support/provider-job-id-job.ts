import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";
import { JobBuffer } from "./add-to-buffer-job.js";

export class ProviderJobIdJob extends ApplicationJob {
  perform(): void {
    JobBuffer.add(`provider_job_id: ${this.providerJobId}`);
  }
}
constSet(TopLevel, "ProviderJobIdJob", ProviderJobIdJob);
