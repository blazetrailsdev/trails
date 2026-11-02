import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentTimeInstant, Duration, stub, travel, travelBack } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activerecord";
import { OpenSSL, StringIO } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import type { MirrorService } from "./service/mirror-service.js";
import {
  createBlob,
  createBlobBeforeDirectUpload,
  directlyUploadFileBlob,
  User,
  withService,
} from "./test-helpers/test-helper.js";

const signedIdOf = (user: User, options?: Parameters<Attachment["signedId"]>[0]) =>
  (user.avatar as unknown as Attachment).signedId(options);

async function assertBlobIdentifiedBeforeOwnerValidated(
  owner: User,
  blob: Blob,
  contentType: string,
  block: () => Promise<unknown>,
): Promise<void> {
  let validatedContentType: string | null = null;

  (owner.constructor as typeof User).validate(() => {
    validatedContentType ??= blob.content_type;
  });

  await block();

  expect(validatedContentType).toBe(contentType);
  await blob.reload();
  expect(blob.content_type).toBe(contentType);
}

async function assertBlobIdentifiedOutsideTransaction(
  blob: Blob,
  block: () => Promise<void>,
): Promise<void> {
  const connection = await Base.leaseConnection();
  const baselineTransactionDepth = connection.openTransactions();
  let maxTransactionDepth = -1;

  const trackTransactionDepth = () => {
    maxTransactionDepth = Math.max(connection.openTransactions(), maxTransactionDepth);
  };

  await stub(blob, "identifyWithoutSaving", trackTransactionDepth, undefined, block);

  expect(maxTransactionDepth - baselineTransactionDepth).toBe(0);
}

class AttachmentTest extends TestCase {
  attachment(): void {}
}

