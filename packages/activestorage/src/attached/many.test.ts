import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertChanges,
  assertDifference,
  assertNoChanges,
  assertRaises,
  TopLevel,
  type Extended,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { ArgumentError, RuntimeError, StringIO } from "@blazetrails/ruby-compat";
import { Base, type Relation } from "@blazetrails/activerecord";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import type { Attachment } from "../attachment.js";
import { Blob } from "../blob.js";
import { PurgeJob } from "../purge-job.js";
import {
  createBlob,
  createFileBlob,
  fixtureFileUpload,
  User,
} from "../test-helpers/test-helper.js";
import type { Many } from "./many.js";
import type { ClassMethods } from "./model.js";

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
});

afterAll(() => {
  const blob = Blob.prototype as unknown as { [k: string]: unknown };
  delete blob.isAnalyzed;
  delete blob.analyzeLater;
  delete blob.isPreviewImageNeededBeforeProcessingVariants;
});

type Attachable = Extended<typeof ClassMethods>;
type Delegated = { reload(): Promise<unknown>; count(): Promise<number> };

const attachmentAt = async (many: Many, index: number): Promise<Attachment> =>
  (await many.attachments)[index];
const blobAt = async (many: Many, index: number): Promise<Blob> =>
  (await (
    await attachmentAt(many, index)
  ).blob)!;
const filename = async (many: Many, index: number): Promise<string> =>
  (await blobAt(many, index)).filename.toString();
const exist = (key: string) => Blob.service!.isExist(key);
const existAt = async (many: Many, index: number) => exist((await blobAt(many, index)).key);
const reloaded = async (many: Many) => {
  await (many as unknown as Delegated).reload();
  return many;
};
const count = (many: Many) => (many as unknown as Delegated).count();
const stuff = () => ({
  io: new StringIO("STUFF"),
  filename: "funky.jpg",
  contentType: "image/jpeg",
});
const things = () => ({
  io: new StringIO("THINGS"),
  filename: "town.jpg",
  contentType: "image/jpeg",
});
const funkyAndTown = async () => [
  await createBlob({ filename: "funky.jpg" }),
  await createBlob({ filename: "town.jpg" }),
];
const funkyAndTownVideos = async () => [
  await createBlob({ filename: "funky.mp4" }),
  await createBlob({ filename: "town.mp4" }),
];
const threeBlobs = async () => [
  ...(await funkyAndTown()),
  await createBlob({ filename: "worm.jpg" }),
];
const expectGone = async (blob: Blob) => {
  expect(await Blob.isExists(blob.id)).toBe(false);
  expect(await exist(blob.key)).toBe(false);
};
const expectKept = async (blob: Blob) => {
  expect(await Blob.isExists(blob.id)).toBe(true);
  expect(await exist(blob.key)).toBe(true);
};

class ManyAttachedTest extends TestCase {
  manyAttached(): void {}
}

