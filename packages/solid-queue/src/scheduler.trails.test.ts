import { afterEach, describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";
import { Process, Record, RecurringTask, Scheduler } from "./index.js";
import "./test-helpers/add-to-buffer-job.js";

describe.runIf(Record.connectionDbConfig().adapter === "sqlite3")(
  "Scheduler on a file SQLite queue database",
  () => {
    afterEach(async () => {
      await Process.destroyAll();
      await RecurringTask.deleteAll();
    });

    it("registers while another connection holds the write lock", async () => {
      const { database } = Record.connectionDbConfig();
      await RecurringTask.loadSchema();
      const holder = new BetterSQLite3Adapter({ database: database!, timeout: 1000 });
      await holder.execute("BEGIN IMMEDIATE");
      setTimeout(() => void holder.execute("COMMIT"), 50);

      const scheduler = new Scheduler({
        recurringTasks: new Map([
          ["example_task", { class: "AddToBufferJob", schedule: "every hour", args: 42 }],
        ]),
      });
      try {
        await scheduler.start();
        expect(await Process.where({ kind: "Scheduler" }).count()).toBe(1);
      } finally {
        await scheduler.stop();
        await holder.disconnectBang();
      }
    });
  },
);
