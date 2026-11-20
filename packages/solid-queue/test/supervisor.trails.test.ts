import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import "./test-helper.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Process as RubyProcess, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { FailedExecution, Job, Process, SolidQueueAdapter } from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { UpdateResultJob } from "./support/update-result-job.js";
import {
  runSupervisor,
  waitFor,
  waitForRegisteredProcesses,
} from "./support/processes-test-helper.js";

class ForkSupervisorTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ForkSupervisorTest", ForkSupervisorTest);

describe("ForkSupervisorTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    await waitForRegisteredProcesses(0, { timeout: 5 });
    await Job.destroyAll();
    await JobResult.deleteAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("replaces a forked worker killed with KILL and fails the jobs it had claimed", async () => {
    const run = runSupervisor({
      workers: [{ queues: "default", pollingInterval: 0.1 }],
      dispatchers: [],
    });
    await waitForRegisteredProcesses(2, { timeout: 10 });

    const worker = (await Process.findBy({ kind: "Worker" }))!;
    expect(worker.pid).not.toEqual(RubyProcess.pid);
    expect((await worker.supervisor)!.pid).toEqual(RubyProcess.pid);

    const result = await JobResult.createBang({ queue_name: "default", status: "" });
    await UpdateResultJob.performLater(result, { name: "killed", pause: 30 });
    const job = (await Job.last())!;
    await waitFor({ timeout: 3 }, async () => await (await job.reload()).isClaimed());

    RubyProcess.kill("KILL", worker.pid);

    await waitFor({ timeout: 10 }, async () => {
      const workers = await Process.where({ kind: "Worker" }).toArray();
      return workers.some((replacement) => replacement.pid !== worker.pid);
    });
    const failed = (await FailedExecution.last())!;
    expect(String(failed.error!.message)).toContain(
      `Process pid=${worker.pid} exited unexpectedly. Received unhandled signal 9.`,
    );

    await run.terminate();
  }, 30_000);
});