describe("ActiveStorage::AttachmentTest", () => {
  let user: User;
  let t: TestHelper;

  afterEach(async () => {
    travelBack();
    t.afterTeardown();
    for (const blob of await Blob.all().toArray()) await blob.delete();
  });

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new AttachmentTest("attachment") as unknown as TestHelper;
    await t.beforeSetup();
    user = await User.createBang({ name: "Josh" });
  });

  it("analyzing a directly-uploaded blob after attaching it", async () => {
    const blob = await directlyUploadFileBlob({ filename: "racecar.jpg" });
    expect(blob.isAnalyzed()).toBeFalsy();

    await t.performEnqueuedJobs({}, () => user.highlights.attach(blob));

    await blob.reload();
    expect(blob.isAnalyzed()).toBeTruthy();
    expect(blob.metadata.get("width")).toBe(4104);
    expect(blob.metadata.get("height")).toBe(2736);
  });

  it("attaching a un-analyzable blob", async () => {
    const blob = await createBlob({ filename: "blank.txt" });

    expect(blob.isAnalyzed()).toBeFalsy();

    await t.assertNoEnqueuedJobs({}, () => user.highlights.attach(blob));

    await blob.reload();
    expect(blob.isAnalyzed()).toBeTruthy();
  });
  it("attaching a blob doesn't touch the record", async () => {
    const data = "Something else entirely!";
    const io = new StringIO(data);
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });
    await blob.upload(io);

    const user = await User.createBang({
      name: "Roger",
      avatar: blob.signedId(),
      recordCallbacks: true,
    });

    expect(user.callbackCounter).toBe(1);
  });

  it("attaching a record doesn't reset the previously_new_record flag", async () => {
    await user.highlights.attach({ io: new StringIO("dummy"), filename: "dummy.txt" });

    expect(user.notificationSent).toBeTruthy();
  });

  it("mirroring a directly-uploaded blob after attaching it", async () => {
    await withService("mirror", async () => {
      const blob = await directlyUploadFileBlob();
      const service = Blob.service as MirrorService;
      expect(await service.mirrors[1].isExist(blob.key)).toBeFalsy();

      await t.performEnqueuedJobs({}, () => user.highlights.attach(blob));

      expect(await service.mirrors[1].isExist(blob.key)).toBeTruthy();
    });
  });

  it("directly-uploaded blob identification for one attached occurs before validation", async () => {
    const blob = await directlyUploadFileBlob({
      filename: "racecar.jpg",
      contentType: "application/octet-stream",
    });

    await assertBlobIdentifiedBeforeOwnerValidated(user, blob, "image/jpeg", () =>
      user.avatar.attach(blob),
    );
  });

  it("directly-uploaded blob identification for many attached occurs before validation", async () => {
    const blob = await directlyUploadFileBlob({
      filename: "racecar.jpg",
      contentType: "application/octet-stream",
    });

    await assertBlobIdentifiedBeforeOwnerValidated(user, blob, "image/jpeg", () =>
      user.highlights.attach(blob),
    );
  });

  it("directly-uploaded blob identification for one attached occurs outside transaction", async () => {
    const blob = await directlyUploadFileBlob({ filename: "racecar.jpg" });

    await assertBlobIdentifiedOutsideTransaction(blob, async () => {
      await user.avatar.attach(blob);
    });
  });

  it("directly-uploaded blob identification for many attached occurs outside transaction", async () => {
    const blob = await directlyUploadFileBlob({ filename: "racecar.jpg" });

    await assertBlobIdentifiedOutsideTransaction(blob, async () => {
      await user.highlights.attach(blob);
    });
  });

  it("getting a signed blob ID from an attachment", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user);
    expect(await Blob.findSignedBang(signedId)).toEqual(blob);
    expect(await Blob.findSigned(signedId)).toEqual(blob);
  });

  it("getting a signed blob ID from an attachment with a custom purpose", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user, { purpose: "custom_purpose" });
    expect(await Blob.findSignedBang(signedId, { purpose: "custom_purpose" })).toEqual(blob);
  });

  it("getting a signed blob ID from an attachment with a expires_in", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user, { expiresIn: Duration.minutes(1) });
    expect(await Blob.findSignedBang(signedId)).toEqual(blob);
  });

  it("fail to find blob within expiration duration", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user, { expiresIn: Duration.minutes(1) });
    travel(Duration.minutes(2));
    expect(await Blob.findSigned(signedId)).toBeNull();
  });

  it("getting a signed blob ID from an attachment with a expires_at", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user, { expiresAt: currentTimeInstant().add({ minutes: 1 }) });
    expect(await Blob.findSignedBang(signedId)).toEqual(blob);
  });

  it("fail to find blob within expiration time", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user, { expiresAt: currentTimeInstant().add({ minutes: 1 }) });
    travel(Duration.minutes(2));
    expect(await Blob.findSigned(signedId)).toBeNull();
  });

  it("signed blob ID backwards compatibility", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);

    const signedIdGeneratedOldWay = ActiveStorage.verifier.generate(blob.id, {
      purpose: "blob_id",
    });
    expect(await Blob.findSignedBang(signedIdGeneratedOldWay)).toEqual(blob);
  });

  it("attaching with strict_loading and getting a signed blob ID from an attachment", async () => {
    const blob = await createBlob();
    user.strictLoadingBang(true);
    await user.avatar.attach(blob);

    const signedId = signedIdOf(user);
    expect(await Blob.findSigned(signedId)).toEqual(blob);
  });

  it("can destroy attachment without existing relation", async () => {
    const blob = await createBlob();
    await user.highlights.attach(blob);
    const attachment = await (
      user.highlights as unknown as {
        findBy(conditions: object): Promise<Attachment>;
      }
    ).findBy({ blob_id: blob.id });
    await attachment.updateAttribute("name", "old_highlights");
    await attachment.destroy();
  });

  it("can create an attachment with the record having no attachment reflections", async () => {
    const attachment = await Attachment.createBang({
      name: "whatever",
      record: user,
      blob: await createBlob(),
    });
    expect(attachment.isPersisted()).toBe(true);
  });
});
