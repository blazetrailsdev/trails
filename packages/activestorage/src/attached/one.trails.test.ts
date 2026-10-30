import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Extended } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { Blob } from "../blob.js";
import { createBlob, User } from "../test-helpers/test-helper.js";
import type { ClassMethods } from "./model.js";
import { One } from "./one.js";

type AvatarUser = User & {
  avatar: One;
  setAvatar(attachable: unknown): Promise<void>;
  attachmentChanges: { [k: string]: unknown };
};

class Member extends User {
  static override get tableName() {
    return "users";
  }
  static {
    (this as unknown as Extended<typeof ClassMethods>).hasOneAttached("avatar");
  }
}

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
});

const hash = () => ({ io: new StringIO("STUFF"), filename: "town.txt", contentType: "text/plain" });

describe("ActiveStorage::Attached::One", () => {
  let user: AvatarUser;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    user = (await Member.createBang({ name: "Josh" })) as AvatarUser;
  });

  it("the writer builds the blob before it resolves and uploads after commit", async () => {
    await user.setAvatar(hash());
    const blob = (user.attachmentChanges.avatar as { blob: Blob }).blob;
    expect(blob.checksum).not.toBeNull();
    expect(await Blob.service!.isExist(blob.key)).toBe(false);
    await user.save();
    expect(await Blob.service!.isExist(blob.key)).toBe(true);
    expect(await user.avatar.isAttached()).toBe(true);
    expect(user.attachmentChanges).toEqual({});
  });

  it("the reader is memoized and is not assignable", () => {
    expect(user.avatar).toBe(user.avatar);
    expect(user.avatar).toBeInstanceOf(One);
    expect(() => ((user as { avatar: unknown }).avatar = "x")).toThrow(TypeError);
  });

  it("setAttributes awaits the writer and assignAttributes raises", async () => {
    await user.setAttributes({ avatar: hash() });
    expect(user.attachmentChanges.avatar).toBeDefined();
    expect(() => user.assignAttributes({ avatar: hash() })).toThrow(/setAttributes/);
    expect(() => new Member({ avatar: hash() })).toThrow(/setAttributes/);
  });

  it("attach saves a persisted record and delegates to the attachment", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    expect(await user.avatar.attach(blob)).toBe(user.avatar);
    const reloaded = (await Member.find(user.id)) as AvatarUser;
    expect((await reloaded.avatar.attachment)?.blob_id).toBe(blob.id);
    expect(await user.avatar.isBlank()).toBe(false);
    expect(((await Member.find(user.id)) as AvatarUser).avatar).toBeInstanceOf(One);
    await user.avatar.attachment;
    expect((user.avatar as unknown as { signedId(): string }).signedId()).toBe(blob.signedId());
  });

  it("detach keeps the blob and purge removes it", async () => {
    const blob = await createBlob();
    await user.avatar.attach(blob);
    await user.avatar.detach();
    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);

    await user.avatar.attach(blob);
    await user.avatar.purge();
    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(false);
  });

  it("assigning nil records a delete and an unknown attachable raises", async () => {
    await user.avatar.attach(await createBlob());
    await user.avatar.attach(hash());
    expect(user.attachmentChanges).toEqual({});
    await user.setAvatar(null);
    await user.save();
    expect(await user.avatar.isAttached()).toBe(false);
    await expect(user.setAvatar(1)).rejects.toThrow(
      "Could not find or build blob: expected attachable, got 1",
    );
  });
});
