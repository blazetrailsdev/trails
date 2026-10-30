import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ArgumentError } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import { createBlob, User } from "./test-helpers/test-helper.js";

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
    expect((attachment as unknown as { mumbo?: unknown }).mumbo).toBeUndefined();
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
