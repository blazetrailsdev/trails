import { afterEach, beforeEach, describe, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { AnalyzeJob } from "./analyze-job.js";
import type { Blob } from "./blob.js";
import { createBlob } from "./test-helpers/test-helper.js";

class AnalyzeJobTest extends TestCase {
  ignoresMissingBlob(): void {}
}

describe("ActiveStorage::AnalyzeJobTest", () => {
  let blob: Blob;
  let t: TestHelper;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new AnalyzeJobTest("ignoresMissingBlob") as unknown as TestHelper;
    await t.beforeSetup();
    blob = await createBlob();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("ignores missing blob", async () => {
    await blob.purge();

    await t.performEnqueuedJobs({}, async () => {
      await AnalyzeJob.performLater(blob);
    });
  });
});
