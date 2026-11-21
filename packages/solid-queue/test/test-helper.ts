import { Job } from "../lib/job.js";
import { Process } from "../lib/process.js";
import { Semaphore } from "../lib/semaphore.js";
import { RecurringTask } from "../lib/recurring-task.js";
import { ScheduledExecution } from "../lib/scheduled-execution.js";
import { ReadyExecution } from "../lib/ready-execution.js";
import { ClaimedExecution } from "../lib/claimed-execution.js";
import { FailedExecution } from "../lib/failed-execution.js";
import { JobResult } from "./support/job-result.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { File } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../lib/solid-queue.js";
import { SolidQueueAdapter } from "../lib/active-job/queue-adapters/solid-queue-adapter.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { JobBuffer } from "./support/add-to-buffer-job.js";
import { silentOnThreadErrorFor } from "./support/jobs-test-helper.js";

type SolidQueueTestCase = TestCase & {
  constructor: { useTransactionalTests: boolean };
  _onThreadError: typeof SolidQueue.onThreadError;
};

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

TestCase.setup(async function (this: SolidQueueTestCase) {
  this._onThreadError = SolidQueue.onThreadError;
  SolidQueue.onThreadError = silentOnThreadErrorFor(ExpectedTestError, this._onThreadError);
  SolidQueueAdapter.stopping = false;

  if (!this.constructor.useTransactionalTests) {
    await destroyRecords();
  }
});

TestCase.teardown(async function (this: SolidQueueTestCase) {
  SolidQueue.onThreadError = this._onThreadError;
  JobBuffer.clear();

  if (SolidQueue.supervisorPidfile && (await File.isExistAsync(SolidQueue.supervisorPidfile))) {
    await File.deleteAsync(SolidQueue.supervisorPidfile);
  }

  if (!this.constructor.useTransactionalTests) {
    await destroyRecords();
  }
});
