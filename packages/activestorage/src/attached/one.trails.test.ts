import { isBlank } from "@blazetrails/activesupport";
import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { StringIO } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { Blob } from "../blob.js";
import { createBlob, Group, User } from "../test-helpers/test-helper.js";
import { One } from "./one.js";

type AvatarUser = User & {
  avatar: One;
  setAvatar(attachable: unknown): Promise<void>;
  attachmentChanges: { [k: string]: unknown };
};

const Member = User;

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

  it("create awaits the attachment writer before saving", async () => {
    const created = (await Member.create({ name: "Jason", avatar: hash() })) as AvatarUser;
    expect(await created.avatar.isAttached()).toBe(true);
    expect(created.isPersisted()).toBe(true);
  });

  it("create runs its block after the attachment writer resolves", async () => {
    let attached: unknown;
    await Member.createBang({ name: "Jason", avatar: hash() }, (record: AvatarUser) => {
      attached = record.attachmentChanges.avatar;
    });
    expect(attached).toBeDefined();
  });

  it("create with a block rejects with the attachment writer's error", async () => {
    let yielded = false;
    const created = Member.createBang({ name: "Jason", avatar: Symbol.for("foo") }, () => {
      yielded = true;
    });
    await expect(created).rejects.toThrow(/Could not find or build blob/);
    expect(yielded).toBe(false);
  });

  it("create assigns a key after the attachment key", async () => {
    const created = (await Member.createBang({ avatar: hash(), name: "Jason" })) as AvatarUser;
    expect(created.name).toBe("Jason");
    expect(await created.avatar.isAttached()).toBe(true);
  });

  it("create with an array of hashes awaits each attachment writer", async () => {
    const created = (await Member.createBang([
      { name: "Jason", avatar: hash() },
      { name: "Dorian", avatar: hash() },
    ])) as unknown as AvatarUser[];
    for (const record of created) expect(await record.avatar.isAttached()).toBe(true);
  });

  it("a relation create awaits the attachment writer", async () => {
    const created = (await Member.where({ name: "Jason" }).createBang({
      avatar: hash(),
    })) as unknown as AvatarUser;
    expect(created.name).toBe("Jason");
    expect(await created.avatar.isAttached()).toBe(true);
  });

  it("an association create awaits the attachment writer", async () => {
    const group = await Group.createBang({});
    const created = (await group.association("users").createBang({
      name: "Jason",
      avatar: hash(),
    })) as AvatarUser;
    expect(await created.avatar.isAttached()).toBe(true);
  });

  it("new raises for an attachment key", () => {
    expect(() => new Member({ name: "Jason", avatar: hash() })).toThrow(/setAttributes/);
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
    expect((await reloaded.avatar.attachment)?.readAttribute("blob_id")).toBe(blob.id);
    expect(await user.avatar.isBlank()).toBe(false);
    expect(((await Member.find(user.id)) as AvatarUser).avatar).toBeInstanceOf(One);
    await user.avatar.attachment;
    expect((user.avatar as unknown as { signedId(): string }).signedId()).toBe(blob.signedId());
  });

  it("signedId on an attachment read through the reader queries no blob", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    const attachment = await ((await Member.find(user.id)) as AvatarUser).avatar.attachment;
    expect(attachment!.signedId()).toBe(blob.signedId());
  });

  it("isAttached does not load the blob", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    const reloaded = (await Member.find(user.id)) as AvatarUser;
    await reloaded.avatar.load();
    expect(reloaded.avatar.isAttached()).toBe(true);
    const attachment = (await (reloaded as unknown as { avatarAttachment: unknown })
      .avatarAttachment) as { association(name: string): { isLoaded(): boolean } };
    expect(attachment.association("blob").isLoaded()).toBe(false);
  });

  it("raises from a sync read of an unloaded attachment", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    const reloaded = (await Member.find(user.id)) as AvatarUser;
    expect(() => isBlank(reloaded.avatar)).toThrow("await avatar.load()");
    expect(() => (reloaded.avatar as unknown as { blobId: unknown }).blobId).toThrow(
      "await avatar.load()",
    );
    await reloaded.avatar.load();
    expect(isBlank(reloaded.avatar)).toBe(false);
  });

  it("delegates a blob read once the attachment and blob are awaited", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    const reloaded = (await Member.find(user.id)) as AvatarUser;
    await (
      await reloaded.avatar.attachment
    )?.blob;
    expect(String((reloaded.avatar as unknown as { filename: unknown }).filename)).toBe(
      "funky.jpg",
    );
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
