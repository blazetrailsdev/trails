import "./test-helpers/database/setup.js";
import { assertDifference, assertNoDifference } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { assertQueriesCount } from "@blazetrails/activerecord/testing/query-assertions";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActiveStorage } from "./active-storage.js";
import type { Attachment } from "./attachment.js";
import type { Blob } from "./blob.js";
import { Current } from "./current.js";
import { PurgeJob } from "./purge-job.js";
import {
  User,
  createFileBlob,
  directlyUploadFileBlob,
  readImage,
} from "./test-helpers/test-helper.js";
import { VariantRecord } from "./variant-record.js";
import type { VariantWithRecord } from "./variant-with-record.js";

class VariantWithRecordTest extends TestCase {
  destroyDeletesFileFromService(): void {}
}

type Rep = {
  processed(): Promise<unknown>;
  key: Promise<string | null> | string;
};
type Representable = { representation(transformations: unknown): Promise<unknown> };

describe("ActiveStorage::VariantWithRecordTest", { timeout: 60_000 }, () => {
  let wasTracking: boolean;
  let t: TestHelper;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
    wasTracking = ActiveStorage.trackVariants;
    ActiveStorage.trackVariants = true;
    t = new VariantWithRecordTest("destroyDeletesFileFromService") as unknown as TestHelper;
    await t.beforeSetup();
  });

  afterEach(async () => {
    ActiveStorage.trackVariants = wasTracking;
    await t.afterTeardown();
    Current.reset();
  });

  const variantOf = (blob: Blob, transformations: unknown) =>
    blob.variant(transformations as never) as VariantWithRecord;

  const representationOf = async (attachable: unknown, transformations: unknown) =>
    (await (attachable as Representable).representation(transformations)) as Rep;

  it("generating a resized variation of a JPEG blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = variantOf(blob, { resizeToLimit: [100, 100] });

    await assertDifference(
      () => blob.variantRecords.count(),
      +1,
      null,
      async () => {
        await variant.processed();
      },
    );

    expect(await variant.url()).toMatch(/racecar\.jpg/);
    expect(variant.filename.toString()).toBe("racecar.jpg");
    expect(variant.contentType).toBe("image/jpeg");

    const image = await readImage((await variant.image) as never);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);

    const record = (await blob.variantRecords.last()) as VariantRecord;
    expect(record.variation_digest).toBe(variant.variation.digest);
  });

  it("serving a previously-generated resized variation of a JPEG blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });

    await assertDifference(
      () => blob.variantRecords.count(),
      async () => {
        await variantOf(blob, { resizeToLimit: [100, 100] }).processed();
      },
    );

    const variant = variantOf(blob, { resizeToLimit: [100, 100] });

    await assertNoDifference(
      () => blob.variantRecords.count(),
      null,
      async () => {
        await variant.processed();
      },
    );

    expect(await variant.url()).toMatch(/racecar\.jpg/);

    const image = await readImage((await variant.image) as never);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
  });

  it("variant of a blob is on the same service", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", serviceName: "local_public" });
    const variant = await variantOf(blob, { resizeToLimit: [100, 100] }).processed();

    const image = (await variant.image) as unknown as { blob: Promise<Blob> };
    expect((await image.blob).service_name).toBe("local_public");
  });

  // BLOCKED: variant-with-record-eager-load-query-counts
  it.skip("eager loading has_one_attached record", () => {});

  async function findKeysForRepresentation(filename: string): Promise<void> {
    const user = await User.createBang({ name: "Justin" });

    for (let i = 0; i < 10; i++) {
      const blob = await directlyUploadFileBlob({ filename: filename });
      await user.highlightsWithVariants.attach(blob);
    }

    for (const highlight of (await user.highlightsWithVariants.toArray()) as Attachment[]) {
      const rep = await representationOf(highlight, "thumb");
      await rep.processed();
      await rep.key;
    }

    const found = (await (User as unknown as { withAttachedHighlightsWithVariants(): typeof User })
      .withAttachedHighlightsWithVariants()
      .findBy({ name: "Justin" })) as User;
    const highlights = (await found.highlightsWithVariants.toArray()) as Attachment[];

    await assertQueriesCount(0, false, async () => {
      for (const highlight of highlights) {
        await (
          await representationOf(highlight, "thumb")
        ).key;
      }
    });
  }

  it("with attached image variant no n plus 1", async () => {
    await findKeysForRepresentation("racecar.jpg");
  });

  it("with attached video variant no n plus 1", async () => {
    await findKeysForRepresentation("video.mp4");
  });

  it("no n plus 1 with all variant records on attached video", async () => {
    const user = await User.createBang({ name: "Justin" });

    for (let i = 0; i < 10; i++) {
      const blob = await directlyUploadFileBlob({ filename: "video.mp4" });
      await user.highlightsWithVariants.attach(blob);
    }

    for (const highlight of (await user.highlightsWithVariants.toArray()) as Attachment[]) {
      const rep = await representationOf(highlight, "thumb");
      await rep.processed();
      await rep.key;
    }

    await user.reload();

    const highlights = await (
      user.highlightsWithVariants as unknown as {
        withAllVariantRecords(): { toArray(): Promise<Attachment[]> };
      }
    )
      .withAllVariantRecords()
      .toArray();

    await assertQueriesCount(0, false, async () => {
      for (const highlight of highlights) {
        await (
          await representationOf(highlight, "thumb")
        ).key;
      }
    });
  });

  // BLOCKED: variant-with-record-eager-load-query-counts
  it.skip("eager loading has_many_attached records", () => {});

  it("destroy deletes file from service", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { resizeToLimit: [100, 100] }).processed();

    expect(await VariantRecord.count()).toBe(1);
    expect(await blob.service.isExist((await variant.key)!)).toBe(true);

    await variant.destroy();

    expect(await VariantRecord.count()).toBe(0);
    const image = (await variant.image) as unknown as { blob: Promise<Blob> } | null;
    await t.assertEnqueuedWith({ job: PurgeJob, args: [await image?.blob] });
  });
});
