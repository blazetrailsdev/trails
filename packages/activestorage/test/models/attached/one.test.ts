import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertChanges,
  assertNoChanges,
  assertNothingRaised,
  assertRaises,
  TopLevel,
  type Extended,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { UploadedFile } from "@blazetrails/rack-test";
import { ArgumentError, RuntimeError, StringIO } from "@blazetrails/ruby-compat";
import "../../support/database/setup.js";
import { ActiveStorage } from "../../../lib/active-storage.js";
import { Blob } from "../../../lib/blob.js";
import type { Preview } from "../../../lib/preview.js";
import { PreviewImageJob } from "../../../lib/preview-image-job.js";
import { PurgeJob } from "../../../lib/purge-job.js";
import { TransformJob } from "../../../lib/transform-job.js";
import { DiskService } from "../../../lib/service/disk-service.js";
import { MirrorService } from "../../../lib/service/mirror-service.js";
import {
  createBlob,
  createFileBlob,
  directlyUploadFileBlob,
  fileFixture,
  fixtureFileUpload,
  readImage,
  withService,
  Group,
  User,
} from "../../support/test-helper.js";
import type { ClassMethods } from "../../../lib/attached/model.js";
import type { Attachment } from "../../../lib/attachment.js";
import type { One } from "../../../lib/attached/one.js";

type Attachable = Extended<typeof ClassMethods>;
type Job = (block: () => unknown) => Promise<unknown>;

