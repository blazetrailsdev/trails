import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import { createBlob, User } from "./test-helpers/test-helper.js";

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
const unported = {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
};
Object.assign(Blob.prototype, unported);
Object.defineProperty(User.prototype, "attachmentReflections", {
  value: {},
  configurable: true,
});

describe("ActiveStorage::AttachmentTest", () => {
  let user: User;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    user = await User.createBang({ name: "Josh" });
  });

  it("can create an attachment with the record having no attachment reflections", async () => {
    const attachment = await Attachment.createBang({
      name: "whatever",
      record: user,
      blob: await createBlob(),
    });
    expect(attachment.isPersisted()).toBe(true);
  });

  // BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
  it.skip("analyzing a directly-uploaded blob after attaching it", () => {});
  it.skip("attaching a un-analyzable blob", () => {});
  it.skip("attaching a blob doesn't touch the record", () => {});
  it.skip("attaching a record doesn't reset the previously_new_record flag", () => {});
  it.skip("mirroring a directly-uploaded blob after attaching it", () => {});
  it.skip("directly-uploaded blob identification for one attached occurs before validation", () => {});
  it.skip("directly-uploaded blob identification for many attached occurs before validation", () => {});
  it.skip("directly-uploaded blob identification for one attached occurs outside transaction", () => {});
  it.skip("directly-uploaded blob identification for many attached occurs outside transaction", () => {});
  it("getting a signed blob ID from an attachment", async () => {
    const blob = await createBlob();
    const attachment = await Attachment.createBang({ name: "avatar", record: user, blob });

    const signedId = attachment.signedId();
    expect(await Blob.findSignedBang(signedId)).toEqual(blob);
    expect(await Blob.findSigned(signedId)).toEqual(blob);
  });
  it.skip("getting a signed blob ID from an attachment with a custom purpose", () => {});
  it.skip("getting a signed blob ID from an attachment with a expires_in", () => {});
  it.skip("fail to find blob within expiration duration", () => {});
  it.skip("getting a signed blob ID from an attachment with a expires_at", () => {});
  it.skip("fail to find blob within expiration time", () => {});
  it.skip("signed blob ID backwards compatibility", () => {});
  it.skip("attaching with strict_loading and getting a signed blob ID from an attachment", () => {});
  it.skip("can destroy attachment without existing relation", () => {});
});
