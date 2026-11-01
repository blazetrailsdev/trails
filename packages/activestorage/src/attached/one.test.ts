import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertChanges,
  assertNoChanges,
  assertRaises,
  TopLevel,
  type Extended,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { UploadedFile } from "@blazetrails/rack-test";
import { ArgumentError, RuntimeError, StringIO } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { Blob } from "../blob.js";
import { PurgeJob } from "../purge-job.js";
import { DiskService } from "../service/disk-service.js";
import { MirrorService } from "../service/mirror-service.js";
import {
  createBlob,
  directlyUploadFileBlob,
  fileFixture,
  fixtureFileUpload,
  withService,
  Group,
  User,
} from "../test-helpers/test-helper.js";
import type { ClassMethods } from "./model.js";
import type { One } from "./one.js";

Object.assign(Blob.prototype, { isPreviewImageNeededBeforeProcessingVariants: () => false });

type Attachable = Extended<typeof ClassMethods>;
type Job = (block: () => unknown) => Promise<unknown>;

const blobOf = async (one: One): Promise<Blob> => (await (await one.attachment)!.blob)!;
const filename = async (one: One): Promise<string> => (await blobOf(one)).filename.toString();
const expectAnalyzed = async (one: One): Promise<void> => {
  const blob = await (await blobOf(one)).reload();
  expect(blob.isAnalyzed()).toBeTruthy();
  expect(blob.metadata.get("width")).toBe(4104);
  expect(blob.metadata.get("height")).toBe(2736);
};
const exist = (key: string) => Blob.service!.isExist(key);
const townHash = () => ({
  io: new StringIO("STUFF"),
  filename: "town.jpg",
  contentType: "image/jpeg",
});

class OneAttachedTest extends TestCase {
  oneAttached(): void {}
}

