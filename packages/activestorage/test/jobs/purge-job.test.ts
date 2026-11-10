import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDifference,
  assertNothingRaised,
} from "@blazetrails/activesupport/testing/assertions";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import "../support/database/setup.js";
import { ActiveStorage } from "../../lib/active-storage.js";
import { Blob } from "../../lib/blob.js";
import { PurgeJob } from "../../lib/purge-job.js";
import { createBlob } from "../support/test-helper.js";

class PurgeJobTest extends TestCase {
  purges(): void {}
}

describe("ActiveStorage::PurgeJobTest", () => {
  let blob: Blob;
  let t: TestHelper;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new PurgeJobTest("purges") as unknown as TestHelper;
    await t.beforeSetup();
    blob = await createBlob();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("purges", async () => {
    await assertDifference(
      () => Blob.count(),
      -1,
      null,
      async () => {
        await PurgeJob.performNow(blob);
      },
    );

    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await Blob.service!.isExist(blob.key)).toBeFalsy();
  });

  it("ignores missing blob", async () => {
    await blob.purge();

    await t.performEnqueuedJobs({}, async () => {
      await assertNothingRaised(async () => {
        await PurgeJob.performLater(blob);
      });
    });
  });
});
