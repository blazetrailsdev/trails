import { beforeEach, describe, it } from "vitest";
import { assertChanges } from "@blazetrails/activesupport/testing/assertions";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "../../lib/active-storage.js";
import "../support/database/setup.js";
import type { Blob } from "../../lib/blob.js";
import { PreviewImageJob } from "../../lib/preview-image-job.js";
import { createFileBlob } from "../support/test-helper.js";
import { TransformJob } from "../../lib/transform-job.js";

class PreviewImageJobTest extends TestCase {
  previewImageJob(): void {}
}

describe("ActiveStorage::PreviewImageJobTest", () => {
  let blob: Blob;
  let t: TestHelper;
  const transformation = { resizeToLimit: [100, 100] };

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new PreviewImageJobTest("previewImageJob") as unknown as TestHelper;
    await t.beforeSetup();
    blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
  });

  it("creates preview", async () => {
    await assertChanges(
      async () => {
        await blob.previewImage.load();
        return blob.previewImage.isAttached();
      },
      null,
      { from: false, to: true },
      async () => {
        await PreviewImageJob.performNow(blob, [transformation]);
      },
    );
  });

  it("enqueues transform variant jobs", async () => {
    await t.assertEnqueuedWith({ job: TransformJob, args: [blob, transformation] }, async () => {
      await PreviewImageJob.performNow(blob, [transformation]);
    });
  });
});
