import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Extended } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { Blob } from "../blob.js";
import { Attachment } from "../attachment.js";
import { createBlob, User } from "../test-helpers/test-helper.js";
import type { ClassMethods } from "./model.js";
import { Many } from "./many.js";

type PhotosUser = User & {
  photos: Many;
  setPhotos(attachables: unknown): Promise<void>;
  attachmentChanges: { [k: string]: unknown };
};

class Gallery extends User {
  static override get tableName() {
    return "users";
  }
  static {
    (this as unknown as Extended<typeof ClassMethods>).hasManyAttached("photos");
  }
}

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
});

const hash = (filename = "town.txt") => ({
  io: new StringIO("STUFF"),
  filename,
  contentType: "text/plain",
});

describe("ActiveStorage::Attached::Many", () => {
  let user: PhotosUser;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    user = (await Gallery.createBang({ name: "Josh" })) as PhotosUser;
  });

  it("the writer builds the blobs before it resolves and uploads after commit", async () => {
    await user.setPhotos([hash("a.txt"), hash("b.txt")]);
    const [first] = await user.photos.blobs;
    expect(first.checksum).not.toBeNull();
    expect(await Blob.service!.isExist(first.key)).toBe(false);
    await user.save();
    expect(await Blob.service!.isExist(first.key)).toBe(true);
    expect(await user.photos.isAttached()).toBe(true);
    expect(user.attachmentChanges).toEqual({});
    expect((await user.photos.attachments).length).toBe(2);
  });

  it("attach takes a splat and an array, keeps earlier attachments and answers the proxy", async () => {
    const result = await user.photos.attach(hash("a.txt"), hash("b.txt"));
    expect(result).toBe(user.photos);
    await user.photos.attach([hash("c.txt")]);
    const blobs = await Gallery.find(user.id).then((u) => (u as PhotosUser).photos.blobs);
    expect(blobs.map((b) => b.filename.toString()).sort()).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("attaches a persisted blob without uploading it again", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.photos.attach(blob);
    expect((await user.photos.blobs)[0].id).toBe(blob.id);
  });

  it("a nil or blank writer deletes the attachments", async () => {
    await user.photos.attach(hash());
    await user.setPhotos([null, ""]);
    await user.save();
    expect(await user.photos.isAttached()).toBe(false);
  });

  it("detach keeps the blobs and purge deletes them", async () => {
    await user.photos.attach(hash());
    const [blob] = await user.photos.blobs;
    await user.photos.detach();
    expect(await user.photos.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);

    const fresh = (await Gallery.find(user.id)) as PhotosUser;
    await fresh.photos.attach(blob);
    await fresh.photos.purge();
    expect(await Attachment.isExists({ blob_id: blob.id })).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(false);
  });

  it("delegates a missing name to the attachments and is not a thenable", async () => {
    await user.photos.attach(hash());
    expect(await (await user.photos).isAttached()).toBe(true);
    expect(await (user.photos as unknown as { count(): Promise<number> }).count()).toBe(1);
  });
});
