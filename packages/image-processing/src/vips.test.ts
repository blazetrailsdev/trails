import { File, Pathname, Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import {
  assertDimensions,
  assertSimilar,
  assertType,
  copyToTempfile,
  fixtureImage,
  refuteSimilar,
} from "./test-helpers/test-helper.js";
import { Vips as ImageProcessingVips, vips } from "./vips.js";

type PathLike = { path(): string; size(): number };
type VipsImage = InstanceType<typeof vips.Image>;
type Pipeline = { [name: string]: (...args: unknown[]) => Promise<PathLike> & Pipeline };

const Vips = ImageProcessingVips as unknown as Pipeline & {
  isValidImage(file: unknown): boolean;
  Processor: { SHARPEN_MASK: VipsImage };
};
const SHARPEN_MASK = Vips.Processor.SHARPEN_MASK;
const BLOB_TYPE = vips.Utils.typeFromName("VipsBlob");

function fields(image: VipsImage): string[] {
  const vector = image.getFields();
  return Array.from({ length: vector.size() }, (_, i) => vector.get(i)!);
}

describe("ImageProcessing::Vips", () => {
  let portrait: ReturnType<typeof fixtureImage>;
  let landscape: ReturnType<typeof fixtureImage>;
  let square: ReturnType<typeof fixtureImage>;
  let exifPortrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
    landscape = fixtureImage("landscape.jpg");
    square = fixtureImage("square.jpg");
    exifPortrait = fixtureImage("exif_portrait.jpg");
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

  it("allows changing metadata", async () => {
    const image = (await Vips.copy()
      .set("icc-profile-data", "foobar")
      .setType(BLOB_TYPE, "foo", "bar")
      .remove("exif-data")
      .call(portrait, { save: false })) as unknown as VipsImage;

    expect(image.getBlob("icc-profile-data")).toEqual(new TextEncoder().encode("foobar"));
    expect(image.getBlob("foo")).toEqual(new TextEncoder().encode("bar"));

    expect(() => image.getBlob("exif-data")).toThrow();
  });

  it("applies format", async () => {
    const result = await Vips.convert("png").call(portrait);
    expect(File.extname(result.path())).toEqual(".png");
    await assertType("PNG", result);
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

  it("applies loader options", async () => {
    const result = await Vips.loader({ shrink: 2 }).call(portrait);
    await assertDimensions([300, 400], result);
  });

  it("ignores loader options that are not defined", async () => {
    const png = await Vips.convert("png").call(portrait);
    await Vips.loader({ shrink: 2 }).call(png);
  });

  it("raises correct Vips::Error on unknown loader", async () => {
    await expect(Vips.convert("jpg").call(Tempfile.new(""))).rejects.toThrow(
      /not a known file format/,
    );
  });

  it("accepts :loader", async () => {
    await expect(Vips.loader({ loader: "tiff" }).call(portrait)).rejects.toThrow(/Not a TIFF/);
  });

  it("applies saver options", async () => {
    const result = await Vips.saver({ strip: true }).call(portrait);
    expect(fields(vips.Image.newFromFile(result.path()))).not.toContain("exif-data");
  });

  it("converts :quality saver option to :Q", async () => {
    const result1 = await Vips.saver({ quality: 50 }).call(portrait);
    const result2 = await Vips.saver({ quality: 100 }).call(portrait);
    expect(result1.size() < result2.size()).toBe(true);
  });

  it("ignores saver options that are not defined", async () => {
    await Vips.saver({ Q: 85 }).convert("png").call(portrait);
  });

  it("raises correct Vips::Error on unknown saver", async () => {
    await expect(Vips.convert("foo").call(portrait)).rejects.toThrow(
      /is not a known file format|No known saver for/,
    );
  });

  it("accepts :saver", async () => {
    const result = await Vips.saver({ saver: "png" }).call(portrait);
    expect(File.extname(result.path())).toEqual(".jpg");
    await assertType("PNG", result);
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

    it("doesn't require both dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(300, null));
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(800, null));

      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(null, 400));
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(null, 1000));
    });

    it("raises exception when neither dimension is specified", async () => {
      await expect(pipeline.resizeToLimitBang(null, null)).rejects.toThrow(ImageProcessingError);
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("limit.jpg");
      await assertSimilar(expected, await pipeline.resizeToLimitBang(400, 400));
    });

    it("accepts thumbnail options", async () => {
      await assertDimensions(
        [400, 400],
        await pipeline.resizeToLimitBang(400, 400, { crop: "centre" }),
      );
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToLimitBang(400, 400, { sharpen: SHARPEN_MASK });
      const normal = await pipeline.resizeToLimitBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });

    it("sharpening uses integer precision", async () => {
      const sharpened = (await pipeline
        .resizeToLimit(400, 400)
        .call(null, { save: false })) as unknown as VipsImage;
      expect(sharpened.format).toEqual("uchar");
    });
  });

  describe("#resize_to_fit", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("shrinks image to fit specified dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToFitBang(400, 400));
    });

    it("enlarges image if it's smaller than given dimensions", async () => {
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(1000, 1000));
    });

    it("doesn't require both dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToFitBang(300, null));
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(750, null));

      await assertDimensions([300, 400], await pipeline.resizeToFitBang(null, 400));
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(null, 1000));
    });

    it("raises exception when neither dimension is specified", async () => {
      await expect(pipeline.resizeToLimitBang(null, null)).rejects.toThrow(ImageProcessingError);
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("fit.jpg");
      await assertSimilar(expected, await pipeline.resizeToFitBang(400, 400));
    });

    it("accepts thumbnail options", async () => {
      await assertDimensions(
        [400, 400],
        await pipeline.resizeToFitBang(400, 400, { crop: "centre" }),
      );
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToFitBang(400, 400, { sharpen: SHARPEN_MASK });
      const normal = await pipeline.resizeToFitBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });

    it("sharpening uses integer precision", async () => {
      const sharpened = (await pipeline
        .resizeToLimit(400, 400)
        .call(null, { save: false })) as unknown as VipsImage;
      expect(sharpened.format).toEqual("uchar");
    });
  });

  describe("#resize_to_fill", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("resizes and crops the image to fill out the given dimensions", async () => {
      await assertDimensions([400, 400], await pipeline.resizeToFillBang(400, 400));
    });

    it("enlarges image and crops it if it's smaller than given dimensions", async () => {
      await assertDimensions([1000, 1000], await pipeline.resizeToFillBang(1000, 1000));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("fill.jpg");
      await assertSimilar(expected, await pipeline.resizeToFillBang(400, 400));
    });

    it("accepts thumbnail options", async () => {
      const attention = await pipeline.resizeToFillBang(400, 400, { crop: "attention" });
      const centre = await pipeline.resizeToFillBang(400, 400, { crop: "centre" });
      await refuteSimilar(centre, attention);
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToFillBang(400, 400, { sharpen: SHARPEN_MASK });
      const normal = await pipeline.resizeToFillBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });

    it("sharpening uses integer precision", async () => {
      const sharpened = (await pipeline
        .resizeToLimit(400, 400)
        .call(null, { save: false })) as unknown as VipsImage;
      expect(sharpened.format).toEqual("uchar");
    });
  });

  describe("#resize_and_pad", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("resizes and fills out the remaining space to fill out the given dimensions", async () => {
      await assertDimensions([400, 400], await pipeline.resizeAndPadBang(400, 400));
    });

    it("enlarges image and fills out the remaining space to fill out the given dimensions", async () => {
      await assertDimensions([1000, 1000], await pipeline.resizeAndPadBang(1000, 1000));
    });

    it("produces correct image when shrinking", async () => {
      let result = await pipeline.convert("png").resizeAndPadBang(400, 400, { alpha: true });
      await assertSimilar(fixtureImage("pad.png"), result);
      expect(vips.Image.newFromFile(result.path()).bands).toEqual(4);

      const transparentPng = await pipeline.bandjoin(255).convertBang("png");
      result = await pipeline.source(transparentPng).resizeAndPadBang(400, 400, { alpha: true });
      await assertSimilar(fixtureImage("pad.png"), result);
      expect(vips.Image.newFromFile(result.path()).bands).toEqual(4);
    });

    it("produces correct image when enlarging", async () => {
      pipeline = Vips.source(landscape);
      const expected = fixtureImage("pad-large.jpg");
      await assertSimilar(
        expected,
        await pipeline.resizeAndPadBang(1000, 1000, { background: [55, 126, 34] }),
      );
    });

    it("accepts gravity", async () => {
      const centre = await pipeline.resizeAndPadBang(400, 400);
      const northwest = await pipeline.resizeAndPadBang(400, 400, { gravity: "north-west" });
      await refuteSimilar(centre, northwest);
    });

    it("accepts thumbnail options", async () => {
      const pad = await pipeline.resizeAndPadBang(400, 400);
      const crop = await pipeline.resizeAndPadBang(400, 400, { crop: "entropy" });
      await refuteSimilar(pad, crop);
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeAndPadBang(400, 400, { sharpen: SHARPEN_MASK });
      const normal = await pipeline.resizeAndPadBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });

    it("sharpening uses integer precision", async () => {
      const sharpened = (await pipeline
        .resizeToLimit(400, 400)
        .call(null, { save: false })) as unknown as VipsImage;
      expect(sharpened.format).toEqual("uchar");
    });
  });

  describe("#resize_to_cover", () => {
    let portraitPipeline: Pipeline;
    let landscapePipeline: Pipeline;
    let squarePipeline: Pipeline;
    let exifPortraitPipeline: Pipeline;

    beforeEach(() => {
      portraitPipeline = Vips.source(portrait);
      landscapePipeline = Vips.source(landscape);
      squarePipeline = Vips.source(square);
      exifPortraitPipeline = Vips.source(exifPortrait);
    });

    it("resizes the portrait image to fill out the given landscape dimensions", async () => {
      await assertDimensions([300, 400], await portraitPipeline.resizeToCoverBang(300, 200));
    });

    it("resizes the portrait image to fill out the given portrait dimensions", async () => {
      await assertDimensions([225, 300], await portraitPipeline.resizeToCoverBang(200, 300));
    });

    it("resizes the portrait image to fill out the given square dimensions", async () => {
      await assertDimensions([300, 400], await portraitPipeline.resizeToCoverBang(300, 300));
    });

    it("resizes the landscape image to fill out the given portrait dimensions", async () => {
      await assertDimensions([400, 300], await landscapePipeline.resizeToCoverBang(200, 300));
    });

    it("resizes the landscape image to fill out the given landscape dimensions", async () => {
      await assertDimensions([300, 225], await landscapePipeline.resizeToCoverBang(300, 200));
    });

    it("resizes the landscape image to fill out the given square dimensions", async () => {
      await assertDimensions([400, 300], await landscapePipeline.resizeToCoverBang(300, 300));
    });

    it("resizes the square image to fill out the given portrait dimensions", async () => {
      await assertDimensions([300, 300], await squarePipeline.resizeToCoverBang(200, 300));
    });

    it("resizes the square image to fill out the given landscape dimensions", async () => {
      await assertDimensions([300, 300], await squarePipeline.resizeToCoverBang(300, 200));
    });

    it("resizes the square image to fill out the given square dimensions", async () => {
      await assertDimensions([300, 300], await squarePipeline.resizeToCoverBang(300, 300));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("cover.jpg");
      await assertSimilar(expected, await portraitPipeline.resizeToCoverBang(300, 200));
    });

    it("accepts thumbnail options except :crop", async () => {
      const attention = await portraitPipeline.resizeToCoverBang(400, 400, { crop: "attention" });
      const centre = await portraitPipeline.resizeToCoverBang(400, 400, { crop: "centre" });
      await assertSimilar(centre, attention);
    });

    it("accepts sharpening options", async () => {
      const sharpened = await portraitPipeline.resizeToCoverBang(400, 400, {
        sharpen: SHARPEN_MASK,
      });
      const normal = await portraitPipeline.resizeToCoverBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });

    it("sharpening uses integer precision", async () => {
      const sharpened = (await portraitPipeline
        .resizeToCover(400, 400)
        .call(null, { save: false })) as unknown as VipsImage;
      expect(sharpened.format).toEqual("uchar");
    });

    it("works correctly with EXIF orientation", async () => {
      await assertDimensions([300, 617], await exifPortraitPipeline.resizeToCoverBang(300, 200));
    });
  });

  describe("#rotate", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("rotates by multiples of 90", async () => {
      await assertDimensions([600, 800], await pipeline.rotateBang(0));
      await assertDimensions([800, 600], await pipeline.rotateBang(90));
      await assertDimensions([600, 800], await pipeline.rotateBang(180));
      await assertDimensions([800, 600], await pipeline.rotateBang(270));
    });

    it("works for angles outside of 0-360 degrees", async () => {
      await assertDimensions([600, 800], await pipeline.rotateBang(360));
      await assertDimensions([800, 600], await pipeline.rotateBang(450));
      await assertDimensions([800, 600], await pipeline.rotateBang(-90));
    });

    it("rotates by arbitrary angle", async () => {
      await assertDimensions([990, 990], await pipeline.rotateBang(45));
    });

    it("accepts background color", async () => {
      await assertDimensions([990, 990], await pipeline.rotateBang(45, { background: [0, 0, 0] }));
    });
  });

  describe("#composite", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = Vips.source(portrait);
    });

    it("accepts String, Pathname, and File object", async () => {
      await assertSimilar(fixtureImage("composited.jpg"), await pipeline.compositeBang(landscape));
      await assertSimilar(
        fixtureImage("composited.jpg"),
        await pipeline.compositeBang(landscape.path()),
      );
      await assertSimilar(
        fixtureImage("composited.jpg"),
        await pipeline.compositeBang(new Pathname(landscape.path()!)),
      );
    });

    it("accepts Vips::Image object", async () => {
      const overlay = vips.Image.newFromFile(landscape.path()!);
      await assertSimilar(fixtureImage("composited.jpg"), await pipeline.compositeBang(overlay));
    });

    it("accepts :mode", async () => {
      await refuteSimilar(
        fixtureImage("composited.jpg"),
        await pipeline.compositeBang(landscape, { mode: "clear" }),
      );
    });

    it("accepts :gravity", async () => {
      const result = await pipeline.compositeBang(landscape, { gravity: "centre" });
      await refuteSimilar(fixtureImage("composited.jpg"), result);
      await assertDimensions([600, 800], result);

      await expect(pipeline.compositeBang(landscape, { gravity: "foo" })).rejects.toThrow();
    });

    it("accepts :offset", async () => {
      const result = await pipeline.compositeBang(landscape, { offset: [50, -50] });
      await refuteSimilar(fixtureImage("composited.jpg"), result);
      await assertDimensions([600, 800], result);
    });

    it("accepts additional options", async () => {
      await pipeline.compositeBang(landscape, { compositing_space: "grey16" });

      await expect(
        pipeline.compositeBang(landscape, { compositing_space: "foo" }),
      ).rejects.toThrow();
    });

    it("accepts Vips::Image#composite parameters", async () => {
      const overlay = vips.Image.newFromFile(landscape.path()!);
      const original = await pipeline.customBang((image: VipsImage) =>
        image.composite([overlay], vips.BlendMode.over),
      );

      await assertSimilar(original, await pipeline.compositeBang(overlay, "over"));
      await assertSimilar(original, await pipeline.compositeBang(landscape, "over"));
      await assertSimilar(original, await pipeline.compositeBang(landscape.path(), "over"));
      await assertSimilar(
        original,
        await pipeline.compositeBang(new Pathname(landscape.path()!), "over"),
      );

      await assertSimilar(original, await pipeline.compositeBang([overlay], "over"));
      await assertSimilar(original, await pipeline.compositeBang([landscape], "over"));
      await assertSimilar(original, await pipeline.compositeBang([landscape.path()], "over"));
      await assertSimilar(
        original,
        await pipeline.compositeBang([new Pathname(landscape.path()!)], "over"),
      );
    });
  });

  describe("resize-on-load", () => {
    it("retains order of operations", async () => {
      let result = await Vips.source(portrait).resizeToFit(400, 400).crop(0, 0, 300, 300).call();

      await assertDimensions([300, 300], result);

      result = await Vips.source(portrait).crop(0, 0, 300, 300).resizeToFit(400, 400).call();

      await assertDimensions([400, 400], result);
    });

    it("is skipped on loader options", async () => {
      const pipeline = Vips.source(fixtureImage("invalid.jpg"))
        .loader({ fail: true })
        .resizeToFit(400, 400);

      await expect(pipeline.call()).rejects.toThrow(/Corrupt JPEG data/);
    });
  });
});
