import { beforeEach, describe, expect, it } from "vitest";
import {
  ApplicationIntegrationTest,
  fixture,
  fixtureFileUpload,
  leafablePath,
  loadFixtures,
} from "../test-helper.ts";
import { Picture } from "../../app/models/picture.ts";
import type { Leaf } from "../../app/models/leaf.ts";

describe("PicturesControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const filenameOf = async (picture: Picture) => {
    await picture.image.load();
    return String((await (await picture.image.attachment)!.blob)!.filename);
  };

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  it("update picture", async () => {
    const leaf = await fixture<Leaf>("leaves", "reading_picture");
    await t.get(`${leafablePath(leaf)}/edit`);
    t.assertResponse(":ok");

    await t.put(leafablePath(leaf), {
      params: {
        leaf: { title: "New picture" },
        picture: { image: await fixtureFileUpload("white-rabbit.webp", "image/webp") },
      },
    });

    t.assertResponse(":no_content");

    const updatedPicture = (await Picture.last()) as Picture;
    expect(await updatedPicture.title()).toBe("New picture");
    expect(await filenameOf(updatedPicture)).toBe("white-rabbit.webp");
  });

  it("update caption", async () => {
    const leaf = await fixture<Leaf>("leaves", "reading_picture");
    await t.get(`${leafablePath(leaf)}/edit`);
    t.assertResponse(":ok");

    await t.put(leafablePath(leaf), { params: { picture: { caption: "New caption" } } });

    t.assertResponse(":no_content");

    const updatedPicture = (await Picture.last()) as Picture;

    expect(updatedPicture.caption).toBe("New caption");
    expect(await filenameOf(updatedPicture)).toBe("reading.webp");
  });
});
