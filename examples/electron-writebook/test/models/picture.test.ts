import { beforeEach, describe, expect, it } from "vitest";
import { VariantWithRecord } from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import { fixture, loadFixtures, PIXEL_BMP } from "../test-helper.ts";
import { Picture } from "../../app/models/picture.ts";

describe("PictureTest", () => {
  const pictures = (label: string) => fixture<Picture>("pictures", label);

  beforeEach(loadFixtures);

  it("markable returns caption", async () => {
    const picture = new Picture({ caption: "A great picture" });

    expect(await picture.markable()).toBe("A great picture");
  });

  it("markable returns nil when caption is nil", async () => {
    const picture = new Picture({ caption: null });

    expect(await picture.markable()).toBeNull();
  });

  it("large_image is the resized variant of a variable image", async () => {
    const picture = await pictures("reading");
    await picture.image.load();
    await (await picture.image.attachment)!.blob;

    expect(picture.largeImage()).toBeInstanceOf(VariantWithRecord);
  });

  it("large_image is the original image when the image cannot be resized", async () => {
    const picture = await pictures("reading");
    await picture.image.attach({
      io: new StringIO(PIXEL_BMP),
      filename: "pixel.bmp",
      content_type: "image/bmp",
    });

    expect(picture.largeImage()).toBe(picture.image);
  });
});
