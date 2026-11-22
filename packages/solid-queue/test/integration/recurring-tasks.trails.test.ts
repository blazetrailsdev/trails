import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Record, RecurringTask, SolidQueue, SolidQueueAdapter } from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import "../support/add-to-buffer-job.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  isProcessExists,
  runSupervisorAsFork,
  terminateProcess,
  waitFor,
  waitForRegisteredProcesses,
} from "../support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import "../test-helper.js";

class ForkedRecurringTasksTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ForkedRecurringTasksTest", ForkedRecurringTasksTest);

describe("ForkedRecurringTasksTest", { timeout: 30_000 }, () => {
  let pid: number | null = null;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    if (pid != null && isProcessExists(pid)) {
      await terminateProcess(pid);
      await waitForRegisteredProcesses(0, { timeout: SolidQueue.shutdownTimeout.toF() });
    }
    vi.restoreAllMocks();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("a forked scheduler persists the configured recurring tasks", async () => {
    pid = runSupervisorAsFork({
      skipRecurring: false,
      recurringScheduleFile: `${import.meta.dirname}/../support/dummy/config/recurring_in_fork.yml`,
    });
    await waitForRegisteredProcesses(5, { timeout: 10 });
    await waitFor(
      { timeout: 5 },
      async () => (await RecurringTask.findBy({ key: "periodic_add_to_buffer" })) != null,
    );

    const task = await Record.uncached(() =>
      RecurringTask.findBy({ key: "periodic_add_to_buffer" }),
    );
    expect(task?.schedule).toBe("every second");
    expect(task?.class_name).toBe("AddToBufferJob");
    expect(task?.arguments).toEqual([42]);
  });
});
