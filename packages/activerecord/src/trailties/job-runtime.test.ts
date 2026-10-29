import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base as JobBase } from "@blazetrails/activejob";
import { include } from "@blazetrails/ruby-compat";
import { JobRuntime } from "./job-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

class TestJob extends JobBase {
  async perform(): Promise<void> {
    RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 42.0);
  }
}
include(TestJob, JobRuntime);

async function notificationPayload(): Promise<Record<string, unknown> | null> {
  let payload: Record<string, unknown> | null = null;
  const subscriber = Notifications.subscribe("perform.active_job", (event: never) => {
    payload = (event as { payload: Record<string, unknown> }).payload;
  });

  await new TestJob().performNow();

  Notifications.unsubscribe(subscriber);

  return payload;
}

describe("JobRuntimeTest", () => {
  it("job notification payload includes db_runtime", async () => {
    RuntimeRegistry.setSqlRuntime(0.0);

    expect((await notificationPayload())!["dbRuntime"]).toBe(42);
  });

  it("db_runtime tracks database runtime for job only", async () => {
    RuntimeRegistry.setSqlRuntime(100.0);

    expect((await notificationPayload())!["dbRuntime"]).toBe(42.0);
    expect(RuntimeRegistry.sqlRuntime()).toBe(142.0);
  });
});
