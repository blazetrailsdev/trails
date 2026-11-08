import { describe, expect, it } from "vitest";
import { fixtures } from "../../activerecord/src/test-helpers/use-fixtures.js";
import { isPresent } from "@blazetrails/activesupport";
import { FileUtils } from "@blazetrails/ruby-compat";
import "./support/database/setup.js";
import { Attachment } from "../lib/attachment.js";
import { Blob } from "../lib/blob.js";
import { attachments } from "./fixtures/active_storage/attachments.js";
import { blobs } from "./fixtures/active_storage/blobs.js";
import { users as usersData } from "./fixtures/users.js";
import { FixtureSet } from "../lib/fixture-set.js";
import { User } from "./support/test-helper.js";

const blobRows = await blobs();

describe("ActiveStorage::FixtureSetTest", () => {
  const { users } = fixtures({
    users: [User, usersData],
    active_storage_blobs: [Blob, blobRows],
    active_storage_attachments: [Attachment, attachments],
  }) as never as { users: (name: string) => Promise<User> };

  it("active storage blob", async () => {
    const user = await users("first");

    const avatar = user.avatar;
    await avatar.load();
    const blob = (await (await avatar.attachment)!.blob)!;

    expect(blob.content_type).toBe("image/jpeg+override");
    expect(blob.filename.toString()).toBe("racecar.jpg");
    expect(blob.service.name).toBe("local");
    await blob.open({}, async (file) => {
      const fixture = new FixtureSet().fileFixture("racecar.jpg");
      expect(await FileUtils.isIdenticalAsync(file.path()!, fixture.toPath())).toBeTruthy();
    });
  }, 30_000);

  it("active storage attachment", async () => {
    const user = await users("first");

    const avatar = user.avatar;
    await avatar.load();

    expect(avatar.isBlank()).toBeFalsy();
    expect(avatar.isAttached()).toBeTruthy();
    expect(isPresent(await avatar.attachment)).toBeTruthy();
  });

  it("active storage metadata", async () => {
    const user = await users("first");

    const avatar = user.avatar;
    await avatar.load();
    const blob = (await (await avatar.attachment)!.blob)!;
    await blob.analyze();

    expect(blob.metadata.get("identified")).toBeTruthy();
    expect(blob.metadata.get("analyzed")).toBeTruthy();
  }, 30_000);
});
