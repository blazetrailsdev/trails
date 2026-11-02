import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "./active-storage.js";
import "./test-helpers/database/setup.js";
import type { Blob } from "./blob.js";
import { PreviewImageJob } from "./preview-image-job.js";
import { createFileBlob } from "./test-helpers/test-helper.js";
import { TransformJob } from "./transform-job.js";

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
    await blob.previewImage.load();
    expect(blob.previewImage.isAttached()).toBe(false);
    await PreviewImageJob.performNow(blob, [transformation]);
    expect(blob.previewImage.isAttached()).toBe(true);
  });

  it("enqueues transform variant jobs", async () => {
    await t.assertEnqueuedWith({ job: TransformJob, args: [blob, transformation] }, async () => {
      await PreviewImageJob.performNow(blob, [transformation]);
    });
  });
});
