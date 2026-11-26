import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import "./test-helper.js";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { Process, Record, RecurringTask, Scheduler } from "../lib/index.js";
import "./support/add-to-buffer-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { waitForRegisteredProcesses } from "./support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";

class SchedulerFileDatabaseTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
registerSpecType(
  (desc: string) => desc === "Scheduler on a file SQLite queue database",
  SchedulerFileDatabaseTest,
);

describe.runIf(Record.connectionDbConfig().adapter === "sqlite3")(
  "Scheduler on a file SQLite queue database",
  () => {
    beforeAll(async () => {
      await loadAppSchema();
    });

    afterEach(async () => {
      await Process.destroyAll();
      await RecurringTask.deleteAll();
    });

    it("registers while another connection holds the write lock", async () => {
      const { database } = Record.connectionDbConfig();
      await RecurringTask.loadSchema();
      const holder = new SQLite3Adapter({ database: database!, timeout: 1000 });
      await holder.execute("BEGIN IMMEDIATE");
      const commit = new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
        holder.execute("COMMIT"),
      );

      const scheduler = new Scheduler({
        recurringTasks: new Map([
          ["example_task", { class: "AddToBufferJob", schedule: "every hour", args: 42 }],
        ]),
      });
      try {
        await scheduler.start();
        await waitForRegisteredProcesses(1, { timeout: 2 });
        expect(await Process.where({ kind: "Scheduler" }).count()).toBe(1);
      } finally {
        await scheduler.stop();
        await commit;
        await holder.disconnectBang();
      }
    });
  },
);
