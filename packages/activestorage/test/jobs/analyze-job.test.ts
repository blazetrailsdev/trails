import { afterEach, beforeEach, describe, it } from "vitest";
import { assertNothingRaised } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import "../support/database/setup.js";
import { ActiveStorage } from "../../lib/active-storage.js";
import { AnalyzeJob } from "../../lib/analyze-job.js";
import type { Blob } from "../../lib/blob.js";
import { createBlob } from "../support/test-helper.js";

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
      await assertNothingRaised(async () => {
        await AnalyzeJob.performLater(blob);
      });
    });
  });
});
