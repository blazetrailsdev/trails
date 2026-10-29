import { Error as MiniMagickError } from "@blazetrails/mini-magick";
import { Tool } from "@blazetrails/mini-magick/tool";
import {
  block,
  createTmpname,
  File,
  IO,
  NoMethodError,
  Pathname,
  Tempfile,
} from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import { MiniMagick as ImageProcessingMiniMagick } from "./mini-magick.js";
import {
  assertDimensions,
  assertSimilar,
  assertType,
  copyToTempfile,
  fixtureImage,
} from "./test-helpers/test-helper.js";
import { Vips as ImageProcessingVips, vips } from "./vips.js";

type VipsImage = InstanceType<typeof vips.Image>;
type Result = Tempfile;
type Pipeline = { [name: string]: (...args: unknown[]) => Promise<Result> & Pipeline } & {
  options: Record<string, unknown> & { operations: [string, unknown[], unknown?][] };
};

const Vips = ImageProcessingVips as unknown as Pipeline;
const MiniMagick = ImageProcessingMiniMagick as unknown as Pipeline;

describe("ImageProcessing::Pipeline", () => {
  let portrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
  });

  it("accepts source", () => {
    const pipeline = Vips.source(portrait);
    expect(pipeline.options.source).toBe(portrait);
  });

  it("accepts File, Tempfile, String, and Pathname objects as source", async () => {
    await Vips.source(portrait).call();
    await Vips.source(copyToTempfile(portrait, "jpg")).call();
    await Vips.source(portrait.path()).call();
    await Vips.source(new Pathname(portrait.path()!)).call();
  });

  it("accepts format", async () => {
    const pipeline = Vips.source(portrait);

    let result = await pipeline.convertBang("png");
    expect(File.extname(result.path()!)).toEqual(".png");

    result = await pipeline.convertBang(null);
    expect(File.extname(result.path()!)).toEqual(".jpg");
    await assertSimilar(portrait, result);
  });

  it("retains original format if format was not specified", async () => {
    const jpg = await Vips.convert("jpg").call(portrait);
    const png = await Vips.convert("png").call(portrait);
    const resultJpg = await Vips.invert().call(jpg);
    const resultPng = await Vips.invert().call(png);
    expect(File.extname(resultJpg.path()!)).toEqual(".jpg");
    expect(File.extname(resultPng.path()!)).toEqual(".png");
  });

  it("saves as JPEG when format is unknown", async () => {
    const png = await Vips.convert("png").call(portrait);
    const result = await Vips.invert().call(copyToTempfile(png));
    expect(File.extname(result.path()!)).toEqual(".jpg");
    await assertType("JPEG", result);
  });

  it("saves as JPEG when format is unknown and the path ends with a '.'", async () => {
    const png = await Vips.convert("png").call(portrait);
    const result = await Vips.invert().call(copyToTempfile(png, "."));
    expect(File.extname(result.path()!)).toEqual(".jpg");
    await assertType("JPEG", result);
  });

  it("accepts destination path", async () => {
    const destination = Tempfile.new(["destination", ".jpg"]);
    await Vips.source(portrait).call(null, { destination: destination.path() });
    expect(destination.path()).not.toEqual(0);
  });

  it("makes sure the destination file is deleted on processing errors", async () => {
    const destinationPath = createTmpname(["destination", ".jpg"], null, {}, () => {});
    const pipeline = MiniMagick.source(fixtureImage("invalid.jpg"));
    await expect(pipeline.call(null, { destination: destinationPath })).rejects.toThrow(
      MiniMagickError,
    );
    expect(await File.isExistAsync(destinationPath)).toBe(false);
  });

  it("doesn't delete the destination file if it has already existed", async () => {
    const destination = Tempfile.new(["destination", ".jpg"]);
    const pipeline = MiniMagick.source(fixtureImage("invalid.jpg"));
    await expect(pipeline.call(null, { destination: destination.path() })).rejects.toThrow(
      MiniMagickError,
    );
    expect(await File.isExistAsync(destination.path()!)).toBe(true);
  });

  it("doesn't fail when destination file hasn't been created", async () => {
    const destinationPath = createTmpname("destination", null, {}, () => {});
    const pipeline = Vips.source(portrait);
    await expect(pipeline.call(null, { destination: destinationPath })).rejects.toThrow();
  });

  it("accepts loader options", () => {
    let pipeline = Vips.loader({ shrink: 2 });
    expect(pipeline.options.loader).toEqual({ shrink: 2 });

    pipeline = pipeline.loader({ autorotate: true });
    expect(pipeline.options.loader).toEqual({ shrink: 2, autorotate: true });
  });

  it("accepts saver options", () => {
    let pipeline = Vips.saver({ strip: true });
    expect(pipeline.options.saver).toEqual({ strip: true });

    pipeline = pipeline.saver({ Q: 100 });
    expect(pipeline.options.saver).toEqual({ strip: true, Q: 100 });
  });

  it("accepts operations", () => {
    let pipeline = Vips.shrink(2, 2);
    expect(pipeline.options.operations).toEqual([["shrink", [2, 2]]]);

    pipeline = pipeline.invert();
    expect(pipeline.options.operations).toEqual([
      ["shrink", [2, 2]],
      ["invert", []],
    ]);
  });

  it("saves blocks passed to operations", () => {
    const pipeline = MiniMagick.stack(
      block((stack: { foo(arg: string): unknown }) => stack.foo("bar")),
    );
    expect(pipeline.options.operations[0][0]).toBe("stack");
    expect(pipeline.options.operations[0][1]).toEqual([]);
    expect(pipeline.options.operations[0][2]).toBeInstanceOf(Function);
  });

  it("accepts a list of commands", async () => {
    const pipeline = Vips.source(fixtureImage("rotated.jpg"));

    const actual1 = await pipeline
      .apply({
        loader: { autorotate: true },
        resizeToFit: [400, 400, { sharpen: false }],
        invert: true,
        rot90: null,
        rot: "d90",
        convert: "png",
      })
      .call();

    const actual2 = await pipeline
      .apply([
        ["loader", { autorotate: true }],
        ["resizeToFit", [400, 400, { sharpen: false }]],
        ["invert", true],
        ["rot90", null],
        ["rot", "d90"],
        ["convert", "png"],
      ])
      .call();

    const expected = await pipeline
      .loader({ autorotate: true })
      .resizeToFit(400, 400, { sharpen: false })
      .invert()
      .rot90()
      .rot("d90")
      .convert("png")
      .call();

    await assertSimilar(expected, actual1);
    await assertSimilar(expected, actual2);
  });

  it("applies a custom block", async () => {
    let actual = await Vips.custom(block((image: VipsImage) => image.invert())).call(portrait);
    let expected = await Vips.invert().call(portrait);
    await assertSimilar(expected, actual);

    actual = await Vips.custom(block(() => null)).call(portrait);
    expected = await Vips.call(portrait);
    await assertSimilar(expected, actual);

    const identity = await Vips.custom().call(portrait);
    await assertSimilar(portrait, identity);
  });

  it("merges different options", () => {
    const pipeline = Vips.resizeToFill(400, 400).convert("png");

    expect(pipeline.options.operations).toEqual([["resizeToFill", [400, 400]]]);
    expect(pipeline.options.format).toBe("png");
  });

  it("doesn't mutate the receiver when branching", () => {
    const pipelineJpg = Vips.convert("jpg");
    const pipelinePng = pipelineJpg.convert("png");

    expect(pipelineJpg.options.format).toBe("jpg");
    expect(pipelinePng.options.format).toBe("png");
  });

  it("executes processing on #call with source", async () => {
    const result = await Vips.convert("png").call(portrait);
    expect(result).toBeInstanceOf(Tempfile);
    await assertType("PNG", result);
  });

  it("executes processing on #call without source", async () => {
    const result = await Vips.source(portrait).convert("png").call();
    expect(result).toBeInstanceOf(Tempfile);
    await assertType("PNG", result);
  });

  it("executes processing on bang operation method", async () => {
    let result = await Vips.source(portrait).convertBang("png");
    expect(result).toBeInstanceOf(Tempfile);
    await assertType("PNG", result);

    result = await Vips.source(portrait).shrinkBang(2, 2);
    expect(result).toBeInstanceOf(Tempfile);
    await assertDimensions([300, 400], result);

    result = await Vips.source(portrait).resizeToFillBang(400, 400);
    expect(result).toBeInstanceOf(Tempfile);
    await assertDimensions([400, 400], result);
  });

  it("can be called directly", async () => {
    const result = await Vips.call(portrait);
    await assertSimilar(result, portrait);
  });

  it("applies a sequence of operations", async () => {
    const actual = await Vips.invert().shrink(2, 2).call(portrait);

    let expected = await Vips.invert().call(portrait);
    expected = await Vips.shrink(2, 2).call(expected);

    await assertSimilar(expected, actual);
  });

  it("returns a rewinded and refreshed tempfile in binary mode", async () => {
    const tempfile = await Vips.convert("png").call(portrait);
    expect(tempfile).toBeInstanceOf(Tempfile);
    expect(tempfile.isBinmode()).toBe(true);
    expect(tempfile.pos).toEqual(0);
    expect(tempfile.read()).toEqual(IO.binread(tempfile.path()!));
  });

  it("returns an intermediary object on #call(save: false)", async () => {
    const vipsImage = (await Vips.resizeToLimit(400, 400).call(portrait, {
      save: false,
    })) as unknown as VipsImage;
    expect(vipsImage).toBeInstanceOf(vips.Image);
    expect([vipsImage.width, vipsImage.height]).toEqual([300, 400]);

    const magick = (await MiniMagick.source(portrait)
      .resizeToLimit(400, 400)
      .call(null, { save: false })) as unknown as Tool;
    expect(magick).toBeInstanceOf(Tool);
    expect(magick.args).toContain("400x400>");
  });

  it("raises exception when source was not provided", async () => {
    await expect(Vips.call()).rejects.toThrow(ImageProcessingError);
  });

  it("raises exception when invalid source was provided", async () => {
    await expect(Vips.source({}).call()).rejects.toThrow(ImageProcessingError);
  });

  it("raises a NoMethodError when predicate method is not defined", () => {
    expect(() => Vips.isValid(portrait)).toThrow(NoMethodError);
  });

  it("doesn't allow making system calls", async () => {
    Vips.source(portrait).apply({ system: "touch foo.txt" });
    expect(await File.isExistAsync("foo.txt")).toBe(false);

    await expect(Vips.source(portrait).spawn("touch foo.txt").call()).rejects.toThrow();
    expect(await File.isExistAsync("foo.txt")).toBe(false);

    await expect(MiniMagick.source(portrait).spawn("touch foo.txt").call()).rejects.toThrow(
      MiniMagickError,
    );
    expect(await File.isExistAsync("foo.txt")).toBe(false);
  });
});
