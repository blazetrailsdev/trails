import { Job } from "../lib/job.js";
import { Process } from "../lib/process.js";
import { Semaphore } from "../lib/semaphore.js";
import { RecurringTask } from "../lib/recurring-task.js";
import { ScheduledExecution } from "../lib/scheduled-execution.js";
import { ReadyExecution } from "../lib/ready-execution.js";
import { ClaimedExecution } from "../lib/claimed-execution.js";
import { FailedExecution } from "../lib/failed-execution.js";
import { JobResult } from "./support/job-result.js";

export async function destroyRecords() {
  await Job.destroyAll();
  await Process.destroyAll();
  await Semaphore.deleteAll();
  await RecurringTask.deleteAll();
  await ScheduledExecution.deleteAll();
  await ReadyExecution.deleteAll();
  await ClaimedExecution.deleteAll();
  await FailedExecution.deleteAll();
  await JobResult.deleteAll();
}
