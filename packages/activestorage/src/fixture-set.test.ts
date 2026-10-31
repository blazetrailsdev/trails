import { describe, expect, it } from "vitest";
import { fixtures } from "../../activerecord/src/test-helpers/use-fixtures.js";
import { IO } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { Attachment } from "./attachment.js";
import { Blob } from "./blob.js";
import { attachments } from "./test-helpers/fixtures/active_storage/attachments.js";
import { blobs } from "./test-helpers/fixtures/active_storage/blobs.js";
import { users as usersData } from "./test-helpers/fixtures/users.js";
import { FixtureSet } from "./fixture-set.js";
import { User } from "./test-helpers/test-helper.js";

const blobRows = await blobs();

describe("ActiveStorage::FixtureSetTest", () => {
  const { users } = fixtures({
    users: [User, usersData],
    active_storage_blobs: [Blob, blobRows],
    active_storage_attachments: [Attachment, attachments],
  }) as never as { users: (name: string) => Promise<User> };

  // BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
  it("test_active_storage_blob", async () => {
    const user = await users("first");

    const avatar = (await Attachment.findBy({ name: "avatar", record_id: user.id })) as Attachment;
    const blob = (await avatar.blob)!;

    expect(blob.content_type).toBe("image/jpeg+override");
    expect(blob.filename.toString()).toBe("racecar.jpg");
    expect(blob.service.name).toBe("local");
    await blob.open({}, async (file) => {
      const fixture = new FixtureSet().fileFixture("racecar.jpg");
      expect(await IO.binreadAsync(file.path()!)).toEqual(await IO.binreadAsync(fixture.toPath()));
    });
  }, 30_000);

  it.skip("test_active_storage_attachment", () => {
    // BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
  });

  it.skip("test_active_storage_metadata", () => {
    // BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
  });
});