describe("ActiveStorage::ManyAttachedTest", () => {
  let user: User;
  let t: TestHelper;
  const performEnqueuedJobs = (block: () => unknown) => t.performEnqueuedJobs({}, block);
  const assertNoEnqueuedJobs = (block: () => unknown) => t.assertNoEnqueuedJobs({}, block);
  const assertNoPurgeJobs = (block: () => unknown) =>
    t.assertNoEnqueuedJobs({ only: PurgeJob }, block);
  const expectOrder = async (first: string, second: string) => {
    expect(await filename(user.highlights, 0)).toBe(first);
    expect(await filename(user.highlights, 1)).toBe(second);
  };
  const expectUnsavedUntilSave = async (first: string, second: string) => {
    await expectOrder(first, second);
    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBe(false);
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBe(false);
    expect(user.isWillSaveChangeToAttribute("name")).toBe(true);

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe(first);
    expect(await filename(user.highlights, 1)).toBe(second);
  };
  const expectThreeUploaded = async () => {
    expect(await filename(user.highlights, 0)).toBe("image.gif");
    expect(await filename(user.highlights, 1)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 2)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(true);
    expect(await existAt(user.highlights, 1)).toBe(true);
    expect(await existAt(user.highlights, 2)).toBe(true);
  };

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = new ManyAttachedTest("manyAttached") as unknown as TestHelper;
    await t.beforeSetup();
    user = await User.createBang({ name: "Josh" });
  });

  afterEach(async () => {
    await t.afterTeardown();
    for (const blob of await Blob.all().toArray()) await blob.delete();
  });

  it("attaching existing blobs to an existing record", async () => {
    await user.highlights.attach(...(await funkyAndTown()));
    await expectOrder("funky.jpg", "town.jpg");

    expect((await user.highlightsAttachments).length).toBeGreaterThan(0);
    expect(await user.highlightsBlobs.count()).toBe(2);
  });

  it("attaching existing blobs from signed IDs to an existing record", async () => {
    const [funky, town] = await funkyAndTown();
    await user.highlights.attach(funky.signedId(), town.signedId());
    await expectOrder("funky.jpg", "town.jpg");
  });

  it("attaching new blobs from Hashes to an existing record", async () => {
    await user.highlights.attach(stuff(), things());

    await expectOrder("funky.jpg", "town.jpg");
  });

  it("attaching new blobs from uploaded files to an existing record", async () => {
    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));
    await expectOrder("racecar.jpg", "video.mp4");
  });

  it("attaching existing blobs to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    await user.highlights.attach(...(await funkyAndTown()));
    await expectUnsavedUntilSave("funky.jpg", "town.jpg");
  });

  it("attaching existing blobs from signed IDs to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    const [funky, town] = await funkyAndTown();
    await user.highlights.attach(funky.signedId(), town.signedId());
    await expectUnsavedUntilSave("funky.jpg", "town.jpg");
  });

  it("attaching new blobs from Hashes to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    await user.highlights.attach(stuff(), things());

    await expectUnsavedUntilSave("funky.jpg", "town.jpg");
  });

  it("attaching new blobs from uploaded files to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));
    await expectUnsavedUntilSave("racecar.jpg", "video.mp4");
  });

  it("attaching new blobs from uploaded files to an existing, changed record one at a time", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBe(true);

    await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
    await user.highlights.attach(fixtureFileUpload("video.mp4"));
    await expectOrder("racecar.jpg", "video.mp4");
    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBe(false);
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBe(false);
    expect(user.isWillSaveChangeToAttribute("name")).toBe(true);
    expect(await existAt(user.highlights, 0)).toBe(false);
    expect(await existAt(user.highlights, 1)).toBe(false);

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(true);
    expect(await existAt(user.highlights, 1)).toBe(true);
  });

  it("attaching new blobs within a transaction uploads all the files", async () => {
    await user.highlights.attach(fixtureFileUpload("image.gif"));

    await Base.transaction(async () => {
      await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
      await user.highlights.attach(fixtureFileUpload("video.mp4"));
    });

    await expectThreeUploaded();
  });

  it("attaching many new blobs within a transaction uploads all the files", async () => {
    await Base.transaction(async () => {
      await user.highlights.attach([
        fixtureFileUpload("image.gif"),
        fixtureFileUpload("racecar.jpg"),
      ]);
      await user.highlights.attach(fixtureFileUpload("video.mp4"));
    });

    await expectThreeUploaded();
  });

  it("attaching many new blobs within a transaction on a dirty record uploads all the files", async () => {
    user.name = "Tina";

    await Base.transaction(async () => {
      await user.highlights.attach(fixtureFileUpload("image.gif"));
      await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
    });

    await user.highlights.attach(fixtureFileUpload("video.mp4"));
    await user.save();

    await expectThreeUploaded();
  });

  it("attaching many new blobs within a transaction on a new record uploads all the files", async () => {
    const created = await User.createBang({ name: "John" }, async (record) => {
      await record.highlights.attach(stuff());
      await record.highlights.attach(things());
    });

    expect(await count(created.highlights)).toBe(2);
    expect(await filename(created.highlights, 0)).toBe("funky.jpg");
    expect(await filename(created.highlights, 1)).toBe("town.jpg");
    expect(await existAt(created.highlights, 0)).toBe(true);
    expect(await existAt(created.highlights, 1)).toBe(true);
  });

  it("attaching new blobs within a transaction create the exact amount of records", async () => {
    await assertDifference(
      () => Blob.count(),
      2,
      null,
      async () => {
        await Base.transaction(async () => {
          await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
          await user.highlights.attach(fixtureFileUpload("video.mp4"));
        });
      },
    );

    expect(await count(user.highlights)).toBe(2);
    await expectOrder("racecar.jpg", "video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(true);
    expect(await existAt(user.highlights, 1)).toBe(true);
  });

  it("attaching existing blobs to an existing record one at a time", async () => {
    await user.highlights.attach(await createBlob({ filename: "funky.jpg" }));
    await user.highlights.attach(await createBlob({ filename: "town.jpg" }));
    await expectOrder("funky.jpg", "town.jpg");

    await user.reload();
    await expectOrder("funky.jpg", "town.jpg");
  });

  it("updating an existing record to attach existing blobs", async () => {
    await user.updateBang({
      highlights: [
        await createFileBlob({ filename: "racecar.jpg" }),
        await createFileBlob({ filename: "video.mp4" }),
      ],
    });
    await expectOrder("racecar.jpg", "video.mp4");
  });

  it("updating an existing record to attach existing blobs from signed IDs", async () => {
    const [funky, town] = await funkyAndTown();
    await user.updateBang({ highlights: [funky.signedId(), town.signedId()] });
    await expectOrder("funky.jpg", "town.jpg");
  });

  it("successfully updating an existing record to attach new blobs from uploaded files", async () => {
    await user.setHighlights([fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")]);
    await expectOrder("racecar.jpg", "video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(false);
    expect(await existAt(user.highlights, 1)).toBe(false);

    await user.saveBang();
    expect(await existAt(user.highlights, 0)).toBe(true);
    expect(await existAt(user.highlights, 1)).toBe(true);
  });

  it("unsuccessfully updating an existing record to attach new blobs from uploaded files", async () => {
    expect(
      await user.update({
        name: "",
        highlights: [fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")],
      }),
    ).toBe(false);
    await expectOrder("racecar.jpg", "video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(false);
    expect(await existAt(user.highlights, 1)).toBe(false);
  });

  it("replacing existing, dependent attachments on an existing record via assign and attach", async () => {
    const oldBlobs = await funkyAndTown();
    await user.highlights.attach(oldBlobs);

    await user.setHighlights([]);
    expect(await user.highlights.isAttached()).toBe(false);

    await performEnqueuedJobs(async () => {
      await user.highlights.attach(
        await createBlob({ filename: "whenever.jpg" }),
        await createBlob({ filename: "wherever.jpg" }),
      );
    });

    await expectOrder("whenever.jpg", "wherever.jpg");
    await expectGone(oldBlobs[0]);
    await expectGone(oldBlobs[1]);
  });

  it("replacing existing, independent attachments on an existing record via assign and attach", async () => {
    await user.vlogs.attach(...(await funkyAndTownVideos()));

    await user.setVlogs([]);
    expect(await user.vlogs.isAttached()).toBe(false);

    await assertNoPurgeJobs(async () => {
      await user.vlogs.attach(
        await createBlob({ filename: "whenever.mp4" }),
        await createBlob({ filename: "wherever.mp4" }),
      );
    });

    expect(await filename(user.vlogs, 0)).toBe("whenever.mp4");
    expect(await filename(user.vlogs, 1)).toBe("wherever.mp4");
  });

  it("replacing attachments with an empty list", async () => {
    await user.setHighlights([]);
    expect(await user.highlights.attachments).toHaveLength(0);
  });

  it("replacing attachments with a list containing empty items", async () => {
    await user.setHighlights([""]);
    expect(await user.highlights.attachments).toHaveLength(0);
  });

  it("replacing attachments with a list containing a mixture of empty and present items", async () => {
    await user.setHighlights(["", fixtureFileUpload("racecar.jpg")]);
    expect(await user.highlights.attachments).toHaveLength(1);
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
  });

  it("successfully updating an existing record to replace existing, dependent attachments", async () => {
    const oldBlobs = await funkyAndTown();
    await user.highlights.attach(oldBlobs);

    await performEnqueuedJobs(async () => {
      await user.updateBang({
        highlights: [
          await createBlob({ filename: "whenever.jpg" }),
          await createBlob({ filename: "wherever.jpg" }),
        ],
      });
    });

    await expectOrder("whenever.jpg", "wherever.jpg");
    await expectGone(oldBlobs[0]);
    await expectGone(oldBlobs[1]);
  });

  it("successfully updating an existing record to replace existing, independent attachments", async () => {
    await user.vlogs.attach(...(await funkyAndTownVideos()));

    await assertNoPurgeJobs(async () => {
      await user.updateBang({
        vlogs: [
          await createBlob({ filename: "whenever.mp4" }),
          await createBlob({ filename: "wherever.mp4" }),
        ],
      });
    });

    expect(await filename(user.vlogs, 0)).toBe("whenever.mp4");
    expect(await filename(user.vlogs, 1)).toBe("wherever.mp4");
  });

  it("unsuccessfully updating an existing record to replace existing attachments", async () => {
    await user.highlights.attach(...(await funkyAndTown()));

    await assertNoEnqueuedJobs(async () => {
      expect(
        await user.update({
          name: "",
          highlights: [fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")],
        }),
      ).toBe(false);
    });

    await expectOrder("racecar.jpg", "video.mp4");
    expect(await existAt(user.highlights, 0)).toBe(false);
    expect(await existAt(user.highlights, 1)).toBe(false);
  });

  it("updating an existing record to attach one new blob and one previously-attached blob", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs[0]);

    await performEnqueuedJobs(() =>
      assertNoChanges(
        async () => (await user.highlightsAttachments)[0].id,
        null,
        {},
        async () => {
          await user.updateBang({ highlights: blobs });
        },
      ),
    );

    await expectOrder("funky.jpg", "town.jpg");
    expect(await existAt(user.highlights, 0)).toBe(true);
  });

  it("updating an existing record to remove dependent attachments", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);

    await t.assertEnqueuedWith({ job: PurgeJob, args: [blobs[0]] }, () =>
      t.assertEnqueuedWith({ job: PurgeJob, args: [blobs[1]] }, () =>
        user.updateBang({ highlights: [] }),
      ),
    );

    expect(await user.highlights.isAttached()).toBe(false);
  });

  it("updating an existing record to remove independent attachments", async () => {
    await user.vlogs.attach(await funkyAndTownVideos());

    await assertNoPurgeJobs(() => user.updateBang({ vlogs: [] }));

    expect(await user.vlogs.isAttached()).toBe(false);
  });

  it("updating an existing record with attachments", async () => {
    await user.highlights.attach(...(await funkyAndTown()));
    const highlightsCount = async () => count((await user.reload()).highlights);

    await assertDifference(highlightsCount, -2, null, () => user.updateBang({ highlights: [] }));

    await assertDifference(highlightsCount, 2, null, async () => {
      await user.updateBang({
        highlights: [
          await createBlob({ filename: "whenever.jpg" }),
          await createBlob({ filename: "wherever.jpg" }),
        ],
      });
    });

    await assertDifference(highlightsCount, -2, null, () => user.updateBang({ highlights: null }));
  });

  it("attaching existing blobs to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach(...(await funkyAndTown()));
    expect(user.isNewRecord()).toBe(true);
    await expectOrder("funky.jpg", "town.jpg");

    await user.saveBang();
    await expectOrder("funky.jpg", "town.jpg");
  });

  it("attaching an existing blob from a signed ID to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach((await createBlob({ filename: "funky.jpg" })).signedId());
    expect(user.isNewRecord()).toBe(true);
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");

    await user.saveBang();
    expect(await filename((await user.reload()).highlights, 0)).toBe("funky.jpg");
  });

  const attachesToANewRecord = async (first: string, second: string) => {
    expect(user.isNewRecord()).toBe(true);
    expect((await attachmentAt(user.highlights, 0)).isNewRecord()).toBe(true);
    expect((await attachmentAt(user.highlights, 1)).isNewRecord()).toBe(true);
    expect((await blobAt(user.highlights, 0)).isNewRecord()).toBe(true);
    expect((await blobAt(user.highlights, 1)).isNewRecord()).toBe(true);
    await expectOrder(first, second);
    expect(await existAt(user.highlights, 0)).toBe(false);
    expect(await existAt(user.highlights, 1)).toBe(false);

    await user.saveBang();
  };
  const expectPersistedAfterReload = async (first: string, second: string) => {
    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBe(true);
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBe(true);
    expect((await blobAt(user.highlights, 0)).isPersisted()).toBe(true);
    expect((await blobAt(user.highlights, 1)).isPersisted()).toBe(true);
    expect(await filename((await user.reload()).highlights, 0)).toBe(first);
    expect(await filename(user.highlights, 1)).toBe(second);
    expect(await existAt(user.highlights, 0)).toBe(true);
    expect(await existAt(user.highlights, 1)).toBe(true);
  };

  it("attaching new blobs from Hashes to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach(stuff(), things());

    await attachesToANewRecord("funky.jpg", "town.jpg");
    await expectPersistedAfterReload("funky.jpg", "town.jpg");
  });

  it("attaching new blobs from uploaded files to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));

    await attachesToANewRecord("racecar.jpg", "video.mp4");
    await expectPersistedAfterReload("racecar.jpg", "video.mp4");
  });

  it("creating a record with existing blobs attached", async () => {
    user = await User.createBang({ name: "Jason", highlights: await funkyAndTown() });
    expect(await filename((await user.reload()).highlights, 0)).toBe("funky.jpg");
    expect(await filename((await user.reload()).highlights, 1)).toBe("town.jpg");
  });

  it("creating a record with an existing blob from signed IDs attached", async () => {
    const [funky, town] = await funkyAndTown();
    user = await User.createBang({
      name: "Jason",
      highlights: [funky.signedId(), town.signedId()],
    });
    expect(await filename((await user.reload()).highlights, 0)).toBe("funky.jpg");
    expect(await filename((await user.reload()).highlights, 1)).toBe("town.jpg");
  });

  it("creating a record with new blobs from uploaded files attached", async () => {
    user = new User({ name: "Jason" });
    await user.setHighlights([fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")]);
    await attachesToANewRecord("racecar.jpg", "video.mp4");
    await expectOrder("racecar.jpg", "video.mp4");
  });

  it("creating a record with an unexpected object attached", async () => {
    const error = await assertRaises([ArgumentError], {}, () =>
      User.createBang({ name: "Jason", highlights: Symbol.for("foo") }),
    );
    expect(error.message).toMatch(/^Could not find or build blob: expected attachable, got /);
  });

  it("detaching", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    await performEnqueuedJobs(() => user.highlights.detach());

    expect(await user.highlights.isAttached()).toBe(false);
    await expectKept(blobs[0]);
    await expectKept(blobs[1]);
  });

  it("detaching when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    await performEnqueuedJobs(() => user.highlights.detach());

    expect(await user.highlights.isAttached()).toBe(false);
    await expectKept(blobs[0]);
    await expectKept(blobs[1]);
  });

  it("purging", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    await user.updateColumn("updated_at", "2000-01-01 00:00:00");
    await assertChanges(
      () => user.readAttribute("updated_at"),
      null,
      {},
      () => user.highlights.purge(),
    );
    expect(await user.highlights.isAttached()).toBe(false);
    await expectGone(blobs[0]);
    await expectGone(blobs[1]);
  });

  const attachSharedBlobs = async () => {
    const blobs = await threeBlobs();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.highlights.attach([blobs[1], blobs[2]]);
    expect(await anotherUser.highlights.isAttached()).toBe(true);
    return blobs;
  };

  it("purging attachment with shared blobs", async () => {
    const blobs = await attachSharedBlobs();

    await user.highlights.purge();
    expect(await user.highlights.isAttached()).toBe(false);

    await expectGone(blobs[0]);
    await expectKept(blobs[1]);
    await expectKept(blobs[2]);
  });

  it("purging when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    const attachments = await user.highlights.attachments;
    await user.highlights.purge();

    expect(await user.highlights.isAttached()).toBe(false);
    expect(attachments.every((attachment) => attachment.isDestroyed())).toBe(true);
    for (const blob of blobs) await expectGone(blob);
  });

  it("purging delete changes when record is not persisted", async () => {
    user = new User();
    await user.setHighlights([]);

    await user.highlights.purge();

    expect(user.attachmentChanges["highlights"]).toBeUndefined();
  });

  it("purging later", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    await user.updateColumn("updated_at", "2000-01-01 00:00:00");
    await performEnqueuedJobs(() =>
      assertChanges(
        () => user.readAttribute("updated_at"),
        null,
        {},
        () => user.highlights.purgeLater(),
      ),
    );

    expect(await user.highlights.isAttached()).toBe(false);
    await expectGone(blobs[0]);
    await expectGone(blobs[1]);
  });

  it("purging attachment later with shared blobs", async () => {
    const blobs = await attachSharedBlobs();

    await performEnqueuedJobs(() => user.highlights.purgeLater());

    expect(await user.highlights.isAttached()).toBe(false);
    await expectGone(blobs[0]);
    await expectKept(blobs[1]);
    await expectKept(blobs[2]);
  });

  it("purging attachment later when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBe(true);

    await performEnqueuedJobs(() => user.highlights.purgeLater());

    expect(await user.highlights.isAttached()).toBe(false);
    for (const blob of blobs) await expectGone(blob);
  });

  it("purging dependent attachment later on destroy", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);

    await performEnqueuedJobs(() => user.destroyBang());

    await expectGone(blobs[0]);
    await expectGone(blobs[1]);
  });

  it("not purging independent attachment on destroy", async () => {
    await user.vlogs.attach(await funkyAndTownVideos());

    await assertNoEnqueuedJobs(() => user.destroyBang());
  });

  it("duped record does not share attachments", async () => {
    await user.highlights.attach([await createBlob({ filename: "funky.jpg" })]);

    const duped = await attachmentAt(user.dup().highlights, 0);
    expect(duped === (await attachmentAt(user.highlights, 0))).toBe(false);
  });

  it("duped record does not share attachment changes", async () => {
    await user.highlights.attach([await createBlob({ filename: "funky.jpg" })]);
    expect(user.changedForAutosave()).toBe(false);

    await user.dup().highlights.attach([await createBlob({ filename: "town.mp4" })]);
    expect(user.changedForAutosave()).toBe(false);
  });

  it("clearing change on reload", async () => {
    await user.setHighlights(await funkyAndTown());
    expect(await user.highlights.isAttached()).toBe(true);

    await user.reload();
    expect(await user.highlights.isAttached()).toBe(false);
  });

  it("overriding attached reader", async () => {
    await user.highlights.attach(...(await funkyAndTown()));

    await expectOrder("funky.jpg", "town.jpg");

    const reader = (): PropertyDescriptor => {
      let proto: object = User.prototype;
      for (;;) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, "highlights");
        if (descriptor != null) return descriptor;
        proto = Object.getPrototypeOf(proto) as object;
      }
    };
    const descriptor = reader();
    try {
      Object.defineProperty(User.prototype, "highlights", {
        configurable: true,
        async get(this: User) {
          const many = descriptor.get!.call(this) as Many;
          return [...(await many.attachments)].reverse();
        },
      });

      const highlights = (await user.highlights) as unknown as Attachment[];
      expect((await highlights[0].blob)!.filename.toString()).toBe("town.jpg");
      expect((await highlights[1].blob)!.filename.toString()).toBe("funky.jpg");
    } finally {
      delete (User.prototype as unknown as { highlights?: unknown }).highlights;
    }
  });

  // BLOCKED: activestorage-mirror-service-over-disk
  it.skip("attaching a new blob from a Hash with a custom service", () => {});
  it.skip("attaching a new blob from an uploaded file with a custom service", () => {});
  it.skip("attaching a new blob from an uploaded file with a service defined at runtime", () => {});

  it("attaching blobs to a persisted, unchanged, and valid record, returns the attachments", async () => {
    await user.highlights.attach(await createBlob({ filename: "racecar.jpg" }));
    const returnValue = await user.highlights.attach(...(await funkyAndTown()));
    expect(returnValue).toBe(user.highlights);
  });

  it("attaching blobs to a persisted, unchanged, and invalid record, returns nil", async () => {
    await user.updateAttribute("name", null);
    expect(await user.isValid()).toBe(false);

    await user.highlights.attach(await createBlob({ filename: "racecar.jpg" }));
    const returnValue = await user.highlights.attach(...(await funkyAndTown()));
    expect(returnValue).toBeNull();
  });

  it("attaching blobs to a changed record, returns the attachments", async () => {
    user.name = "Tina";
    await user.highlights.attach(await createBlob({ filename: "racecar.jpg" }));
    const returnValue = await user.highlights.attach(...(await funkyAndTown()));
    expect(returnValue).toBe(user.highlights);
  });

  it("attaching blobs to a non persisted record, returns the attachments", async () => {
    user = new User({ name: "John" });
    await user.highlights.attach(await createBlob({ filename: "racecar.jpg" }));
    const returnValue = await user.highlights.attach(...(await funkyAndTown()));
    expect(returnValue).toBe(user.highlights);
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
          (User as unknown as Attachable).hasManyAttached("featuredPhotos");
        },
      );
    } finally {
      activeStorage.service = service;
    }
  });

  it("raises error when misconfigured service is passed", () => {
    expect(() =>
      (User as unknown as Attachable).hasManyAttached("featuredPhotos", { service: "unknown" }),
    ).toThrow(/Cannot configure service "unknown" for .*User#featuredPhotos/);
  });

  it("raises error when misconfigured service is defined at runtime", async () => {
    class ExtraAttached extends User {
      static override get tableName() {
        return "users";
      }
      static {
        (this as unknown as Attachable).hasManyAttached("featuredVlogs", {
          service: () => "unknown",
        });
      }
    }
    const extra = user.becomes(ExtraAttached) as unknown as { featuredVlogs: Many };

    await expect(extra.featuredVlogs.attach(fixtureFileUpload("video.mp4"))).rejects.toThrow(
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
  it.skip("avoids enqueuing transform later and create preview job job when blob is not representable", () => {});

  it("successfully attaches new blobs and destroys attachments marked for destruction via nested attributes", async () => {
    const townBlob = await createBlob({ filename: "town.jpg" });
    await user.highlights.attach(townBlob);
    await user.reload();

    const racecarBlob = fixtureFileUpload("racecar.jpg");
    const attachmentId = (
      await (townBlob.attachments as unknown as Relation<Attachment>).findByBang({ record: user })
    ).id;
    await user.update({
      highlights: [racecarBlob],
      highlightsAttachmentsAttributes: [{ id: attachmentId, _destroy: true }],
    });

    expect(await (await user.reload()).highlights.isAttached()).toBe(true);
    expect(await count(user.highlights)).toBe(1);
    expect((await user.highlights.blobs)[0].filename.toString()).toBe("racecar.jpg");
  });
});
