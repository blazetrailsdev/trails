import { beforeEach, describe, expect, it } from "vitest";
import { DelegationError } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ArgumentError, NoMethodError } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import { createBlob, User } from "./test-helpers/test-helper.js";

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
});
Object.defineProperty(User.prototype, "attachmentReflections", {
  value: {},
  configurable: true,
});

describe("Attachment", () => {
  let attachment: Attachment;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    attachment = await Attachment.createBang({
      name: "avatar",
      record: await User.createBang({ name: "Josh" }),
      blob: await createBlob({ filename: "hello.txt" }),
    });
  });

  it("delegates missing names to a loaded blob", async () => {
    const blob = (await attachment.blob)!;
    const delegated = attachment as unknown as Blob;

    expect(delegated.key).toBe(blob.key);
    expect(delegated.isText()).toBe(true);
    expect(() => (attachment as unknown as { mumbo(): void }).mumbo()).toThrow(NoMethodError);
  });

  it("delegates missing names to a blob preloaded with the attachment", async () => {
    const found = await Attachment.find(attachment.id);

    expect((found as unknown as Blob).key).toBe((await attachment.blob)!.key);
  });

  it("does not forward to an unloaded blob, and the blob still awaits", async () => {
    const found = await Attachment.unscoped().find(attachment.id);

    expect(() => (found as unknown as { isText(): boolean }).isText()).toThrow(NoMethodError);
    expect(() => found.signedId()).toThrow(NoMethodError);
    expect((await found.blob)!.key).toBe((await attachment.blob)!.key);
    expect((found as unknown as Blob).isText()).toBe(true);
  });

  it("raises DelegationError for a nil blob", () => {
    const blank = new Attachment();

    expect(() => (blank as unknown as { key: unknown }).key).toThrow(DelegationError);
    expect(() => blank.signedId()).toThrow(DelegationError);
  });

  it("reads its own column rather than the blob's", async () => {
    await attachment.blob;
    const blobId = attachment.readAttribute("blob_id");
    const found = (await Attachment.find(attachment.id)) as unknown as { id: unknown };

    expect(found.id).toBe(attachment.id);
    expect((attachment as unknown as { blob_id: unknown }).blob_id).toBe(blobId);
    expect((attachment as unknown as { created_at: unknown }).created_at).toEqual(
      attachment.readAttribute("created_at"),
    );
  });

  it("delegates signedId to the blob", async () => {
    const blob = (await attachment.blob)!;

    expect(await Blob.findSigned(attachment.signedId())).toEqual(blob);
  });

  it("purge deletes the attachment and the blob", async () => {
    const blob = (await attachment.blob)!;

    await attachment.purge();

    expect(await Attachment.isExists({ id: attachment.id })).toBe(false);
    expect(await Blob.isExists({ id: blob.id })).toBe(false);
  });

  it("raises for an unknown named variant", async () => {
    await expect(attachment.variant("thumb")).rejects.toThrow(
      new ArgumentError("Cannot find variant :thumb for User#avatar"),
    );
  });
});
