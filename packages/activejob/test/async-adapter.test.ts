import { beforeEach, describe, expect, it } from "vitest";
import { noon, tomorrow } from "@blazetrails/activesupport/core-ext/date/calculations";
import { isAdapterIs } from "./helper.js";
import { Base } from "../lib/base.js";
import { HelloJob } from "./jobs/hello-job.js";
import { JobBuffer } from "./support/job-buffer.js";
import type { AsyncAdapter } from "../lib/queue-adapters/async-adapter.js";

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
