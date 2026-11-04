import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
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
import "../../test-helpers/database/setup.js";
import { ActiveStorage } from "../../active-storage.js";
import type { Attachment } from "../../attachment.js";
import { Blob } from "../../blob.js";
import type { Preview } from "../../preview.js";
import { PreviewImageJob } from "../../preview-image-job.js";
import { PurgeJob } from "../../purge-job.js";
import { TransformJob } from "../../transform-job.js";
import { DiskService } from "../../service/disk-service.js";
import { MirrorService } from "../../service/mirror-service.js";
import {
  createBlob,
  createFileBlob,
  fixtureFileUpload,
  readImage,
  withService,
  User,
} from "../../test-helpers/test-helper.js";
import type { Many } from "../../attached/many.js";
import type { ClassMethods } from "../../attached/model.js";

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
});

afterAll(() => {
  const blob = Blob.prototype as unknown as { [k: string]: unknown };
  delete blob.isAnalyzed;
  delete blob.analyzeLater;
});

type Attachable = Extended<typeof ClassMethods>;
type FirstBlob = { first(): Promise<Blob> };
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

  const variableContentTypesWas = ActiveStorage.variableContentTypes;

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    ActiveStorage.variableContentTypes = ["image/png", "image/jpeg"];
    t = new ManyAttachedTest("manyAttached") as unknown as TestHelper;
    await t.beforeSetup();
    user = await User.createBang({ name: "Josh" });
  });

  afterEach(async () => {
    await t.afterTeardown();
    ActiveStorage.variableContentTypes = variableContentTypesWas;
    for (const blob of await Blob.all().toArray()) await blob.delete();
  });

  it("attaching existing blobs to an existing record", async () => {
    await user.highlights.attach(...(await funkyAndTown()));
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect(await user.highlightsAttachments).not.toBeEmpty();
    expect(await user.highlightsBlobs.count()).toBe(2);
  });

  it("attaching existing blobs from signed IDs to an existing record", async () => {
    const [funky, town] = await funkyAndTown();
    await user.highlights.attach(funky.signedId(), town.signedId());
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching new blobs from Hashes to an existing record", async () => {
    await user.highlights.attach(stuff(), things());

    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching new blobs from uploaded files to an existing record", async () => {
    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
  });

  it("attaching existing blobs to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.highlights.attach(...(await funkyAndTown()));
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeFalsy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching existing blobs from signed IDs to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    const [funky, town] = await funkyAndTown();
    await user.highlights.attach(funky.signedId(), town.signedId());
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeFalsy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching new blobs from Hashes to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.highlights.attach(stuff(), things());

    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeFalsy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching new blobs from uploaded files to an existing, changed record", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeFalsy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
  });

  it("attaching new blobs from uploaded files to an existing, changed record one at a time", async () => {
    user.name = "Tina";
    expect(user.isChanged).toBeTruthy();

    await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
    await user.highlights.attach(fixtureFileUpload("video.mp4"));
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeFalsy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeFalsy();
    expect(user.isWillSaveChangeToAttribute("name")).toBeTruthy();
    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();

    await user.saveBang();
    expect(await filename(await reloaded(user.highlights), 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
  });

  it("attaching new blobs within a transaction uploads all the files", async () => {
    await user.highlights.attach(fixtureFileUpload("image.gif"));

    await Base.transaction(async () => {
      await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
      await user.highlights.attach(fixtureFileUpload("video.mp4"));
    });

    expect(await filename(user.highlights, 0)).toBe("image.gif");
    expect(await filename(user.highlights, 1)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 2)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
    expect(await existAt(user.highlights, 2)).toBeTruthy();
  });

  it("attaching many new blobs within a transaction uploads all the files", async () => {
    await Base.transaction(async () => {
      await user.highlights.attach([
        fixtureFileUpload("image.gif"),
        fixtureFileUpload("racecar.jpg"),
      ]);
      await user.highlights.attach(fixtureFileUpload("video.mp4"));
    });

    expect(await filename(user.highlights, 0)).toBe("image.gif");
    expect(await filename(user.highlights, 1)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 2)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
    expect(await existAt(user.highlights, 2)).toBeTruthy();
  });

  it("attaching many new blobs within a transaction on a dirty record uploads all the files", async () => {
    user.name = "Tina";

    await Base.transaction(async () => {
      await user.highlights.attach(fixtureFileUpload("image.gif"));
      await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
    });

    await user.highlights.attach(fixtureFileUpload("video.mp4"));
    await user.save();

    expect(await filename(user.highlights, 0)).toBe("image.gif");
    expect(await filename(user.highlights, 1)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 2)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
    expect(await existAt(user.highlights, 2)).toBeTruthy();
  });

  it("attaching many new blobs within a transaction on a new record uploads all the files", async () => {
    const created = await User.createBang({ name: "John" }, async (record) => {
      await record.highlights.attach(stuff());
      await record.highlights.attach(things());
    });

    expect(await count(created.highlights)).toBe(2);
    expect(await filename(created.highlights, 0)).toBe("funky.jpg");
    expect(await filename(created.highlights, 1)).toBe("town.jpg");
    expect(await existAt(created.highlights, 0)).toBeTruthy();
    expect(await existAt(created.highlights, 1)).toBeTruthy();
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
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
  });

  it("attaching existing blobs to an existing record one at a time", async () => {
    await user.highlights.attach(await createBlob({ filename: "funky.jpg" }));
    await user.highlights.attach(await createBlob({ filename: "town.jpg" }));
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    await user.reload();
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("updating an existing record to attach existing blobs", async () => {
    await user.updateBang({
      highlights: [
        await createFileBlob({ filename: "racecar.jpg" }),
        await createFileBlob({ filename: "video.mp4" }),
      ],
    });
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
  });

  it("updating an existing record to attach existing blobs from signed IDs", async () => {
    const [funky, town] = await funkyAndTown();
    await user.updateBang({ highlights: [funky.signedId(), town.signedId()] });
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("successfully updating an existing record to attach new blobs from uploaded files", async () => {
    await user.setHighlights([fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")]);
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();

    await user.saveBang();
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
  });

  it("unsuccessfully updating an existing record to attach new blobs from uploaded files", async () => {
    expect(
      await user.update({
        name: "",
        highlights: [fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4")],
      }),
    ).toBeFalsy();
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();
  });

  it("replacing existing, dependent attachments on an existing record via assign and attach", async () => {
    const oldBlobs = await funkyAndTown();
    await user.highlights.attach(oldBlobs);

    await user.setHighlights([]);
    expect(await user.highlights.isAttached()).toBeFalsy();

    await performEnqueuedJobs(async () => {
      await user.highlights.attach(
        await createBlob({ filename: "whenever.jpg" }),
        await createBlob({ filename: "wherever.jpg" }),
      );
    });

    expect(await filename(user.highlights, 0)).toBe("whenever.jpg");
    expect(await filename(user.highlights, 1)).toBe("wherever.jpg");

    expect(await Blob.isExists(oldBlobs[0].id)).toBeFalsy();
    expect(await exist(oldBlobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(oldBlobs[1].id)).toBeFalsy();
    expect(await exist(oldBlobs[1].key)).toBeFalsy();
  });

  it("replacing existing, independent attachments on an existing record via assign and attach", async () => {
    await user.vlogs.attach(...(await funkyAndTownVideos()));

    await user.setVlogs([]);
    expect(await user.vlogs.isAttached()).toBeFalsy();

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
    expect(await user.highlights.attachments).toBeEmpty();
  });

  it("replacing attachments with a list containing empty items", async () => {
    await user.setHighlights([""]);
    expect(await user.highlights.attachments).toBeEmpty();
  });

  it("replacing attachments with a list containing a mixture of empty and present items", async () => {
    await user.setHighlights(["", fixtureFileUpload("racecar.jpg")]);
    expect((await user.highlights.attachments).length).toEqual(1);
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

    expect(await filename(user.highlights, 0)).toBe("whenever.jpg");
    expect(await filename(user.highlights, 1)).toBe("wherever.jpg");

    expect(await Blob.isExists(oldBlobs[0].id)).toBeFalsy();
    expect(await exist(oldBlobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(oldBlobs[1].id)).toBeFalsy();
    expect(await exist(oldBlobs[1].key)).toBeFalsy();
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
      ).toBeFalsy();
    });

    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();
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

    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect(await existAt(user.highlights, 0)).toBeTruthy();
  });

  it("updating an existing record to remove dependent attachments", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);

    await t.assertEnqueuedWith({ job: PurgeJob, args: [blobs[0]] }, () =>
      t.assertEnqueuedWith({ job: PurgeJob, args: [blobs[1]] }, () =>
        user.updateBang({ highlights: [] }),
      ),
    );

    expect(await user.highlights.isAttached()).toBeFalsy();
  });

  it("updating an existing record to remove independent attachments", async () => {
    await user.vlogs.attach(await funkyAndTownVideos());

    await assertNoPurgeJobs(() => user.updateBang({ vlogs: [] }));

    expect(await user.vlogs.isAttached()).toBeFalsy();
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
    expect(user.isNewRecord()).toBeTruthy();
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    await user.saveBang();
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
  });

  it("attaching an existing blob from a signed ID to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach((await createBlob({ filename: "funky.jpg" })).signedId());
    expect(user.isNewRecord()).toBeTruthy();
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");

    await user.saveBang();
    expect(await filename((await user.reload()).highlights, 0)).toBe("funky.jpg");
  });

  it("attaching new blobs from Hashes to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach(stuff(), things());

    expect(user.isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();

    await user.saveBang();

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeTruthy();
    expect((await blobAt(user.highlights, 0)).isPersisted()).toBeTruthy();
    expect((await blobAt(user.highlights, 1)).isPersisted()).toBeTruthy();
    expect(await filename((await user.reload()).highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
  });

  it("attaching new blobs from uploaded files to a new record", async () => {
    user = new User({ name: "Jason" });
    await user.highlights.attach(fixtureFileUpload("racecar.jpg"), fixtureFileUpload("video.mp4"));

    expect(user.isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();

    await user.saveBang();

    expect((await attachmentAt(user.highlights, 0)).isPersisted()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 1)).isPersisted()).toBeTruthy();
    expect((await blobAt(user.highlights, 0)).isPersisted()).toBeTruthy();
    expect((await blobAt(user.highlights, 1)).isPersisted()).toBeTruthy();
    expect(await filename((await user.reload()).highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
    expect(await existAt(user.highlights, 0)).toBeTruthy();
    expect(await existAt(user.highlights, 1)).toBeTruthy();
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
    expect(user.isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await attachmentAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 0)).isNewRecord()).toBeTruthy();
    expect((await blobAt(user.highlights, 1)).isNewRecord()).toBeTruthy();
    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");

    expect(await existAt(user.highlights, 0)).toBeFalsy();
    expect(await existAt(user.highlights, 1)).toBeFalsy();

    await user.saveBang();

    expect(await filename(user.highlights, 0)).toBe("racecar.jpg");
    expect(await filename(user.highlights, 1)).toBe("video.mp4");
  });

  it("creating a record with an unexpected object attached", async () => {
    const error = await assertRaises([ArgumentError], {}, () =>
      User.createBang({ name: "Jason", highlights: Symbol.for("foo") }),
    );
    expect(error.message).toMatch(/^Could not find or build blob: expected attachable, got .*foo/);
  });

  it("detaching", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.highlights.detach());

    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blobs[0].id)).toBeTruthy();
    expect(await exist(blobs[0].key)).toBeTruthy();
    expect(await Blob.isExists(blobs[1].id)).toBeTruthy();
    expect(await exist(blobs[1].key)).toBeTruthy();
  });

  it("detaching when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.highlights.detach());

    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blobs[0].id)).toBeTruthy();
    expect(await exist(blobs[0].key)).toBeTruthy();
    expect(await Blob.isExists(blobs[1].id)).toBeTruthy();
    expect(await exist(blobs[1].key)).toBeTruthy();
  });

  it("purging", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    await user.updateColumn("updated_at", "2000-01-01 00:00:00");
    await assertChanges(
      () => user.readAttribute("updated_at"),
      null,
      {},
      () => user.highlights.purge(),
    );
    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blobs[0].id)).toBeFalsy();
    expect(await exist(blobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(blobs[1].id)).toBeFalsy();
    expect(await exist(blobs[1].key)).toBeFalsy();
  });

  it("purging attachment with shared blobs", async () => {
    const blobs = await threeBlobs();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.highlights.attach([blobs[1], blobs[2]]);
    expect(await anotherUser.highlights.isAttached()).toBeTruthy();

    await user.highlights.purge();
    expect(await user.highlights.isAttached()).toBeFalsy();

    expect(await Blob.isExists(blobs[0].id)).toBeFalsy();
    expect(await exist(blobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(blobs[1].id)).toBeTruthy();
    expect(await exist(blobs[1].key)).toBeTruthy();
    expect(await Blob.isExists(blobs[2].id)).toBeTruthy();
    expect(await exist(blobs[2].key)).toBeTruthy();
  });

  it("purging when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    const attachments = await user.highlights.attachments;
    await user.highlights.purge();

    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(attachments.every((attachment) => attachment.isDestroyed())).toBeTruthy();
    for (const blob of blobs) {
      expect(await Blob.isExists(blob.id)).toBeFalsy();
      expect(await Blob.service!.isExist(blob.key)).toBeFalsy();
    }
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
    expect(await user.highlights.isAttached()).toBeTruthy();

    await user.updateColumn("updated_at", "2000-01-01 00:00:00");
    await performEnqueuedJobs(() =>
      assertChanges(
        () => user.readAttribute("updated_at"),
        null,
        {},
        () => user.highlights.purgeLater(),
      ),
    );

    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blobs[0].id)).toBeFalsy();
    expect(await exist(blobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(blobs[1].id)).toBeFalsy();
    expect(await exist(blobs[1].key)).toBeFalsy();
  });

  it("purging attachment later with shared blobs", async () => {
    const blobs = await threeBlobs();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    const anotherUser = await User.createBang({ name: "John" });
    await anotherUser.highlights.attach([blobs[1], blobs[2]]);
    expect(await anotherUser.highlights.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.highlights.purgeLater());

    expect(await user.highlights.isAttached()).toBeFalsy();
    expect(await Blob.isExists(blobs[0].id)).toBeFalsy();
    expect(await exist(blobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(blobs[1].id)).toBeTruthy();
    expect(await exist(blobs[1].key)).toBeTruthy();
    expect(await Blob.isExists(blobs[2].id)).toBeTruthy();
    expect(await exist(blobs[2].key)).toBeTruthy();
  });

  it("purging attachment later when record is not persisted", async () => {
    const blobs = await funkyAndTown();
    user = new User();
    await user.highlights.attach(blobs);
    expect(await user.highlights.isAttached()).toBeTruthy();

    await performEnqueuedJobs(() => user.highlights.purgeLater());

    expect(await user.highlights.isAttached()).toBeFalsy();
    for (const blob of blobs) {
      expect(await Blob.isExists(blob.id)).toBeFalsy();
      expect(await Blob.service!.isExist(blob.key)).toBeFalsy();
    }
  });

  it("purging dependent attachment later on destroy", async () => {
    const blobs = await funkyAndTown();
    await user.highlights.attach(blobs);

    await performEnqueuedJobs(() => user.destroyBang());

    expect(await Blob.isExists(blobs[0].id)).toBeFalsy();
    expect(await exist(blobs[0].key)).toBeFalsy();
    expect(await Blob.isExists(blobs[1].id)).toBeFalsy();
    expect(await exist(blobs[1].key)).toBeFalsy();
  });

  it("not purging independent attachment on destroy", async () => {
    await user.vlogs.attach(await funkyAndTownVideos());

    await assertNoEnqueuedJobs(() => user.destroyBang());
  });

  it("duped record does not share attachments", async () => {
    await user.highlights.attach([await createBlob({ filename: "funky.jpg" })]);

    const duped = await attachmentAt(user.dup().highlights, 0);
    expect(duped).not.toBe(await attachmentAt(user.highlights, 0));
  });

  it("duped record does not share attachment changes", async () => {
    await user.highlights.attach([await createBlob({ filename: "funky.jpg" })]);
    expect(user.changedForAutosave()).toBeFalsy();

    await user.dup().highlights.attach([await createBlob({ filename: "town.mp4" })]);
    expect(user.changedForAutosave()).toBeFalsy();
  });

  it("clearing change on reload", async () => {
    await user.setHighlights(await funkyAndTown());
    expect(await user.highlights.isAttached()).toBeTruthy();

    await user.reload();
    expect(await user.highlights.isAttached()).toBeFalsy();
  });

  it("overriding attached reader", async () => {
    await user.highlights.attach(...(await funkyAndTown()));

    expect(await filename(user.highlights, 0)).toBe("funky.jpg");
    expect(await filename(user.highlights, 1)).toBe("town.jpg");

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

  it("attaching a new blob from a Hash with a custom service", async () => {
    await withService("mirror", async () => {
      const attachable = () => ({
        io: new StringIO("STUFF"),
        filename: "town.jpg",
        contentType: "image/jpeg",
      });
      await user.highlights.attach(attachable());
      await user.vlogs.attach(attachable());

      expect((await (user.highlights as unknown as FirstBlob).first()).service).toBeInstanceOf(
        MirrorService,
      );
      expect((await (user.vlogs as unknown as FirstBlob).first()).service).toBeInstanceOf(
        DiskService,
      );
    });
  });

  it("attaching a new blob from an uploaded file with a custom service", async () => {
    await withService("mirror", async () => {
      await user.highlights.attach(fixtureFileUpload("racecar.jpg"));
      await user.vlogs.attach(fixtureFileUpload("racecar.jpg"));

      expect((await (user.highlights as unknown as FirstBlob).first()).service).toBeInstanceOf(
        MirrorService,
      );
      expect((await (user.vlogs as unknown as FirstBlob).first()).service).toBeInstanceOf(
        DiskService,
      );
    });
  });

  it("attaching a new blob from an uploaded file with a service defined at runtime", async () => {
    class ExtraAttached extends User {
      static override get tableName() {
        return "users";
      }
      static {
        (this as unknown as Attachable).hasManyAttached("signatures", {
          service: (user) => `disk_${(user as unknown as ExtraAttached).mirrorRegion()}`,
        });
      }
      mirrorRegion() {
        return "mirror_2";
      }
    }
    const extra = user.becomes(ExtraAttached) as unknown as { signatures: Many };

    await extra.signatures.attach(fixtureFileUpload("cropped.pdf"));
    const first = await (extra.signatures as unknown as FirstBlob).first();
    expect(first.service.name).toBe("disk_mirror_2");
  });

  it("attaching blobs to a persisted, unchanged, and valid record, returns the attachments", async () => {
    await user.highlights.attach(await createBlob({ filename: "racecar.jpg" }));
    const returnValue = await user.highlights.attach(...(await funkyAndTown()));
    expect(returnValue).toBe(user.highlights);
  });

  it("attaching blobs to a persisted, unchanged, and invalid record, returns nil", async () => {
    await user.updateAttribute("name", null);
    expect(await user.isValid()).toBeFalsy();

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
      const error = await assertRaises([RuntimeError], {}, () => {
        (User as unknown as Attachable).hasManyAttached("featuredPhotos");
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
      (User as unknown as Attachable).hasManyAttached("featuredPhotos", { service: "unknown" }),
    );

    expect(error.message).toMatch(/Cannot configure service "unknown" for .*User#featuredPhotos/);
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
  it("creating preview by variation name", async () => {
    await user.highlightsWithVariants.attach(fixtureFileUpload("report.pdf"));
    const preview = await (
      (await attachmentAt(user.highlightsWithVariants, 0)).preview("thumb") as Preview
    ).processed();

    const image = await readImage(preview["variant"]());
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(77);
    expect(await image.height()).toBe(100);
  });

  it("raises error when unknown variant name is used to generate preview", async () => {
    await user.highlightsWithVariants.attach(fixtureFileUpload("report.pdf"));

    const error = await assertRaises([ArgumentError], {}, async () => {
      await (
        (await attachmentAt(user.highlightsWithVariants, 0)).preview("unknown") as Preview
      ).processed();
    });

    expect(error.message).toMatch(/Cannot find variant :unknown for User#highlightsWithVariants/);
  });
  // BLOCKED: activestorage-variation-and-variants
  it.skip("creating representation by variation name", () => {});
  it.skip("raises error when unknown variant name is used to generate representation", () => {});
  it.skip("transforms variants later", () => {});
  it.skip("transforms variants later conditionally via proc", () => {});
  it.skip("transforms variants later conditionally via method", () => {});

  it("avoids enqueuing transform later and create preview job job when blob is not representable", async () => {
    const unrepresentableBlob = await createBlob({ filename: "hello.txt" });

    await t.assertNoEnqueuedJobs({ only: [TransformJob, PreviewImageJob] }, () =>
      user.highlightsWithPreprocessed.attach(unrepresentableBlob),
    );
  });

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

    expect(await (await user.reload()).highlights.isAttached()).toBeTruthy();
    expect(await count(user.highlights)).toBe(1);
    expect((await user.highlights.blobs)[0].filename.toString()).toBe("racecar.jpg");
  });
});
