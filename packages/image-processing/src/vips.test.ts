import { Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import {
  assertDimensions,
  assertSimilar,
  copyToTempfile,
  fixtureImage,
} from "./test-helpers/test-helper.js";
import { Vips as ImageProcessingVips, vips } from "./vips.js";

type PathLike = { path(): string };
type Pipeline = { [name: string]: (...args: unknown[]) => Promise<PathLike> & Pipeline };

const Vips = ImageProcessingVips as unknown as Pipeline & {
  isValidImage(file: unknown): boolean;
};

describe("ImageProcessing::Vips", () => {
  let portrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
  });

  it("applies vips operations", async () => {
    const actual = await Vips.invert().call(portrait);
    const expected = Tempfile.new(["result", ".jpg"], null, { binmode: true });
    let image = vips.Image.newFromFile(portrait.path()!);
    image = image.invert();
    image.writeToFile(expected.path()!);

    await assertSimilar(expected, actual);
  });

  it("applies macro operations", async () => {
    const actual = await Vips.resizeToLimit(400, 400).call(portrait);
    const expected = Tempfile.new(["result", ".jpg"], null, { binmode: true });
    let image = vips.Image.newFromFile(portrait.path()!);
    image = image.thumbnailImage(400, { height: 400, size: "down" });
    image.writeToFile(expected.path()!);

    await assertSimilar(expected, actual);
  });

  it("auto rotates by default", async () => {
    let result = await Vips.call(fixtureImage("rotated.jpg"));
    await assertDimensions([600, 800], result);

    result = await Vips.resizeToLimit(1000, 1000).call(fixtureImage("rotated.jpg"));
    await assertDimensions([600, 800], result);

    result = await Vips.loader({ fail: true })
      .resizeToLimit(1000, 1000)
      .call(fixtureImage("rotated.jpg"));
    await assertDimensions([600, 800], result);

    result = await Vips.call(vips.Image.newFromFile(fixtureImage("rotated.jpg").path()!));
    await assertDimensions([600, 800], result);

    result = await Vips.loader({ autorot: false }).call(fixtureImage("rotated.jpg"));
    await assertDimensions([800, 600], result);

    result = await Vips.loader({ autorotate: false }).call(fixtureImage("rotated.jpg"));
    await assertDimensions([800, 600], result);
  });

  it("accepts Vips::Image as source", async () => {
    const vipsImage = vips.Image.newFromFile(fixtureImage("rotated.jpg").path()!);
    const result = await Vips.source(vipsImage).call();
    await assertDimensions([600, 800], result);
  });

  describe(".valid_image?", () => {
    it("returns true for correct images", () => {
      expect(Vips.isValidImage(portrait)).toBe(true);
      expect(Vips.isValidImage(copyToTempfile(portrait))).toBe(true);
    });

    it("returns false for incorrect images", () => {
      expect(Vips.isValidImage(fixtureImage("invalid.jpg"))).toBe(false);
      expect(Vips.isValidImage(copyToTempfile(fixtureImage("invalid.jpg")))).toBe(false);
    });
  });

  describe("#resize_to_limit", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("srinks image to fit the specified dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(400, 400));
    });

    it("doesn't enlarge image if it's smaller than specified dimensions", async () => {
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(1000, 1000));
    });

    it("raises exception when neither dimension is specified", async () => {
      await expect(pipeline.resizeToLimitBang(null, null)).rejects.toThrow(ImageProcessingError);
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("limit.jpg");
      await assertSimilar(expected, await pipeline.resizeToLimitBang(400, 400));
    });
  });
});
