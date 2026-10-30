import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import { createBlob, User } from "./test-helpers/test-helper.js";

const unported = {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
};
Object.assign(Blob.prototype, unported);
Object.defineProperty(User.prototype, "attachmentReflections", { value: {} });

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
});