describe("ActiveStorage::OneAttachedTest", () => {
  let user: User;
  let t: TestHelper;
  const performEnqueuedJobs: Job = (block) => t.performEnqueuedJobs({}, block);
  const assertNoEnqueuedJobs: Job = (block) => t.assertNoEnqueuedJobs({}, block);
  const assertNoPurgeJobs: Job = (block) => t.assertNoEnqueuedJobs({ only: PurgeJob }, block);
  const assertPurgeEnqueued = (blob: Blob, block: () => unknown) =>
    t.assertEnqueuedWith({ job: PurgeJob, args: [blob] }, block);

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new OneAttachedTest("oneAttached") as unknown as TestHelper;
    await t.beforeSetup();
    user = await User.createBang({ name: "Josh" });
  });

  afterEach(async () => {
    await t.afterTeardown();
    for (const blob of await Blob.all().toArray()) await blob.delete();
  });

  it("creating a record with a File as attachable attribute", async () => {
    user = await User.createBang({ name: "Dorian", avatar: fileFixture("image.gif").open() });

    expect(await filename(user.avatar)).toBe("image.gif");
    expect(await user.avatarAttachment).not.toBeNull();
    expect(await user.avatarBlob).not.toBeNull();
  });

  it("uploads the file when passing a File as attachable attribute", async () => {
    user = await User.createBang({ name: "Dorian", avatar: fileFixture("image.gif").open() });
    await (await blobOf(user.avatar)).download();
  });

  it("creating a record with a Pathname as attachable attribute", async () => {
    user = await User.createBang({
      name: "Dorian",
      avatar: fileFixture("image.gif"),
    });

    expect(await filename(user.avatar)).toBe("image.gif");
    expect(await user.avatarAttachment).not.toBeNull();
    expect(await user.avatarBlob).not.toBeNull();
  });

  it("uploads the file when passing a Pathname as attachable attribute", async () => {
    user = await User.createBang({
      name: "Dorian",
      avatar: fileFixture("image.gif"),
    });
    await (await blobOf(user.avatar)).download();
  });

  it("attaching an existing blob to an existing record", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(await filename(user.avatar)).toBe("funky.jpg");

    expect(await user.avatarAttachment).not.toBeNull();
    expect(await user.avatarBlob).not.toBeNull();
  });

  it("attaching an existing blob from a signed ID to an existing record", async () => {
    await user.avatar.attach((await createBlob({ filename: "funky.jpg" })).signedId());
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("attaching an existing blob from a signed ID passes record", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const spy = vi.spyOn(Blob, "findSignedBang").mockResolvedValue(blob);

    await user.avatar.attach(blob.signedId());
    expect(spy).toHaveBeenCalledWith(blob.signedId(), { record: user });
    spy.mockRestore();
  });

  it("attaching a new blob from a Hash to an existing record", async () => {
    await user.avatar.attach(townHash());
    expect(await filename(user.avatar)).toBe("town.jpg");
  });

  it("attaching a new blob from a Hash to an existing record passes record", async () => {
    const hash = townHash();
    const blob = Blob.buildAfterUnfurling(hash);
    const spy = vi.spyOn(Blob, "buildAfterUnfurling").mockReturnValue(blob);

    await user.avatar.attach(hash);
    expect(spy).toHaveBeenCalledWith({ ...hash, record: user, serviceName: null });
    spy.mockRestore();
  });

  it("attaching a new blob from an uploaded file to an existing record", async () => {
    await user.avatar.attach(fixtureFileUpload("racecar.jpg"));
    expect(await filename(user.avatar)).toBe("racecar.jpg");
  });

  it("attaching StringIO attachable to an existing record", async () => {
    const upload = new UploadedFile(new StringIO(""), undefined, undefined, {
      originalFilename: "test.txt",
    });

    await user.avatar.attach(upload);

    expect(await user.avatarAttachment).not.toBeNull();
    expect(await user.avatarBlob).not.toBeNull();
  });

  it("attaching a new blob from an uploaded file to an existing record passes record", async () => {
    const upload = fixtureFileUpload("racecar.jpg");
    const io = new StringIO("");
    (upload as unknown as { open(): StringIO }).open = () => io;
    const argumentsHash = {
      io: io,
      filename: upload.originalFilename,
      contentType: upload.contentType,
      record: user,
      serviceName: null,
    };
    const blob = Blob.buildAfterUnfurling(argumentsHash as never);
    const spy = vi.spyOn(Blob, "buildAfterUnfurling").mockReturnValue(blob);

    await user.avatar.attach(upload);
    expect(spy).toHaveBeenCalledWith(argumentsHash);
    spy.mockRestore();
  });

  it("attaching a blob to a persisted, unchanged, and valid record, returns the attachment", async () => {
    const returnValue = await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(returnValue).toBe(user.avatar);
  });

  it("attaching a blob to a persisted, unchanged, and invalid record, returns nil", async () => {
    await user.updateAttribute("name", null);
    expect(await user.isValid()).toBe(false);

    const returnValue = await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(returnValue).toBeNull();
  });

  it("attaching a blob to a changed record, returns the attachment", async () => {
    user.name = "Tina";
    const returnValue = await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(returnValue).toBe(user.avatar);
  });

  it("attaching a blob to a non persisted record, returns the attachment", async () => {
    const user = new User({ name: "John" });
    const returnValue = await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(returnValue).toBe(user.avatar);
  });

  const attachToChanged = async (attachable: () => Promise<unknown> | unknown, name: string) => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    await user.avatar.attach(await attachable());
    expect(await filename(user.avatar)).toBe(name);
    expect((await user.avatar.attachment)!.isPersisted()).toBe(false);
    expect(user.isWillSaveChangeToAttribute("name")).toBe(true);

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe(name);
  };

  it("attaching an existing blob to an existing, changed record", async () => {
    await attachToChanged(() => createBlob({ filename: "funky.jpg" }), "funky.jpg");
  });

  it("attaching an existing blob from a signed ID to an existing, changed record", async () => {
    await attachToChanged(
      async () => (await createBlob({ filename: "funky.jpg" })).signedId(),
      "funky.jpg",
    );
  });

  it("attaching a new blob from a Hash to an existing, changed record", async () => {
    await attachToChanged(townHash, "town.jpg");
  });

  it("attaching a new blob from an uploaded file to an existing, changed record", async () => {
    await attachToChanged(() => fixtureFileUpload("racecar.jpg"), "racecar.jpg");
  });

  it("updating an existing record to attach an existing blob", async () => {
    await user.updateBang({ avatar: await createBlob({ filename: "funky.jpg" }) });
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("updating an existing record to attach an existing blob from a signed ID", async () => {
    await user.updateBang({ avatar: (await createBlob({ filename: "funky.jpg" })).signedId() });
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("successfully updating an existing record to attach a new blob from an uploaded file", async () => {
    await user.setAvatar(fixtureFileUpload("racecar.jpg"));
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    const { key } = await blobOf(user.avatar);
    expect(await exist(key)).toBe(false);

    await user.saveBang();
    expect(await exist(key)).toBe(true);
  });

  it("unsuccessfully updating an existing record to attach a new blob from an uploaded file", async () => {
    expect(await user.update({ name: "", avatar: fixtureFileUpload("racecar.jpg") })).toBe(false);
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBe(false);
  });

  it("successfully replacing an existing, dependent attachment on an existing record", async () => {
    const oldBlob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(oldBlob);

    const blob = await createBlob({ filename: "town.jpg" });
    await performEnqueuedJobs(() => user.avatar.attach(blob));

    expect(await filename(user.avatar)).toBe("town.jpg");
    expect(await Blob.isExists(oldBlob.id)).toBe(false);
    expect(await exist(oldBlob.key)).toBe(false);
  });

  it("replacing an existing, independent attachment on an existing record", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    const blob = await createBlob({ filename: "town.jpg" });
    await assertNoPurgeJobs(() => user.coverPhoto.attach(blob));

    expect(await filename(user.coverPhoto)).toBe("town.jpg");
  });

  it("replacing an attached blob on an existing record with itself", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertNoChanges(
      async () => (await (await user.reload()).avatarAttachment)!.id,
      null,
      {},
      () => assertNoEnqueuedJobs(() => user.avatar.attach(blob)),
    );

    expect(await filename(user.avatar)).toBe("funky.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBe(true);
  });

  it("successfully updating an existing record to replace an existing, dependent attachment", async () => {
    const oldBlob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(oldBlob);

    const blob = await createBlob({ filename: "town.jpg" });
    await performEnqueuedJobs(() => user.updateBang({ avatar: blob }));

    expect(await filename(user.avatar)).toBe("town.jpg");
    expect(await Blob.isExists(oldBlob.id)).toBe(false);
    expect(await exist(oldBlob.key)).toBe(false);
  });

  it("successfully updating an existing record to replace an existing, independent attachment", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    const blob = await createBlob({ filename: "town.jpg" });
    await assertNoPurgeJobs(() => user.updateBang({ coverPhoto: blob }));

    expect(await filename(user.coverPhoto)).toBe("town.jpg");
  });

  it("unsuccessfully updating an existing record to replace an existing attachment", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoEnqueuedJobs(async () => {
      expect(await user.update({ name: "", avatar: fixtureFileUpload("racecar.jpg") })).toBe(false);
    });

    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBe(false);
  });

  it("updating an existing record to replace an attached blob with itself", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertNoEnqueuedJobs(() =>
      assertNoChanges(
        async () => (await (await user.reload()).avatarAttachment)!.id,
        null,
        {},
        () => user.updateBang({ avatar: blob }),
      ),
    );
  });

  it("removing a dependent attachment from an existing record", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertPurgeEnqueued(blob, () => user.avatar.attach(null));

    expect(await user.avatar.isAttached()).toBe(false);
  });

  it("removing an independent attachment from an existing record", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.coverPhoto.attach(null));

    expect(await user.coverPhoto.isAttached()).toBe(false);
  });

  it("updating an existing record to nil to remove a dependent attachment", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertPurgeEnqueued(blob, () => user.updateBang({ avatar: null }));

    expect(await user.avatar.isAttached()).toBe(false);
  });

  it("updating an existing record to an empty string to remove a dependent attachment", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertPurgeEnqueued(blob, () => user.updateBang({ avatar: "" }));

    expect(await user.avatar.isAttached()).toBe(false);
  });

  it("updating an existing record to nil to remove an independent attachment", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.updateBang({ coverPhoto: null }));

    expect(await user.coverPhoto.isAttached()).toBe(false);
  });

  it("updating an existing record to an empty string to remove an independent attachment", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.updateBang({ coverPhoto: "" }));

    expect(await user.coverPhoto.isAttached()).toBe(false);
  });

  it("analyzing a new blob from an uploaded file after attaching it to an existing record", async () => {
    await performEnqueuedJobs(() => user.avatar.attach(fixtureFileUpload("racecar.jpg")));

    await expectAnalyzed(user.avatar);
  });

  it("analyzing a new blob from an uploaded file after attaching it to an existing record via update", async () => {
    await performEnqueuedJobs(() => user.updateBang({ avatar: fixtureFileUpload("racecar.jpg") }));

    await expectAnalyzed(user.avatar);
  });

  it("analyzing a directly-uploaded blob after attaching it to an existing record", async () => {
    await performEnqueuedJobs(async () =>
      user.avatar.attach(await directlyUploadFileBlob({ filename: "racecar.jpg" })),
    );

    await expectAnalyzed(user.avatar);
  });

  it("analyzing a directly-uploaded blob after attaching it to an existing record via updates", async () => {
    await performEnqueuedJobs(async () =>
      user.updateBang({ avatar: await directlyUploadFileBlob({ filename: "racecar.jpg" }) }),
    );

    await expectAnalyzed(user.avatar);
  });
  it("creating an attachment as part of an autosave association through nested attributes", async () => {
    const group = await Group.createBang({
      usersAttributes: [
        {
          name: "John",
          avatar: {
            io: new StringIO("STUFF"),
            filename: "town.jpg",
            contentType: "image/jpeg",
          },
        },
      ],
    });
    await group.saveBang();
    const newUser = (await User.findBy({ name: "John" })) as User;
    await newUser.avatar.load();
    expect(newUser.avatar.isAttached()).toBe(true);
  });

  it("updating an attachment as part of an autosave association", async () => {
    const group = await Group.createBang({ users: [user] });
    await user.setAvatar(fixtureFileUpload("racecar.jpg"));
    await group.saveBang();
    await user.reload();
    await user.avatar.load();
    expect(user.avatar.isAttached()).toBe(true);
  });

  const attachToNew = async (attachable: unknown, name: string) => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach(attachable);
    expect(user.isNewRecord()).toBe(true);
    expect(await filename(user.avatar)).toBe(name);

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe(name);
  };

  it("attaching an existing blob to a new record", async () => {
    await attachToNew(await createBlob({ filename: "funky.jpg" }), "funky.jpg");
  });

  it("attaching an existing blob from a signed ID to a new record", async () => {
    await attachToNew((await createBlob({ filename: "funky.jpg" })).signedId(), "funky.jpg");
  });

  const attachNewBlobToNew = async (attachable: unknown, name: string) => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach(attachable);
    expect(user.isNewRecord()).toBe(true);
    expect((await user.avatar.attachment)!.isNewRecord()).toBe(true);
    expect((await blobOf(user.avatar)).isNewRecord()).toBe(true);
    expect(await filename(user.avatar)).toBe(name);
    const { key } = await blobOf(user.avatar);
    expect(await exist(key)).toBe(false);

    await user.saveBang();
    expect((await user.avatar.attachment)!.isPersisted()).toBe(true);
    expect((await blobOf(user.avatar)).isPersisted()).toBe(true);
    await user.reload();
    expect(await filename(user.avatar)).toBe(name);
    expect(await exist(key)).toBe(true);
  };

  it("attaching a new blob from a Hash to a new record", async () => {
    await attachNewBlobToNew(townHash(), "town.jpg");
  });

  it("attaching a new blob from an uploaded file to a new record", async () => {
    await attachNewBlobToNew(fixtureFileUpload("racecar.jpg"), "racecar.jpg");
  });

  it("creating a record with an existing blob attached", async () => {
    const user = await User.createBang({
      name: "Jason",
      avatar: await createBlob({ filename: "funky.jpg" }),
    });
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("creating a record with an existing blob from a signed ID attached", async () => {
    const user = await User.createBang({
      name: "Jason",
      avatar: (await createBlob({ filename: "funky.jpg" })).signedId(),
    });
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("creating a record with a new blob from an uploaded file attached", async () => {
    const user = new User({ name: "Jason" });
    await user.setAvatar(fixtureFileUpload("racecar.jpg"));
    expect(user.isNewRecord()).toBe(true);
    expect((await user.avatar.attachment)!.isNewRecord()).toBe(true);
    expect((await blobOf(user.avatar)).isNewRecord()).toBe(true);
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBe(false);

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
  });

  it("creating a record with an unexpected object attached", async () => {
    const error = await User.createBang({ name: "Jason", avatar: Symbol.for("foo") }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ArgumentError);
    expect((error as Error).message).toMatch(
      /^Could not find or build blob: expected attachable, got .*foo/,
    );
  });

  it("analyzing a new blob from an uploaded file after attaching it to a new record", async () => {
    await performEnqueuedJobs(async () => {
      const user = await User.createBang({
        name: "Jason",
        avatar: fixtureFileUpload("racecar.jpg"),
      });
      await expectAnalyzed(user.avatar);
    });
  });

  it("analyzing a directly-uploaded blob after attaching it to a new record", async () => {
    await performEnqueuedJobs(async () => {
      const user = await User.createBang({
        name: "Jason",
        avatar: await directlyUploadFileBlob({ filename: "racecar.jpg" }),
      });
      await expectAnalyzed(user.avatar);
    });
  });

  it("detaching", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);

    await performEnqueuedJobs(() => user.avatar.detach());

    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);
    expect(await exist(blob.key)).toBe(true);
  });

  it("detaching when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);

    await performEnqueuedJobs(() => user.avatar.detach());

    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);
    expect(await exist(blob.key)).toBe(true);
  });

  it("purging", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);
    await user.updateColumn("updated_at", "2000-01-01 00:00:00");

    await assertChanges(
      () => user.readAttribute("updated_at"),
      null,
      {},
      () => user.avatar.purge(),
    );
    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(false);
    expect(await exist(blob.key)).toBe(false);
  });

  const attachShared = async (blob: Blob) => {
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.avatar.attach(blob);
    expect(await anotherUser.avatar.isAttached()).toBe(true);
  };

  it("purging an attachment with a shared blob", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await attachShared(blob);

    await user.avatar.purge();
    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);
    expect(await exist(blob.key)).toBe(true);
  });

  it("purging when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);

    const attachment = (await user.avatar.attachment)!;
    await user.avatar.purge();

    expect(await user.avatar.isAttached()).toBe(false);
    expect(attachment.isDestroyed()).toBe(true);
    expect(await Blob.isExists(blob.id)).toBe(false);
    expect(await exist(blob.key)).toBe(false);
  });

  it("purging delete changes when record is not persisted", async () => {
    const user = new User();
    await user.setAvatar(null);

    await user.avatar.purge();

    expect(user.attachmentChanges["avatar"]).toBeUndefined();
  });

  it("purging later", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);
    await user.updateColumn("updated_at", "2000-01-01 00:00:00");

    await performEnqueuedJobs(() =>
      assertChanges(
        () => user.readAttribute("updated_at"),
        null,
        {},
        () => user.avatar.purgeLater(),
      ),
    );

    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(false);
    expect(await exist(blob.key)).toBe(false);
  });

  it("purging an attachment later with shared blob", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await attachShared(blob);

    await performEnqueuedJobs(() => user.avatar.purgeLater());

    expect(await user.avatar.isAttached()).toBe(false);
    expect(await Blob.isExists(blob.id)).toBe(true);
    expect(await exist(blob.key)).toBe(true);
  });

  it("purging an attachment later when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBe(true);

    const attachment = (await user.avatar.attachment)!;
    await performEnqueuedJobs(() => user.avatar.purgeLater());

    expect(await user.avatar.isAttached()).toBe(false);
    expect(attachment.isDestroyed()).toBe(true);
    expect(await Blob.isExists(blob.id)).toBe(false);
    expect(await exist(blob.key)).toBe(false);
  });

  it("purging dependent attachment later on destroy", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await performEnqueuedJobs(() => user.destroyBang());

    expect(await Blob.isExists(blob.id)).toBe(false);
    expect(await exist(blob.key)).toBe(false);
  });

  it("not purging independent attachment on destroy", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoEnqueuedJobs(() => user.destroyBang());
  });

  it("duped record does not share attachments", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));

    const duped = await user.dup().avatar.attachment;
    expect(duped === (await user.avatar.attachment)).toBe(false);
  });

  it("duped record does not share attachment changes", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(user.changedForAutosave()).toBe(false);

    await user.dup().avatar.attach(await createBlob({ filename: "town.jpg" }));
    expect(user.changedForAutosave()).toBe(false);
  });

  it("clearing change on reload", async () => {
    await user.setAvatar(await createBlob({ filename: "funky.jpg" }));
    expect(await user.avatar.isAttached()).toBe(true);

    await user.reload();
    await user.avatar.load();
    expect(user.avatar.isAttached()).toBe(false);
  });

  it("overriding attached reader", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));

    expect(await filename(user.avatar)).toBe("funky.jpg");

    await (await user.avatar.attachment)!.blob;
    const reader = () => {
      let proto: object | null = User.prototype;
      while (proto != null) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, "avatar");
        if (descriptor != null) return descriptor;
        proto = Object.getPrototypeOf(proto) as object | null;
      }
      throw new TypeError("no avatar reader");
    };
    const descriptor = reader();
    try {
      Object.defineProperty(User.prototype, "avatar", {
        configurable: true,
        get(this: User) {
          const one = descriptor.get!.call(this) as unknown as { filename: object };
          return [...one.filename.toString()].reverse().join("");
        },
      });

      expect(user.avatar).toBe("gpj.yknuf");
    } finally {
      delete (User.prototype as unknown as { avatar?: unknown }).avatar;
    }
  });

  it("attaching a new blob from a Hash with a custom service", async () => {
    await withService("mirror", async () => {
      const attachable = () => ({
        io: new StringIO("STUFF"),
        filename: "town.jpg",
        contentType: "image/jpeg",
      });
      await user.avatar.attach(attachable());
      await user.coverPhoto.attach(attachable());

      expect((user.avatar as unknown as Blob).service).toBeInstanceOf(MirrorService);
      expect((user.coverPhoto as unknown as Blob).service).toBeInstanceOf(DiskService);
    });
  });

  it("attaching a new blob from an uploaded file with a custom_service", async () => {
    await withService("mirror", async () => {
      await user.avatar.attach(fixtureFileUpload("racecar.jpg"));
      await user.coverPhoto.attach(fixtureFileUpload("racecar.jpg"));

      expect((user.avatar as unknown as Blob).service).toBeInstanceOf(MirrorService);
      expect((user.coverPhoto as unknown as Blob).service).toBeInstanceOf(DiskService);
    });
  });

  it("attaching a new blob from an uploaded file with a service defined at runtime", async () => {
    class ExtraAttached extends User {
      static override get tableName() {
        return "users";
      }
      static {
        (this as unknown as Attachable).hasOneAttached("signature", {
          service: (user) => `disk_${(user as unknown as ExtraAttached).mirrorRegion()}`,
        });
      }
      mirrorRegion() {
        return "mirror_2";
      }
    }
    const extra = user.becomes(ExtraAttached) as unknown as { signature: One };

    await extra.signature.attach(fixtureFileUpload("cropped.pdf"));
    expect((extra.signature as unknown as Blob).service.name).toBe("disk_mirror_2");
  });

  it("raises error when global service configuration is missing", async () => {
    const activeStorage = (
      TopLevel.Trails as unknown as { configuration: { activeStorage: { service: unknown } } }
    ).configuration.activeStorage;
    const service = activeStorage.service;
    activeStorage.service = null;
    try {
      await assertRaises(
        [RuntimeError],
        {
          match:
            /Missing Active Storage service name. Specify Active Storage service name for config.active_storage.service in config\/environments\/test.rb/,
        },
        () => {
          (User as unknown as Attachable).hasOneAttached("featuredPhoto");
        },
      );
    } finally {
      activeStorage.service = service;
    }
  });

  it("raises error when misconfigured service is passed", () => {
    expect(() =>
      (User as unknown as Attachable).hasOneAttached("featuredPhoto", { service: "unknown" }),
    ).toThrow(/Cannot configure service "unknown" for .*User#featuredPhoto/);
  });

  it("raises error when misconfigured service is defined at runtime", async () => {
    class ExtraAttached extends User {
      static override get tableName() {
        return "users";
      }
      static {
        (this as unknown as Attachable).hasOneAttached("featuredVlog", {
          service: () => "unknown",
        });
      }
    }
    const extra = user.becomes(ExtraAttached) as unknown as { featuredVlog: One };

    await expect(extra.featuredVlog.attach(fixtureFileUpload("video.mp4"))).rejects.toThrow(
      /Cannot configure service "unknown" for .+#featuredVlog/,
    );
  });

  // BLOCKED: activestorage-variation-and-variants
  it.skip("creating variation by variation name", () => {});
  it.skip("raises error when unknown variant name is used to generate variant", () => {});
  // BLOCKED: activestorage-previewers-and-preview
  it.skip("creating preview by variation name", () => {});
  it.skip("raises error when unknown variant name is used to generate preview", () => {});
  // BLOCKED: activestorage-variation-and-variants
  it.skip("creating representation by variation name", () => {});
  it.skip("raises error when unknown variant name is used to generate representation", () => {});
  it.skip("transforms variants later", () => {});
  it.skip("transforms variants later conditionally via proc", () => {});
  it.skip("transforms variants later conditionally via method", () => {});
  it.skip("avoids enqueuing transform later job or preview image job when blob is not representable", () => {});
  it.skip("avoids enqueuing transform later job or preview later job if there aren't any variants to preprocess", () => {});
  it.skip("creates preview later without transforming variants if required and there are variants to preprocess", () => {});
});