const blobOf = async (one: One): Promise<Blob> => (await (await one.attachment)!.blob)!;
const filename = async (one: One): Promise<string> => (await blobOf(one)).filename.toString();
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

  const variableContentTypesWas = ActiveStorage.variableContentTypes;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    ActiveStorage.variableContentTypes = ["image/png", "image/jpeg"];
    t = new OneAttachedTest("oneAttached") as unknown as TestHelper;
    await t.beforeSetup();
    user = await User.createBang({ name: "Josh" });
  });

  afterEach(async () => {
    await t.afterTeardown();
    ActiveStorage.variableContentTypes = variableContentTypesWas;
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
    await assertNothingRaised(async () => (await blobOf(user.avatar)).download());
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
    await assertNothingRaised(async () => (await blobOf(user.avatar)).download());
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
    expect(await user.isValid()).toBeFalsy();

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

  it("attaching an existing blob to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(await filename(user.avatar)).toBe("funky.jpg");
    expect((await user.avatar.attachment)!.isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("attaching an existing blob from a signed ID to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.avatar.attach((await createBlob({ filename: "funky.jpg" })).signedId());
    expect(await filename(user.avatar)).toBe("funky.jpg");
    expect((await user.avatar.attachment)!.isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("attaching a new blob from a Hash to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.avatar.attach(townHash());
    expect(await filename(user.avatar)).toBe("town.jpg");
    expect((await user.avatar.attachment)!.isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("town.jpg");
  });

  it("attaching a new blob from an uploaded file to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.avatar.attach(fixtureFileUpload("racecar.jpg"));
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect((await user.avatar.attachment)!.isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
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
    expect(await exist(key)).toBeFalsy();

    await user.saveBang();
    expect(await exist(key)).toBeTruthy();
  });

  it("unsuccessfully updating an existing record to attach a new blob from an uploaded file", async () => {
    expect(await user.update({ name: "", avatar: fixtureFileUpload("racecar.jpg") })).toBeFalsy();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBeFalsy();
  });

  it("successfully replacing an existing, dependent attachment on an existing record", async () => {
    const oldBlob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(oldBlob);

    const blob = await createBlob({ filename: "town.jpg" });
    await performEnqueuedJobs(() => user.avatar.attach(blob));

    expect(await filename(user.avatar)).toBe("town.jpg");
    expect(await Blob.isExists(oldBlob.id)).toBeFalsy();
    expect(await exist(oldBlob.key)).toBeFalsy();
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
    expect(await exist((await blobOf(user.avatar)).key)).toBeTruthy();
  });

  it("successfully updating an existing record to replace an existing, dependent attachment", async () => {
    const oldBlob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(oldBlob);

    const blob = await createBlob({ filename: "town.jpg" });
    await performEnqueuedJobs(() => user.updateBang({ avatar: blob }));

    expect(await filename(user.avatar)).toBe("town.jpg");
    expect(await Blob.isExists(oldBlob.id)).toBeFalsy();
    expect(await exist(oldBlob.key)).toBeFalsy();
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
      expect(await user.update({ name: "", avatar: fixtureFileUpload("racecar.jpg") })).toBeFalsy();
    });

    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBeFalsy();
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

    expect(await user.avatar.isAttached()).toBeFalsy();
  });

  it("removing an independent attachment from an existing record", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.coverPhoto.attach(null));

    expect(await user.coverPhoto.isAttached()).toBeFalsy();
  });

  it("updating an existing record to nil to remove a dependent attachment", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertPurgeEnqueued(blob, () => user.updateBang({ avatar: null }));

    expect(await user.avatar.isAttached()).toBeFalsy();
  });

  it("updating an existing record to an empty string to remove a dependent attachment", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await assertPurgeEnqueued(blob, () => user.updateBang({ avatar: "" }));

    expect(await user.avatar.isAttached()).toBeFalsy();
  });

  it("updating an existing record to nil to remove an independent attachment", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.updateBang({ coverPhoto: null }));

    expect(await user.coverPhoto.isAttached()).toBeFalsy();
  });

  it("updating an existing record to an empty string to remove an independent attachment", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoPurgeJobs(() => user.updateBang({ coverPhoto: "" }));

    expect(await user.coverPhoto.isAttached()).toBeFalsy();
  });

  it("analyzing a new blob from an uploaded file after attaching it to an existing record", async () => {
    await performEnqueuedJobs(() => user.avatar.attach(fixtureFileUpload("racecar.jpg")));

    const blob = await (await blobOf(user.avatar)).reload();
    expect(blob.isAnalyzed()).toBeTruthy();
    expect(blob.metadata.get("width")).toBe(4104);
    expect(blob.metadata.get("height")).toBe(2736);
  });

  it("analyzing a new blob from an uploaded file after attaching it to an existing record via update", async () => {
    await performEnqueuedJobs(() => user.updateBang({ avatar: fixtureFileUpload("racecar.jpg") }));

    const blob = await (await blobOf(user.avatar)).reload();
    expect(blob.isAnalyzed()).toBeTruthy();
    expect(blob.metadata.get("width")).toBe(4104);
    expect(blob.metadata.get("height")).toBe(2736);
  });

  it("analyzing a directly-uploaded blob after attaching it to an existing record", async () => {
    await performEnqueuedJobs(async () =>
      user.avatar.attach(await directlyUploadFileBlob({ filename: "racecar.jpg" })),
    );

    const blob = await (await blobOf(user.avatar)).reload();
    expect(blob.isAnalyzed()).toBeTruthy();
    expect(blob.metadata.get("width")).toBe(4104);
    expect(blob.metadata.get("height")).toBe(2736);
  });

  it("analyzing a directly-uploaded blob after attaching it to an existing record via updates", async () => {
    await performEnqueuedJobs(async () =>
      user.updateBang({ avatar: await directlyUploadFileBlob({ filename: "racecar.jpg" }) }),
    );

    const blob = await (await blobOf(user.avatar)).reload();
    expect(blob.isAnalyzed()).toBeTruthy();
    expect(blob.metadata.get("width")).toBe(4104);
    expect(blob.metadata.get("height")).toBe(2736);
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
    expect(newUser.avatar.isAttached()).toBeTruthy();
  });

  it("updating an attachment as part of an autosave association", async () => {
    const group = await Group.createBang({ users: [user] });
    await user.setAvatar(fixtureFileUpload("racecar.jpg"));
    await group.saveBang();
    await user.reload();
    await user.avatar.load();
    expect(user.avatar.isAttached()).toBeTruthy();
  });

  it("attaching an existing blob to a new record", async () => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(user.isNewRecord()).toBeTruthy();
    expect(await filename(user.avatar)).toBe("funky.jpg");

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("attaching an existing blob from a signed ID to a new record", async () => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach((await createBlob({ filename: "funky.jpg" })).signedId());
    expect(user.isNewRecord()).toBeTruthy();
    expect(await filename(user.avatar)).toBe("funky.jpg");

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("funky.jpg");
  });

  it("attaching a new blob from a Hash to a new record", async () => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach(townHash());
    expect(user.isNewRecord()).toBeTruthy();
    expect((await user.avatar.attachment)!.isNewRecord()).toBeTruthy();
    expect((await blobOf(user.avatar)).isNewRecord()).toBeTruthy();
    expect(await filename(user.avatar)).toBe("town.jpg");
    const { key } = await blobOf(user.avatar);
    expect(await exist(key)).toBeFalsy();

    await user.saveBang();
    expect((await user.avatar.attachment)!.isPersisted()).toBeTruthy();
    expect((await blobOf(user.avatar)).isPersisted()).toBeTruthy();
    await user.reload();
    expect(await filename(user.avatar)).toBe("town.jpg");
    expect(await exist(key)).toBeTruthy();
  });

  it("attaching a new blob from an uploaded file to a new record", async () => {
    const user = new User({ name: "Jason" });
    await user.avatar.attach(fixtureFileUpload("racecar.jpg"));
    expect(user.isNewRecord()).toBeTruthy();
    expect((await user.avatar.attachment)!.isNewRecord()).toBeTruthy();
    expect((await blobOf(user.avatar)).isNewRecord()).toBeTruthy();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    const { key } = await blobOf(user.avatar);
    expect(await exist(key)).toBeFalsy();

    await user.saveBang();
    expect((await user.avatar.attachment)!.isPersisted()).toBeTruthy();
    expect((await blobOf(user.avatar)).isPersisted()).toBeTruthy();
    await user.reload();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist(key)).toBeTruthy();
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
    expect(user.isNewRecord()).toBeTruthy();
    expect((await user.avatar.attachment)!.isNewRecord()).toBeTruthy();
    expect((await blobOf(user.avatar)).isNewRecord()).toBeTruthy();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
    expect(await exist((await blobOf(user.avatar)).key)).toBeFalsy();

    await user.saveBang();
    await user.reload();
    expect(await filename(user.avatar)).toBe("racecar.jpg");
  });

  it("creating a record with an unexpected object attached", async () => {
    const error = await assertRaises([ArgumentError], {}, () =>
      User.createBang({ name: "Jason", avatar: Symbol.for("foo") }),
    );
    expect(error.message).toMatch(/^Could not find or build blob: expected attachable, got .*foo/);
  });

  it("analyzing a new blob from an uploaded file after attaching it to a new record", async () => {
    await performEnqueuedJobs(async () => {
      const user = await User.createBang({
        name: "Jason",
        avatar: fixtureFileUpload("racecar.jpg"),
      });
      const blob = await (await blobOf(user.avatar)).reload();
      expect(blob.isAnalyzed()).toBeTruthy();
      expect(blob.metadata.get("width")).toBe(4104);
      expect(blob.metadata.get("height")).toBe(2736);
    });
  });

  it("analyzing a directly-uploaded blob after attaching it to a new record", async () => {
    await performEnqueuedJobs(async () => {
      const user = await User.createBang({
        name: "Jason",
        avatar: await directlyUploadFileBlob({ filename: "racecar.jpg" }),
      });
      const blob = await (await blobOf(user.avatar)).reload();
      expect(blob.isAnalyzed()).toBeTruthy();
      expect(blob.metadata.get("width")).toBe(4104);
      expect(blob.metadata.get("height")).toBe(2736);
    });
  });

  it("detaching", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.avatar.detach());

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeTruthy();
    expect(await exist(blob.key)).toBeTruthy();
  });

  it("detaching when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.avatar.detach());

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeTruthy();
    expect(await exist(blob.key)).toBeTruthy();
  });

  it("purging", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();
    await user.updateColumn("updated_at", "2000-01-01 00:00:00");

    await assertChanges(
      () => user.readAttribute("updated_at"),
      null,
      {},
      () => user.avatar.purge(),
    );
    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await exist(blob.key)).toBeFalsy();
  });

  it("purging an attachment with a shared blob", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.avatar.attach(blob);
    expect(await anotherUser.avatar.isAttached()).toBeTruthy();

    await user.avatar.purge();
    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeTruthy();
    expect(await exist(blob.key)).toBeTruthy();
  });

  it("purging when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    const attachment = (await user.avatar.attachment)!;
    await user.avatar.purge();

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(attachment.isDestroyed()).toBeTruthy();
    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await exist(blob.key)).toBeFalsy();
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
    expect(await user.avatar.isAttached()).toBeTruthy();
    await user.updateColumn("updated_at", "2000-01-01 00:00:00");

    await performEnqueuedJobs(() =>
      assertChanges(
        () => user.readAttribute("updated_at"),
        null,
        {},
        () => user.avatar.purgeLater(),
      ),
    );

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await exist(blob.key)).toBeFalsy();
  });

  it("purging an attachment later with shared blob", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.avatar.attach(blob);
    expect(await anotherUser.avatar.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.avatar.purgeLater());

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blob.id)).toBeTruthy();
    expect(await exist(blob.key)).toBeTruthy();
  });

  it("purging an attachment later when record is not persisted", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    const user = new User();
    await user.avatar.attach(blob);
    expect(await user.avatar.isAttached()).toBeTruthy();

    const attachment = (await user.avatar.attachment)!;
    await performEnqueuedJobs(() => user.avatar.purgeLater());

    expect(await user.avatar.isAttached()).toBeFalsy();
    expect(attachment.isDestroyed()).toBeTruthy();
    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await exist(blob.key)).toBeFalsy();
  });

  it("purging dependent attachment later on destroy", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await user.avatar.attach(blob);

    await performEnqueuedJobs(() => user.destroyBang());

    expect(await Blob.isExists(blob.id)).toBeFalsy();
    expect(await exist(blob.key)).toBeFalsy();
  });

  it("not purging independent attachment on destroy", async () => {
    await user.coverPhoto.attach(await createBlob({ filename: "funky.jpg" }));

    await assertNoEnqueuedJobs(() => user.destroyBang());
  });

  it("duped record does not share attachments", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));

    const duped = await user.dup().avatar.attachment;
    expect(duped).not.toBe(await user.avatar.attachment);
  });

  it("duped record does not share attachment changes", async () => {
    await user.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(user.changedForAutosave()).toBeFalsy();

    await user.dup().avatar.attach(await createBlob({ filename: "town.jpg" }));
    expect(user.changedForAutosave()).toBeFalsy();
  });

  it("clearing change on reload", async () => {
    await user.setAvatar(await createBlob({ filename: "funky.jpg" }));
    await user.avatar.load();
    expect(user.avatar.isAttached()).toBeTruthy();

    await user.reload();
    await user.avatar.load();
    expect(user.avatar.isAttached()).toBeFalsy();
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
      const error = await assertRaises([RuntimeError], {}, () => {
        (User as unknown as Attachable).hasOneAttached("featuredPhoto");
      });

      expect(error.message).toMatch(
        /Missing Active Storage service name. Specify Active Storage service name for config.active_storage.service in config\/environments\/test.rb/,
      );
    } finally {
      activeStorage.service = service;
    }
  });

  it("raises error when misconfigured service is passed", async () => {
    const error = await assertRaises([ArgumentError], {}, () =>
      (User as unknown as Attachable).hasOneAttached("featuredPhoto", { service: "unknown" }),
    );

    expect(error.message).toMatch(/Cannot configure service "unknown" for .*User#featuredPhoto/);
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
  it("creating preview by variation name", async () => {
    await t.assertNoEnqueuedJobs({ only: TransformJob }, () =>
      user.avatarWithVariants.attach(fixtureFileUpload("report.pdf")),
    );
    const preview = await (
      (user.avatarWithVariants as unknown as Attachment).preview("thumb") as Preview
    ).processed();

    const image = await readImage(preview["variant"]());
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(77);
    expect(await image.height()).toBe(100);
  });

  it("raises error when unknown variant name is used to generate preview", async () => {
    await user.avatarWithVariants.attach(fixtureFileUpload("report.pdf"));

    const error = await assertRaises([ArgumentError], {}, async () => {
      await (
        (user.avatarWithVariants as unknown as Attachment).preview("unknown") as Preview
      ).processed();
    });

    expect(error.message).toMatch(/Cannot find variant :unknown for User#avatarWithVariants/);
  });
  // BLOCKED: activestorage-variation-and-variants
  it.skip("creating representation by variation name", () => {});
  it.skip("raises error when unknown variant name is used to generate representation", () => {});
  it.skip("transforms variants later", () => {});
  it.skip("transforms variants later conditionally via proc", () => {});
  it.skip("transforms variants later conditionally via method", () => {});

  it("avoids enqueuing transform later job or preview image job when blob is not representable", async () => {
    const unrepresentableBlob = await createBlob({ filename: "hello.txt" });

    await t.assertNoEnqueuedJobs({ only: [TransformJob, PreviewImageJob] }, () =>
      user.avatarWithPreprocessed.attach(unrepresentableBlob),
    );
  });

  it("avoids enqueuing transform later job or preview later job if there aren't any variants to preprocess", async () => {
    const blob = await createFileBlob({ filename: "report.pdf" });

    await t.assertNoEnqueuedJobs({ only: [TransformJob, PreviewImageJob] }, () =>
      user.resume.attach(blob),
    );
  });

  it("creates preview later without transforming variants if required and there are variants to preprocess", async () => {
    const blob = await createFileBlob({ filename: "report.pdf" });

    await t.assertEnqueuedWith(
      { job: PreviewImageJob, args: [blob, [{ resizeToFill: [400, 400] }]] },
      () =>
        t.assertNoEnqueuedJobs({ only: TransformJob }, () =>
          user.resumeWithPreprocessing.attach(blob),
        ),
    );
  });
});
