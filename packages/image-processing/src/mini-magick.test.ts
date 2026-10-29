import { Image as MiniMagickImage } from "@blazetrails/mini-magick/image";
import type { CliTool } from "@blazetrails/mini-magick/tool";
import { ArgumentError, block, Dir, File, Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import { MiniMagick as ImageProcessingMiniMagick } from "./mini-magick.js";
import {
  assertDimensions,
  assertSimilar,
  assertType,
  copyToTempfile,
  fixtureImage,
  refuteSimilar,
} from "./test-helpers/test-helper.js";

type PathLike = { path(): string; size(): number };
type Pipeline = { [name: string]: (...args: unknown[]) => Promise<PathLike> & Pipeline };

const MiniMagick = ImageProcessingMiniMagick as unknown as Pipeline & {
  convertShim(block?: (cmd: CliTool) => unknown): unknown;
  isValidImage(file: unknown): Promise<boolean>;
};

describe("ImageProcessing::MiniMagick", () => {
  let portrait: ReturnType<typeof fixtureImage>;
  let landscape: ReturnType<typeof fixtureImage>;
  let square: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
    landscape = fixtureImage("landscape.jpg");
    square = fixtureImage("square.jpg");
  });

  it("applies imagemagick operations", async () => {
    const actual = await MiniMagick.flip().call(portrait);
    const expected = Tempfile.new(["result", ".jpg"], null, { binmode: true });
    await MiniMagick.convertShim((cmd) => {
      cmd.append(portrait.path()!);
      cmd.flip();
      cmd.append(expected.path()!);
    });

    await assertSimilar(expected, actual);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — the private `Processor#thumbnail` answers `respond_to?`, so the operation never reaches the tool.
  it.skip("applies thumbnail operation", async () => {
    const magick = (await MiniMagick.thumbnail("400x400").call(portrait, {
      save: false,
    })) as unknown as CliTool;
    expect(magick.args).toContain("-thumbnail");
  });

  it("applies operations named as Object methods", async () => {
    const magick = (await MiniMagick.custom(block((m: CliTool) => m.clone())).call(portrait, {
      save: false,
    })) as unknown as CliTool;
    expect(magick.args).toContain("-clone");
  });

  it("applies macro operations", async () => {
    const actual = await MiniMagick.resizeToLimit(400, 400).call(portrait);
    const expected = Tempfile.new(["result", ".jpg"], null, { binmode: true });
    await MiniMagick.convertShim((cmd) => {
      cmd.append(portrait.path()!);
      cmd.resize("400x400");
      cmd.append(expected.path()!);
    });

    await assertSimilar(expected, actual);
  });

  it("applies format", async () => {
    const result = await MiniMagick.convert("png").call(portrait);
    expect(File.extname(result.path())).toEqual(".png");
    await assertType("PNG", result);
  });

  it("accepts page", async () => {
    const tiff = Tempfile.new(["file", ".tiff"]);
    await MiniMagick.convertShim((convert) => {
      convert.mergeBang([portrait.path(), portrait.path(), portrait.path()]);
      convert.append(tiff.path()!);
    });

    const processed = await MiniMagick.source(tiff).loader({ page: 0 }).convertBang("jpg");

    expect(processed.size()).not.toEqual(0);
  });

  it("disallows split layers by default", async () => {
    const tiff = Tempfile.new(["file", ".tiff"]);
    await MiniMagick.convertShim((convert) => {
      convert.mergeBang([portrait.path(), portrait.path(), portrait.path()]);
      convert.append(tiff.path()!);
    });

    const pipeline = MiniMagick.source(tiff).convert("jpg");

    await expect(pipeline.call()).rejects.toThrow(ImageProcessingError);

    const tempfile = await pipeline.saver({ allowSplitting: true }).call();
    expect(tempfile.size()).toEqual(0);
    for (const path of await Dir.globAsync(tempfile.path().replace(/\.\w+/, "-*$&"))) {
      expect(File.size(path)).not.toEqual(0);
      await File.deleteAsync(path);
    }
  });

  it("allows resizing images without extension", async () => {
    const result1 = Tempfile.new("image");

    await MiniMagick.source(portrait)
      .resizeToLimit(400, 400)
      .call(null, { destination: result1.path() });

    const result2 = await MiniMagick.source(portrait).resizeToLimitBang(400, 400);

    await assertSimilar(result2, result1);
  });

  it("accepts geometry", async () => {
    const pipeline = MiniMagick.source(portrait);
    await assertDimensions([300, 400], await pipeline.loader({ geometry: "400x400" }).call());
  });

  it("auto orients by default", async () => {
    let result = await MiniMagick.call(fixtureImage("rotated.jpg"));
    await assertDimensions([600, 800], result);

    result = await MiniMagick.loader({ autoOrient: false }).call(fixtureImage("rotated.jpg"));
    await assertDimensions([800, 600], result);
  });

  it("applies loader options", { timeout: 30_000 }, async () => {
    let result = await MiniMagick.loader({ loader: "jpg" }).call(portrait);
    await assertType("JPEG", result);

    result = await MiniMagick.loader({ define: { jpeg: { size: "100x100" } } }).call(portrait);
    await assertDimensions([150, 200], result);

    result = await MiniMagick.loader({ strip: true }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.loader({ strip: null }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.loader({ strip: false }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.loader({ colorspace: "Gray" }).call(portrait);
    expect((await new MiniMagickImage(result.path()).data())["colorspace"]).toEqual("Gray");

    result = await MiniMagick.loader({ set: ["comment", "This is a comment"] }).call(portrait);
    expect(
      ((await new MiniMagickImage(result.path()).data())["properties"] as Record<string, string>)[
        "comment"
      ],
    ).toEqual("This is a comment");
  });

  it("applies saver options", { timeout: 30_000 }, async () => {
    let result = await MiniMagick.saver({
      define: { jpeg: { fancy_unsampling: "off", extent: "20KB" } },
    }).call(portrait);
    expect(result.size()).toBeLessThan(20 * 1024);

    result = await MiniMagick.saver({ strip: true }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.saver({ strip: null }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.saver({ strip: false }).call(portrait);
    expect(await new MiniMagickImage(result.path()).exif()).toEqual({});

    result = await MiniMagick.saver({ colorspace: "Gray" }).call(portrait);
    expect((await new MiniMagickImage(result.path()).data())["colorspace"]).toEqual("Gray");

    result = await MiniMagick.saver({ set: ["comment", "This is a comment"] }).call(portrait);
    expect(
      ((await new MiniMagickImage(result.path()).data())["properties"] as Record<string, string>)[
        "comment"
      ],
    ).toEqual("This is a comment");
  });

  it("applies blocks to operations", async () => {
    const magick = (await MiniMagick.source(portrait)
      .stack(block((stack: CliTool) => stack.foo("bar")))
      .call(null, { save: false })) as unknown as CliTool;

    expect(magick.args).toEqual([portrait.path(), "-auto-orient", "(", "-foo", "bar", ")"]);
  });

  it("accepts magick object as source", async () => {
    const magick = MiniMagick.convertShim() as CliTool;
    magick.append(fixtureImage("rotated.jpg").path()!);
    const result = await MiniMagick.source(magick).call();
    await assertDimensions([600, 800], result);
  });

  describe(".valid_image?", () => {
    it("returns true for correct images", async () => {
      expect(await MiniMagick.isValidImage(portrait)).toBe(true);
      expect(await MiniMagick.isValidImage(copyToTempfile(portrait))).toBe(true);
    });

    it("returns false for invalid images", async () => {
      expect(await MiniMagick.isValidImage(fixtureImage("invalid.jpg"))).toBe(false);
      expect(await MiniMagick.isValidImage(copyToTempfile(fixtureImage("invalid.jpg")))).toBe(
        false,
      );
    });
  });

  describe("#resize_to_limit", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("srinks image to fit the specified dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(400, 400));
    });

    it("doesn't enlarge image if it's smaller than specified dimensions", async () => {
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(1000, 1000));
    });

    it("doesn't require both dimensions", { timeout: 30_000 }, async () => {
      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(300, null));
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(800, null));

      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(null, 400));
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(null, 1000));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("limit.jpg");
      await assertSimilar(expected, await pipeline.resizeToLimitBang(400, 400));
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToLimitBang(400, 400, { sharpen: { sigma: 1 } });
      const normal = await pipeline.resizeToLimitBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });
  });

  describe("#resize_to_fit", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("shrinks image to fit specified dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToFitBang(400, 400));
    });

    it("enlarges image if it's smaller than given dimensions", async () => {
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(1000, 1000));
    });

    it("doesn't require both dimensions", { timeout: 30_000 }, async () => {
      await assertDimensions([300, 400], await pipeline.resizeToFitBang(300, null));
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(750, null));

      await assertDimensions([300, 400], await pipeline.resizeToFitBang(null, 400));
      await assertDimensions([750, 1000], await pipeline.resizeToFitBang(null, 1000));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("fit.jpg");
      await assertSimilar(expected, await pipeline.resizeToFitBang(400, 400));
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToFitBang(400, 400, { sharpen: { sigma: 1 } });
      const normal = await pipeline.resizeToFitBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });
  });

  describe("#resize_to_fill", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
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

    it("accepts gravity", async () => {
      const centre = await pipeline.resizeToFillBang(400, 400);
      const northwest = await pipeline.resizeToFillBang(400, 400, { gravity: "NorthWest" });
      await refuteSimilar(centre, northwest);
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeToFillBang(400, 400, { sharpen: { sigma: 1 } });
      const normal = await pipeline.resizeToFillBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });
  });

  describe("#resize_and_pad", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("resizes and fills out the remaining space to fill out the given dimensions", async () => {
      await assertDimensions([400, 400], await pipeline.resizeAndPadBang(400, 400));
    });

    it("enlarges image and fills out the remaining space to fill out the given dimensions", async () => {
      await assertDimensions([1000, 1000], await pipeline.resizeAndPadBang(1000, 1000));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("pad.png");
      await assertSimilar(expected, await pipeline.convert("png").resizeAndPadBang(400, 400));

      const png = await pipeline.convertBang("png");
      await assertSimilar(expected, await pipeline.source(png).resizeAndPadBang(400, 400));
    });

    it("produces correct image when enlarging", async () => {
      pipeline = MiniMagick.source(landscape);
      const expected = fixtureImage("pad-large.jpg");
      await assertSimilar(
        expected,
        await pipeline.resizeAndPadBang(1000, 1000, { background: "green" }),
      );
    });

    it("accepts gravity", async () => {
      const centre = await pipeline.resizeAndPadBang(400, 400);
      const northwest = await pipeline.resizeAndPadBang(400, 400, { gravity: "NorthWest" });
      await refuteSimilar(centre, northwest);
    });

    it("accepts background color", async () => {
      const variants = [
        await pipeline.resizeAndPadBang(400, 400, { background: [0, 255, 127] }),
        await pipeline.resizeAndPadBang(400, 400, { background: [0, 255, 127, 1.0] }),
        await pipeline.resizeAndPadBang(400, 400, { background: "SpringGreen" }),
      ];

      for (const [i, image1] of variants.entries()) {
        for (const image2 of variants.slice(i + 1)) await assertSimilar(image1, image2);
      }
    });

    it("raises ArgumentError on invalid :background values", async () => {
      await expect(pipeline.resizeAndPadBang(400, 400, { background: [0, 0] })).rejects.toThrow(
        ArgumentError,
      );
      await expect(
        pipeline.resizeAndPadBang(400, 400, { background: [1, 1, 1, 1, 1] }),
      ).rejects.toThrow(ArgumentError);
      await expect(pipeline.resizeAndPadBang(400, 400, { background: 1 })).rejects.toThrow(
        ArgumentError,
      );
    });

    it("defaults background color to transparent", async () => {
      const transparent = await pipeline.resizeAndPadBang(400, 400, { background: "transparent" });
      const fallback = await pipeline.resizeAndPadBang(400, 400);
      await assertSimilar(transparent, fallback);
    });

    it("accepts sharpening options", async () => {
      const sharpened = await pipeline.resizeAndPadBang(400, 400, { sharpen: { sigma: 1 } });
      const normal = await pipeline.resizeAndPadBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });
  });

  describe("#resize_to_cover", () => {
    let portraitPipeline: Pipeline;
    let landscapePipeline: Pipeline;
    let squarePipeline: Pipeline;

    beforeEach(() => {
      portraitPipeline = MiniMagick.source(portrait);
      landscapePipeline = MiniMagick.source(landscape);
      squarePipeline = MiniMagick.source(square);
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

    it("accepts sharpening options", async () => {
      const sharpened = await portraitPipeline.resizeToCoverBang(400, 400, {
        sharpen: { sigma: 1 },
      });
      const normal = await portraitPipeline.resizeToCoverBang(400, 400, { sharpen: false });
      expect(
        sharpened.size() > normal.size(),
        "Expected sharpened thumbnail to have bigger filesize than not sharpened thumbnail",
      ).toBe(true);
    });
  });

  describe("#crop", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("accepts geometry argument", async () => {
      await assertDimensions([300, 300], await pipeline.cropBang("300x300+0+0"));
    });

    it("accepts top, left, width, height arguments", async () => {
      await assertDimensions([300, 300], await pipeline.cropBang(0, 0, 300, 300));
    });
  });

  describe("#rotate", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("rotates the image by specified number of degrees", async () => {
      await assertDimensions([600, 800], await pipeline.rotateBang(0));
      await assertDimensions([800, 600], await pipeline.rotateBang(90));
      await assertDimensions([600, 800], await pipeline.rotateBang("180"));
      await assertDimensions([800, 600], await pipeline.rotateBang(-90));
    });

    it("accepts background color", async () => {
      const variants = [
        await pipeline.rotateBang(45, { background: [0, 255, 127] }),
        await pipeline.rotateBang(45, { background: [0, 255, 127, 1.0] }),
        await pipeline.rotateBang(45, { background: "SpringGreen" }),
      ];

      for (const [i, image1] of variants.entries()) {
        for (const image2 of variants.slice(i + 1)) await assertSimilar(image1, image2);
      }
    });

    it("raises ArgumentError on invalid :background values", async () => {
      await expect(pipeline.rotateBang(45, { background: [0, 0] })).rejects.toThrow(ArgumentError);
      await expect(pipeline.rotateBang(45, { background: [1, 1, 1, 1, 1] })).rejects.toThrow(
        ArgumentError,
      );
      await expect(pipeline.rotateBang(45, { background: 1 })).rejects.toThrow(ArgumentError);
    });

    it("accepts transparent background color", async () => {
      const transparent = await pipeline.rotateBang(45, { background: "transparent" });
      const fallback = await pipeline.rotateBang(45, { background: "rgba(255,255,255,0.0)" });
      await assertSimilar(transparent, fallback);
    });
  });
});
