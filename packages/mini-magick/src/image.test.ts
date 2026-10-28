import type {} from "@blazetrails/vitest-matchers";
import {
  File,
  StringIO,
  Tempfile,
  FileUtils,
  pack,
  HTTP,
  Pathname,
  rbEql,
  RUBY_VERSION,
  Dir,
  Gem,
  rbHash,
  rbObjDup,
  rbStrSend,
  StandardError,
  rbObjAsString,
  env,
} from "@blazetrails/ruby-compat";
import { Image } from "./image.js";
import { cliVersion, Error } from "./mini-magick.js";
import { MiniMagick } from "./mini-magick.js";
import "./test-helpers/spec-helper.js";
import { imagePath, randomPath } from "./test-helpers/support/helpers.js";
import { Tool, type CliTool } from "./tool.js";
import { Utilities } from "./utilities.js";
import { beforeEach, expect, it, describe, vi, afterEach } from "vitest";

type MogrifyImage = Image & { [option: string]: (...args: unknown[]) => Promise<Image> };

describe("MiniMagick::Image", () => {
  let subject: Image;
  let dimensions: [number, number];
  let depth: number;
  let map: string;
  let pixels: number[];
  let blob: Uint8Array;
  let newTmpDir: string;
  let image: Image;
  let sameImage: Image;
  let otherImage: Image;
  let magenta: number[];
  let gray: number[];
  let green: number[];
  let cyan: number[];
  let pix: number[][][];
  let cols: number;
  let rows: number;
  let mask: Image;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    subject = await Image.open(imagePath());
  });

  describe(".read", () => {
    it("reads image from String", async () => {
      const string = File.binread(imagePath());
      const image = await Image.read(string);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("reads image from StringIO", async () => {
      const stringio = new StringIO(File.binread(imagePath()));
      const image = await Image.read(stringio);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("reads image from tempfile", async () => {
      const tempfile = Tempfile.open("magick");
      FileUtils.cp(imagePath(), tempfile.path()!);
      const image = await Image.read(tempfile);
      expect(await image.isValid()).toBeRubyTruthy();
    });
  });

  describe(".import_pixels", () => {
    beforeEach(() => {
      dimensions = [325, 200];
    });

    beforeEach(() => {
      depth = 16;
    });

    beforeEach(() => {
      map = "gray";
    });

    beforeEach(async () => {
      pixels = Array.from({ length: dimensions.reduce((a, b) => a * b) }, (_, i) => i);
    });

    beforeEach(async () => {
      blob = pack(pixels, "S*");
    });

    // BLOCKED: mini-magick-image-spec-remaining-fails
    it.fails("can import pixels with default format", async () => {
      const image = await Image.importPixels(blob, ...dimensions, depth, map);
      expect(await image.isValid()).toBeRubyTruthy();
      expect(await image.type()).toEqual("PNG");
      expect(await image.dimensions()).toEqualRuby(dimensions);
    });

    // BLOCKED: mini-magick-image-spec-remaining-fails
    it.fails("can import pixels with custom format", async () => {
      const image = await Image.importPixels(blob, ...dimensions, depth, map, "jpeg");
      expect(await image.isValid()).toBeRubyTruthy();
      expect(await image.type()).toEqual("JPEG");
      expect(await image.dimensions()).toEqualRuby(dimensions);
    });
  });

  describe(".open", () => {
    it("makes a copy of the image", async () => {
      const image = await Image.open(imagePath());
      expect(image.path).not.toEqualRuby(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
      expect(File.extname(image.path)).toEqualRuby(File.extname(imagePath()));
    });

    it("accepts a Pathname", async () => {
      const image = await Image.open(new Pathname(imagePath()));
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("accepts a non-ascii filename", async () => {
      const image = await Image.open(imagePath("non_ascii_filename"));
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("loads a remote image", async () => {
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation(async (...args: unknown[]) =>
          (args.at(-1) as (io: File) => unknown)(File.open(imagePath(), "rb")),
        );
      const image = await Image.open("http://example.com/image.jpg");
      expect(await image.isValid()).toBeRubyTruthy();
      expect(File.extname(image.path)).toEqual(".jpg");
      expect(spy).toHaveBeenCalled();
    });

    it("accepts open-uri options", async (ctx) => {
      ctx.skip(!(RUBY_VERSION >= "2.7"));
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation(async (...args: unknown[]) =>
          (args.at(-1) as (io: File) => unknown)(File.open(imagePath(), "rb")),
        );
      await Image.open("http://example.com/image.jpg", { Foo: "Bar" });
      expect(spy).toHaveBeenCalledWith({ Foo: "Bar" }, expect.any(Function));
    });

    it("accepts open-uri options with extension", async (ctx) => {
      ctx.skip(!(RUBY_VERSION >= "2.7"));
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation(async (...args: unknown[]) =>
          (args.at(-1) as (io: File) => unknown)(File.open(imagePath(), "rb")),
        );
      await Image.open("http://example.com/image.jpg", ".jpg", { Foo: "Bar" });
      expect(spy).toHaveBeenCalledWith({ Foo: "Bar" }, expect.any(Function));
    });

    it("strips out colons from URL", async () => {
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation(async (...args: unknown[]) =>
          (args.at(-1) as (io: File) => unknown)(File.open(imagePath(), "rb")),
        );
      const image = await Image.open("http://example.com/image.jpg:large");
      expect(File.extname(image.path)).toEqual(".jpg");
      expect(spy).toHaveBeenCalled();
    });

    it("does not mistake a path with a colon for a URI schema", async () => {
      await (async () => await Image.open(imagePath("colon")))();
    });
  });

  describe(".create", () => {
    it("creates an image", async () => {
      const image = Image.create();
      expect(File.isExist(image.path)).toEqual(true);
    });

    describe("when a tmpdir is configured", () => {
      beforeEach(() => {
        newTmpDir = File.join(Dir.tmpdir(), "new_tmp_dir");
      });

      beforeEach(() => {
        FileUtils.mkdirP(newTmpDir);
      });

      afterEach(() => {
        FileUtils.rmRf(newTmpDir);
      });

      it("uses the tmpdir to create the file", async () => {
        vi.spyOn(MiniMagick, "tmpdir", "get").mockReturnValue(newTmpDir);
        const image = Image.create();
        expect(File.dirname(image.path)).toEqualRuby(newTmpDir);
      });
    });
  });

  describe("#initialize", () => {
    it("initializes a new image", async () => {
      const image = new Image(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("accepts a Pathname", async () => {
      const image = new Image(new Pathname(imagePath()));
      expect(image.path).toBeTypeOf("string");
    });

    // BLOCKED: mini-magick-image-spec-remaining-fails
    it.skip("accepts a block which it passes on to #combine_options", async () => {
      const image = new Image(subject.path, null, (b) => b.resize("100x100!"));
      expect(await image.dimensions()).toEqual([100, 100]);
    });
  });

  describe("equivalence", () => {
    beforeEach(() => {
      image = new Image(imagePath());
    });

    beforeEach(() => {
      sameImage = new Image(imagePath());
    });

    beforeEach(() => {
      otherImage = new Image(imagePath("exif"));
    });

    beforeEach(async () => {
      await Promise.all([image.signature(), sameImage.signature(), otherImage.signature()]);
    });

    it("is #== and #eql? to itself", () => {
      expect(image).toEqualRuby(image);
      expect(rbEql(image, image)).toBe(true);
    });

    it("is #== and #eql? to an instance of the same image", () => {
      expect(image).toEqualRuby(sameImage);
      expect(rbEql(image, sameImage)).toBe(true);
    });

    it("is not #== nor #eql? to an instance of a different image", async (ctx) => {
      ctx.skip(new Gem.Version(await cliVersion()).compare(new Gem.Version("7.1.1-35"))! >= 0);
      expect(image).not.toEqualRuby(otherImage);
      expect(rbEql(image, otherImage)).toBe(false);
    });

    it("generates the same hash code for an instance of the same image", () => {
      expect(rbHash(image)).toEqual(rbHash(sameImage));
    });

    it("generates different same hash codes for a different image", async (ctx) => {
      ctx.skip(new Gem.Version(await cliVersion()).compare(new Gem.Version("7.1.1-35"))! >= 0);
      expect(rbHash(image)).not.toEqual(rbHash(otherImage));
    });
  });

  describe("#tempfile", () => {
    it("returns the underlying temporary file", async () => {
      const image = await Image.open(imagePath());
      expect(await image.tempfile).toBeInstanceOf(Tempfile);
    });
  });

  describe("#format", () => {
    beforeEach(async () => {
      subject = await Image.open(imagePath("jpg"));
    });

    it("changes the format of the photo", async () => {
      await expect(async () => await subject.format("png")).toChange(
        async () => await subject.type(),
      );
    });

    it("reformats an image with a given extension", async () => {
      await expect(async () => await subject.format("png")).toChange(
        async () => File.extname(subject.path),
        { to: ".png" },
      );
    });

    it("creates the file with new extension", async () => {
      await subject.format("png");
      expect(File.isExist(subject.path)).toEqual(true);
    });

    it("accepts a block of additional commands", async () => {
      await expect(
        async () => await subject.format("png", undefined, undefined, (b) => b.resize("100x100!")),
      ).toChange(async () => await subject.dimensions(), { to: [100, 100] });
    });

    it("works without an extension with .open", async () => {
      const subject = await Image.open(imagePath("jpg_without_extension"));
      await subject.format("png");
      expect(File.extname(subject.path)).toEqual(".png");
      expect(await subject.type()).toEqual("PNG");
    });

    it("works without an extension with .new", async () => {
      const subject = new Image(imagePath("jpg_without_extension"));
      await subject.format("png");
      expect(File.extname(subject.path)).toEqual(".png");
      expect(await subject.type()).toEqual("PNG");
    });

    it("deletes the previous tempfile", async () => {
      const oldPath = await rbObjDup(subject.path);
      await subject.format("png");
      expect(File.isExist(oldPath)).toEqual(false);
    });

    it("deletes *.cache files generated from .mpc", async () => {
      const image = await Image.open(imagePath());
      await image.format("mpc");
      const cachePath = await rbStrSend(image.path, "sub", /mpc$/m, "cache")[0];
      await image.format("png");
      expect(File.isExist(cachePath as string | { toPath(): string })).toEqual(false);
    });

    it("doesn't delete itself when formatted to the same format", async () => {
      await subject.format(await (await subject.type()).toLowerCase());
      expect(File.isExist(subject.path)).toEqual(true);
    });

    it("reformats multi-image formats to multiple images", async () => {
      const subject = await Image.open(imagePath("animation"));
      await subject.format("jpg", null);
      expect(
        Dir.glob((await rbStrSend(subject.path, "sub", ".", "*.")[0]) as string),
      ).not.toBeEmpty();
    });

    it("reformats multi-image formats to a single image", async () => {
      const subject = await Image.open(imagePath("animation"));
      await subject.format("jpg");
      expect(await subject.isValid()).toBeRubyTruthy();
    });

    it("reformats a layer", async () => {
      const subject = await Image.open(imagePath("animation"));
      const layer = (await subject.layers())[0];
      await layer.format("jpg");
      expect(await layer.isValid()).toBeRubyTruthy();
      expect(layer.path.match(/\..+$/m)?.[0]).toEqual(".jpg");
      expect(File.isExist(layer.path)).toEqual(true);
    });

    it("clears the info only at the end", async () => {
      await subject.format("png", undefined, undefined, () => subject.type());
      expect(await subject.type()).toEqual("PNG");
    });

    it("returns self", async () => {
      expect(await subject.format("png")).toEqualRuby(subject);
    });

    it("reads read_opts from passed arguments", async () => {
      const subject = await Image.open(imagePath("animation"));
      const layer = (await subject.layers())[0];
      await layer.format("jpg", null, { density: "300" });
      expect(await layer.isValid()).toBeRubyTruthy();
    });

    it("not change tempfile when convert failed", async () => {
      const subject = await Image.create(
        null,
        async (f) => await f.write(File.binread(imagePath("not"))),
      );
      const currentPath = subject.path;
      const newTempfile = await Utilities.tempfile("png");
      const newPath = newTempfile.path()!;
      vi.spyOn(Utilities, "tempfile").mockReturnValue(newTempfile);
      await expect(async () => {
        try {
          return await subject.format("png");
        } catch (error) {
          if (!(error instanceof StandardError)) throw error;
        }
      }).not.toChange(async () => await subject.tempfile);
      expect(File.isExist(currentPath)).toEqual(true);
      expect(File.isExist(newPath)).toEqual(false);
    });
  });

  describe("#write", () => {
    it("writes the image", async () => {
      const outputPath = randomPath("test output");
      await subject.write(outputPath);
      expect(await new Image(outputPath).isValid()).toBeRubyTruthy();
    });

    it("writes an image with stream", async () => {
      const outputStream = new StringIO();
      await subject.write(outputStream);
      expect(await (await Image.read(outputStream.string())).isValid()).toBeRubyTruthy();
    });

    it("writes layers", async () => {
      const outputPath = randomPath(["", `.${(await subject.type()).toLowerCase()}`]);
      const subject2 = new Image(imagePath("gif"));
      await (await subject2.frames())[0].write(outputPath);
      expect(await new Image(outputPath).isValid()).toBeRubyTruthy();
    });

    it("accepts a Pathname", async () => {
      const outputPath = new Pathname(randomPath());
      await subject.write(outputPath);
      expect(await new Image(await rbObjAsString(outputPath)).isValid()).toBeRubyTruthy();
    });

    it("works when writing to the same path", async () => {
      await subject.write(subject.path);
      expect(File.read(subject.path)).not.toBeEmpty();
    });
  });

  describe("#valid?", () => {
    it("returns true when image is valid", async () => {
      const image = new Image(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("returns false when image is not valid", async () => {
      const image = new Image(imagePath("not"));
      expect(await image.isValid()).toBeRubyFalsy();
    });
  });

  describe("#[]", () => {
    it("inspects image meta info", async () => {
      expect(await subject.get("width")).toBeTypeOf("number");
      expect(await subject.get("height")).toBeTypeOf("number");
      for (const x of (await subject.get("dimensions")) as number[]) expect(x).toBeTypeOf("number");
      expect(await subject.get("colorspace")).toBeTypeOf("string");
      expect(await subject.get("format")).toMatch(/[A-Z]/);
      expect(await subject.get("signature")).toMatch(/[a-zA-Z0-9]{64}/);
    });

    it("supports string keys", async () => {
      expect(await subject.get("width")).toBeTypeOf("number");
      expect(await subject.get("height")).toBeTypeOf("number");
      for (const x of (await subject.get("dimensions")) as number[]) expect(x).toBeTypeOf("number");
      expect(await subject.get("colorspace")).toBeTypeOf("string");
      expect(await subject.get("format")).toMatch(/[A-Z]/);
      expect(await subject.get("signature")).toMatch(/[a-zA-Z0-9]{64}/);
    });

    it("reads exif", async () => {
      const subject = new Image(imagePath("exif"));
      expect(await subject.get("EXIF:Flash")).toEqual("0");
    });

    it("passes unknown values directly to -format", async () => {
      expect(
        ((await subject.get("%w %h")) as string).split(" ").map((x) => parseInt(x, 10)),
      ).toEqual([await subject.get("width"), await subject.get("height")]);
    });
  });

  it("has attributes", async () => {
    expect(await subject.type()).toMatch(/^[A-Z]+$/m);
    expect(await subject.width()).toBeTypeOf("number");
    expect(await subject.width()).not.toEqual(0);
    expect(await subject.height()).toBeTypeOf("number");
    expect(await subject.height()).not.toEqual(0);
    for (const x of await subject.dimensions()) expect(x).toBeTypeOf("number");
    expect(await subject.size()).toBeTypeOf("number");
    expect(await subject.size()).not.toEqual(0);
    expect(await subject.humanSize()).toBeTypeOf("string");
    expect(await subject.humanSize()).not.toEqual("");
    expect(await subject.colorspace()).toBeTypeOf("string");
    for (const x of await subject.resolution()) expect(x).toBeTypeOf("number");
    expect(await subject.signature()).toMatch(/[a-zA-Z0-9]{64}/);
  });

  it("generates attributes of layers", async () => {
    expect(await (await subject.layers())[0].type()).toMatch(/^[A-Z]+$/m);
    expect(await (await subject.layers())[0].size()).toBeGreaterThan(0);
  });

  it("changes colorspace when called with an argument", async () => {
    const spy = vi.spyOn(Tool.prototype, "call");
    await subject.colorspace("Gray");
    expect(spy).toHaveBeenCalled();
  });

  it("changes size when called with an argument", async () => {
    const spy = vi.spyOn(Tool.prototype, "call");
    await subject.size("20x20");
    expect(spy).toHaveBeenCalled();
  });

  describe("#size", () => {
    it("returns the correct value even if the log contains unit prefixes", async () => {
      const subject = new Image(imagePath("large_webp"));
      expect(await subject.size()).toBeTypeOf("number");
    });
  });

  describe("#exif", () => {
    it("returns a hash of EXIF data", async () => {
      const subject = new Image(imagePath("exif"));
      expect((await subject.exif())["DateTimeOriginal"]).toBeTypeOf("string");
    });

    it("decodes the ExifVersion", async (ctx) => {
      ctx.skip(env.CI != null);
      const subject = new Image(imagePath("exif"));
      expect((await subject.exif())["ExifVersion"]).toEqual("0220");
    });

    it("handles no EXIF data", async () => {
      const subject = new Image(imagePath("no_exif"));
      expect(await subject.exif()).toEqualRuby({});
    });
  });

  describe("#resolution", () => {
    it("accepts units", async () => {
      expect(await subject.resolution("PixelsPerCentimeter")).not.toEqualRuby(
        await subject.resolution("PixelsPerInch"),
      );
    });
  });

  describe("#data", () => {
    describe("when the data return is not an array", () => {
      beforeEach(() => {
        subject = new Image(imagePath("jpg"));
      });

      it("returns image JSON data", async (ctx) => {
        ctx.skip(env.CI != null);
        expect((await subject.data())["format"]).toEqual("JPEG");
        expect((await subject.data())["colorspace"]).toEqual("sRGB");
      });
    });

    describe("when the data return is an array (ex png)", () => {
      beforeEach(() => {
        subject = new Image(imagePath("png"));
      });

      it("returns image JSON data", async (ctx) => {
        ctx.skip(env.CI != null);
        expect((await subject.data())["format"]).toEqual("PNG");
        expect((await subject.data())["colorspace"]).toEqual("sRGB");
      });
    });
  });

  describe("#layers", () => {
    it("returns a list of images", async () => {
      for (const x of await subject.layers()) expect(x).toBeInstanceOf(Image);
      expect(await (await subject.layers())[0].isValid()).toBeRubyTruthy();
    });

    it("returns multiple images for GIFs, PDFs and PSDs", async () => {
      const gif = new Image(imagePath("gif"));
      expect(await (await gif.layers()).length).toBeGreaterThan(1);
      expect(await (await gif.frames()).length).toBeGreaterThan(1);
      expect(await (await gif.pages()).length).toBeGreaterThan(1);
    });

    it("returns one image for other formats", async () => {
      const jpg = new Image(imagePath("jpg"));
      expect(await (await jpg.layers()).length).toEqual(1);
    });
  });

  describe("#get_pixels", () => {
    beforeEach(() => {
      magenta = [255, 0, 255];
    });

    beforeEach(() => {
      gray = [128, 128, 128];
    });

    beforeEach(() => {
      green = [0, 255, 0];
    });

    beforeEach(() => {
      cyan = [0, 255, 255];
    });

    beforeEach(async () => {
      pix = await subject.getPixels();
    });

    beforeEach(async () => {
      subject = await Image.open(imagePath("rgb"));
    });

    describe("without modifications", () => {
      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a width-by-height matrix", async () => {
        for (const row of pix) {
          expect(
            await (row instanceof globalThis.Set || row instanceof globalThis.Map
              ? row.size
              : row.length),
          ).toEqualRuby(await subject.width);
        }
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a magenta pixel", () => {
        expect(pix[3][3]).toEqualRuby(magenta);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a gray pixel", () => {
        expect(pix[-4][-4]).toEqualRuby(gray);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a green pixel", () => {
        expect(pix[3][-4]).toEqualRuby(green);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a cyan pixel", () => {
        expect(pix[-4][3]).toEqualRuby(cyan);
      });
    });

    describe("after cropping", () => {
      beforeEach(() => {
        cols = 10;
      });

      beforeEach(() => {
        rows = 6;
      });

      beforeEach(async () => {
        await (subject as MogrifyImage).crop(`${cols ?? ""}x${rows ?? ""}+3+3`);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a matrix of the requested height", async () => {
        expect(
          await (pix instanceof globalThis.Set || pix instanceof globalThis.Map
            ? pix.size
            : pix.length),
        ).toEqualRuby(rows);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a matrix of the requested width", async () => {
        for (const x of pix) {
          expect(
            await (x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length),
          ).toEqualRuby(cols);
        }
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a magenta pixel", () => {
        expect(pix[0][0]).toEqualRuby(magenta);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a gray pixel", () => {
        expect(pix[-1][-1]).toEqualRuby(gray);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a cyan pixel", () => {
        expect(pix[-1][0]).toEqualRuby(cyan);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a green pixel", () => {
        expect(pix[0][-1]).toEqualRuby(green);
      });
    });

    describe("after resizing and desaturating", () => {
      beforeEach(() => {
        cols = 8;
      });

      beforeEach(() => {
        rows = 6;
      });

      beforeEach(async () => {
        await (subject as MogrifyImage).resize("50%");
        await subject.colorspace("Gray");
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a matrix of the requested height", async () => {
        expect(
          await (pix instanceof globalThis.Set || pix instanceof globalThis.Map
            ? pix.size
            : pix.length),
        ).toEqualRuby(rows);
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a matrix of the requested width", async () => {
        for (const x of pix) {
          expect(
            await (x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length),
          ).toEqualRuby(cols);
        }
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns gray pixels", () => {
        for (const row of pix) {
          for (const px of row) {
            expect(px[0]).toEqualRuby(px[1]);
            expect(px[0]).toEqualRuby(px[2]);
          }
        }
      });
    });

    describe("when first or last byte could be interpreted as control characters", () => {
      beforeEach(async () => {
        subject = await Image.open(imagePath("get_pixels"));
      });

      // BLOCKED: mini-magick-image-spec-remaining-fails
      it.fails("returns a matrix where all pixel has 3 values", async () => {
        for (const row of pix) {
          for (const px of row) {
            expect(
              await (px instanceof globalThis.Set || px instanceof globalThis.Map
                ? px.size
                : px.length),
            ).toEqual(3);
          }
        }
      });
    });
  });

  describe("missing methods", () => {
    it("is executed by #method_missing", async () => {
      await expect(async () => await (subject as MogrifyImage).resize("20x30!")).toChange(
        async () => await subject.dimensions(),
        { to: [20, 30] },
      );
    });

    it("returns self", async () => {
      expect(await (subject as MogrifyImage).resize("20x30!")).toEqualRuby(subject);
    });

    it("doesn't let ruby call #to_ary when flattening", async () => {
      await [subject, subject].flat(1);
    });
  });

  describe("#combine_options", () => {
    it("chains multiple options and executes them in one command", async () => {
      await expect(async () => await subject.combineOptions((c) => c.resize("20x30!"))).toChange(
        async () => await subject.dimensions(),
        { to: [20, 30] },
      );
    });

    it("doesn't allow calling of #format", async () => {
      await expect(
        (async () => await subject.combineOptions((c) => c.format("png")))(),
      ).rejects.toSatisfy(
        (e: Error) =>
          e instanceof Error &&
          e.message === "you must call #format on a MiniMagick::Image directly",
      );
    });

    it("clears the info only at the end", async () => {
      await subject.combineOptions((c) => {
        c.resize("20x30!");
        return subject.width();
      });
      expect(await subject.dimensions()).toEqual([20, 30]);
    });

    it("returns self", async () => {
      expect(await subject.combineOptions(() => {})).toEqualRuby(subject);
    });
  });

  describe("#composite", () => {
    beforeEach(async () => {
      otherImage = await Image.open(imagePath());
    });

    beforeEach(async () => {
      mask = await Image.open(imagePath());
    });

    it("creates a composite of two images", async () => {
      const image = await subject.composite(otherImage);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("creates a composite of two images with mask", async () => {
      const image = await subject.composite(otherImage, "jpg", mask);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    it("yields an optional block", async () => {
      await expect((b: (composite: CliTool) => unknown) =>
        subject.composite(otherImage, undefined, null, b),
      ).toYieldWithArgs(Tool);
    });

    it("makes the composited image with the provided extension", async () => {
      const result = await subject.composite(otherImage, "png");
      expect(result.path).toEndWith(".png");
    });

    it("defaults the extension to the extension of the base image", async () => {
      let subject = await Image.open(imagePath("jpg"));
      let result = await subject.composite(otherImage);
      expect(result.path).toEndWith(".jpeg");
      subject = await Image.open(imagePath("gif"));
      result = await subject.composite(otherImage);
      expect(result.path).toEndWith(".gif");
    });
  });

  describe("#collapse!", () => {
    beforeEach(async () => {
      subject = await Image.open(imagePath("animation"));
    });

    it("collapses the image to one frame", async () => {
      await subject.collapseBang();
      expect((await subject.identify()).split("\n").length).toEqual(1);
    });

    it("keeps the extension", async () => {
      await expect(async () => await subject.collapseBang()).not.toChange(
        async () => await subject.type(),
      );
    });

    it("clears the info", async () => {
      await expect(async () => await subject.collapseBang()).toChange(
        async () => await subject.size(),
      );
    });

    it("returns self", async () => {
      expect(await subject.collapseBang()).toEqualRuby(subject);
    });
  });

  describe("#destroy!", () => {
    it("deletes the underlying tempfile", async () => {
      const image = await Image.open(imagePath());
      await image.destroyBang();
      expect(File.isExist(image.path)).toEqual(false);
    });

    it("doesn't delete when there is no tempfile", async () => {
      const image = new Image(imagePath());
      await image.destroyBang();
      expect(File.isExist(image.path)).toEqual(true);
    });

    it("deletes .cache files generated by handling .mpc files", async () => {
      const image = await Image.open(imagePath());
      await image.format("mpc");
      await image.destroyBang();
      expect(
        File.isExist(
          (await rbStrSend(image.path, "sub", /mpc$/m, "cache")[0]) as
            | string
            | { toPath(): string },
        ),
      ).toEqual(false);
    });
  });

  describe("#identify", () => {
    it("returns the output of identify", async () => {
      expect(await subject.identify()).toMatch(await subject.type());
    });

    it("yields an optional block", async () => {
      const output = await subject.identify((b) => b.verbose());
      expect(output).toMatch("Format:");
    });
  });

  describe("#landscape?", () => {
    it("returns true if image width greater than height", async () => {
      const image = await Image.open(imagePath("clipping_path"));
      expect(await image.isLandscape()).toEqual(true);
    });

    it("returns false if image width less than height", async () => {
      const image = await Image.open(imagePath("default"));
      expect(await image.isLandscape()).toEqual(false);
    });
  });

  describe("#portrait?", () => {
    it("returns true if image width greater than height", async () => {
      const image = await Image.open(imagePath("default"));
      expect(await image.isPortrait()).toEqual(true);
    });

    it("returns false if image width less than height", async () => {
      const image = await Image.open(imagePath("clipping_path"));
      expect(await image.isPortrait()).toEqual(false);
    });
  });
});
