import { beforeEach, describe, expect, it } from "vitest";
import { noon, tomorrow } from "@blazetrails/activesupport/core-ext/date/calculations";
import { isAdapterIs } from "./test-helpers/helper.js";
import { Base } from "./base.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import type { AsyncAdapter } from "./queue-adapters/async-adapter.js";

describe.skipIf(!isAdapterIs("async"))("AsyncAdapterTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
    (Base.queueAdapter as AsyncAdapter).immediate = true;
  });

  it("in immediate run, perform_later runs immediately", async () => {
    await HelloJob.performLater("Alex");
    expect(JobBuffer.lastValue()).toMatch(/Alex/);
  });

  it("in immediate run, enqueue with wait: runs immediately", async () => {
    await (
      HelloJob.set({ waitUntil: noon(tomorrow()) }) as {
        performLater(...args: unknown[]): Promise<unknown>;
      }
    ).performLater("Alex");
    expect(JobBuffer.lastValue()).toMatch(/Alex/);
  });
});
