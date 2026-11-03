import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertChanges } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import type { One } from "./attached/one.js";
import type { Attachment } from "./attachment.js";
import type { Blob } from "./blob.js";
import { createBlob, createFileBlob } from "./test-helpers/test-helper.js";
import { TransformJob } from "./transform-job.js";

class TransformJobTest extends TestCase {
  createsVariant(): void {}
}

type Processable = { isProcessed(): Promise<boolean> };

describe("ActiveStorage::TransformJobTest", { timeout: 30_000 }, () => {
  let blob: Blob;
  let t: TestHelper;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new TransformJobTest("createsVariant") as unknown as TestHelper;
    await t.beforeSetup();
    blob = await createFileBlob();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("creates variant", async () => {
    const transformations = { resizeToLimit: [100, 100] };

    await assertChanges(
      () => (blob.variant(transformations) as unknown as Processable).isProcessed(),
      null,
      { from: false, to: true },
      async () => {
        await t.performEnqueuedJobs({}, async () => {
          await TransformJob.performLater(blob, transformations);
        });
      },
    );
  });

  it("creates variant for previewable file", async () => {
    blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const transformations = { resizeToLimit: [100, 100] };

    await assertChanges(
      () => (blob.preview(transformations) as unknown as Processable).isProcessed(),
      null,
      { from: false, to: true },
      async () => {
        await t.performEnqueuedJobs({}, async () => {
          await TransformJob.performLater(blob, transformations);
        });
        await blob.reload();
      },
    );

    const image = blob.preview(transformations).image as One & Pick<Attachment, "variant">;
    await image.load();
    expect(
      await ((await image.variant(transformations)) as unknown as Processable).isProcessed(),
    ).toBe(true);
  });

  it("creates variant when untracked", async () => {
    const wasTracking = ActiveStorage.trackVariants;
    ActiveStorage.trackVariants = false;
    const transformations = { resizeToLimit: [100, 100] };

    try {
      await assertChanges(
        () => (blob.variant(transformations) as unknown as Processable).isProcessed(),
        null,
        { from: false, to: true },
        async () => {
          await t.performEnqueuedJobs({}, async () => {
            await TransformJob.performLater(blob, transformations);
          });
        },
      );
    } finally {
      ActiveStorage.trackVariants = wasTracking;
    }
  });

  it("ignores unrepresentable blob", async () => {
    const unrepresentableBlob = await createBlob({ contentType: "text/plain" });
    const transformations = { resizeToLimit: [100, 100] };

    await t.performEnqueuedJobs({}, async () => {
      await expect(
        TransformJob.performLater(unrepresentableBlob, transformations),
      ).resolves.toBeDefined();
    });
  });
});
