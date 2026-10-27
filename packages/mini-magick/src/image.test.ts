import type {} from "@blazetrails/vitest-matchers";
import {
  File,
  StringIO,
  Tempfile,
  FileUtils,
  pack,
  rbCheckArrayType,
  HTTP,
  RUBY_VERSION,
  Dir,
  Gem,
  rbHash,
  rbObjDup,
  rbStrSend,
  first,
  StandardError,
  rbObjAsString,
  env,
} from "@blazetrails/ruby-compat";
import { Image } from "./image.js";
import { cliVersion, Error } from "./mini-magick.js";
import { MiniMagick } from "./mini-magick.js";
import "./test-helpers/spec-helper.js";
import { imagePath, randomPath } from "./test-helpers/support/helpers.js";
import { Tool } from "./tool.js";
import { Utilities } from "./utilities.js";
import { beforeEach, expect, it, describe, vi, afterEach } from "vitest";

describe("MiniMagick::Image", () => {
  let subject: unknown;
  let dimensions: unknown;
  let depth: unknown;
  let map: unknown;
  let pixels: unknown;
  let blob: unknown;
  let newTmpDir: unknown;
  let image: unknown;
  let sameImage: unknown;
  let otherImage: unknown;
  let magenta: unknown;
  let gray: unknown;
  let green: unknown;
  let cyan: unknown;
  let pix: unknown;
  let cols: unknown;
  let rows: unknown;
  let mask: unknown;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    subject = await Image.open(imagePath());
  });

  describe(".read", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("reads image from String", async () => {
      const string = File.binread(imagePath() as string);
      const image = await Image.read(string);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reads image from StringIO", async () => {
      const stringio = new StringIO(File.binread(imagePath() as string));
      const image = await Image.read(stringio);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reads image from tempfile", async () => {
      const tempfile = Tempfile.open("magick");
      FileUtils.cp(imagePath() as string | string[], (await tempfile.path())!);
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
      pixels = [dimensions.reduce((a: number, b: number) => a * b), (i) => i];
    });

    beforeEach(async () => {
      blob = await pack(pixels as readonly (string | number | bigint)[], "S*");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("can import pixels with default format", async () => {
      const image = await Image.importPixels(
        blob,
        ...(dimensions == null ? [] : (rbCheckArrayType(dimensions) ?? [dimensions])),
        depth,
        map,
      );
      expect(await image.isValid()).toBeRubyTruthy();
      expect(await image.type()).toEqual("PNG");
      expect(await image.dimensions()).toEqualRuby(dimensions);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("can import pixels with custom format", async () => {
      const image = await Image.importPixels(
        blob,
        ...(dimensions == null ? [] : (rbCheckArrayType(dimensions) ?? [dimensions])),
        depth,
        map,
        "jpeg",
      );
      expect(await image.isValid()).toBeRubyTruthy();
      expect(await image.type()).toEqual("JPEG");
      expect(await image.dimensions()).toEqualRuby(dimensions);
    });
  });

  describe(".open", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("makes a copy of the image", async () => {
      const image = await Image.open(imagePath());
      expect(await image.path()).not.toEqualRuby(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
      expect(File.extname(await image.path())).toEqualRuby(File.extname(imagePath() as string));
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a Pathname", async () => {
      const image = await Image.open(await this.Pathname(imagePath()));
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a non-ascii filename", async () => {
      const image = await Image.open(imagePath("non_ascii_filename"));
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("loads a remote image", async () => {
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation((...args: unknown[]) =>
          (args.at(-1) as (...a: unknown[]) => unknown)(File.open(imagePath() as string, "rb")),
        );
      const image = await Image.open("http://example.com/image.jpg");
      expect(await image.isValid()).toBeRubyTruthy();
      expect(File.extname(await image.path())).toEqual(".jpg");
      expect(spy).toHaveBeenCalled();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts open-uri options", async (ctx) => {
      ctx.skip(!(RUBY_VERSION >= "2.7"));
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation((...args: unknown[]) =>
          (args.at(-1) as (...a: unknown[]) => unknown)(File.open(imagePath() as string, "rb")),
        );
      await Image.open("http://example.com/image.jpg", { Foo: "Bar" });
      expect(spy).toHaveBeenCalledWith({ Foo: "Bar" });
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts open-uri options with extension", async (ctx) => {
      ctx.skip(!(RUBY_VERSION >= "2.7"));
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation((...args: unknown[]) =>
          (args.at(-1) as (...a: unknown[]) => unknown)(File.open(imagePath() as string, "rb")),
        );
      await Image.open("http://example.com/image.jpg", ".jpg", { Foo: "Bar" });
      expect(spy).toHaveBeenCalledWith({ Foo: "Bar" });
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("strips out colons from URL", async () => {
      const spy = vi
        .spyOn(HTTP.prototype, "open")
        .mockImplementation((...args: unknown[]) =>
          (args.at(-1) as (...a: unknown[]) => unknown)(File.open(imagePath() as string, "rb")),
        );
      const image = await Image.open("http://example.com/image.jpg:large");
      expect(File.extname(await image.path())).toEqual(".jpg");
      expect(spy).toHaveBeenCalled();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("does not mistake a path with a colon for a URI schema", async () => {
      await (async () => await Image.open(imagePath("colon")))();
    });
  });

  describe(".create", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("creates an image", async () => {
      const image = await this.create();
      expect(File.isExist(await image.path())).toEqual(true);
    });

    describe("when a tmpdir is configured", () => {
      beforeEach(() => {
        FileUtils.mkdirP(newTmpDir as string | string[]);
      });

      afterEach(() => {
        FileUtils.rmRf(newTmpDir as string | string[]);
      });

      beforeEach(() => {
        newTmpDir = File.join(Dir.tmpdir(), "new_tmp_dir");
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("uses the tmpdir to create the file", async () => {
        vi.spyOn(MiniMagick, "tmpdir").mockReturnValue(newTmpDir);
        const image = await this.create();
        expect(File.dirname(await image.path())).toEqualRuby(newTmpDir);
      });
    });
  });

  describe("#initialize", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("initializes a new image", async () => {
      const image = new Image(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a Pathname", async () => {
      const image = new Image(await this.Pathname(imagePath()));
      expect(await image.path()).toBeInstanceOf(String);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a block which it passes on to #combine_options", async () => {
      const image = new Image(await subject.path(), async (b) => await b.resize("100x100!"));
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

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("is #== and #eql? to itself", () => {
      expect(image).toEqualRuby(image);
      expect(image).toEqualRuby(image);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("is #== and #eql? to an instance of the same image", () => {
      expect(image).toEqualRuby(sameImage);
      expect(image).toEqualRuby(sameImage);
    });

    it.fails("is not #== nor #eql? to an instance of a different image", (ctx) => {
      ctx.skip(new Gem.Version(cliVersion()).compare(new Gem.Version("7.1.1-35"))! >= 0);
      expect(image).not.toEqualRuby(otherImage);
      expect(image).not.toEqualRuby(otherImage);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("generates the same hash code for an instance of the same image", async () => {
      expect(await rbHash(image)).toEqualRuby(await rbHash(sameImage));
    });

    it.fails("generates different same hash codes for a different image", async (ctx) => {
      ctx.skip(new Gem.Version(cliVersion()).compare(new Gem.Version("7.1.1-35"))! >= 0);
      expect(await rbHash(image)).not.toEqualRuby(await rbHash(otherImage));
    });
  });

  describe("#tempfile", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns the underlying temporary file", async () => {
      const image = await Image.open(imagePath());
      expect(await image.tempfile).toBeInstanceOf(Tempfile);
    });
  });

  describe("#format", () => {
    beforeEach(async () => {
      subject = await Image.open(imagePath("jpg"));
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("changes the format of the photo", async () => {
      await expect(async () => await subject.format("png")).toChange(
        async () => await subject.type(),
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reformats an image with a given extension", async () => {
      await expect(async () => await subject.format("png")).toChange(
        async () => File.extname(await subject.path()),
        { to: ".png" },
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("creates the file with new extension", async () => {
      await subject.format("png");
      expect(File.isExist(await subject.path())).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a block of additional commands", async () => {
      await expect(
        async () => await subject.format("png", async (b: unknown) => await b.resize("100x100!")),
      ).toChange(async () => await subject.dimensions(), { to: [100, 100] });
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("works without an extension with .open", async () => {
      const subject = await Image.open(imagePath("jpg_without_extension"));
      await subject.format("png");
      expect(File.extname(await subject.path())).toEqual(".png");
      expect(await subject.type()).toEqual("PNG");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("works without an extension with .new", async () => {
      const subject = new Image(imagePath("jpg_without_extension"));
      await subject.format("png");
      expect(File.extname(await subject.path())).toEqual(".png");
      expect(await subject.type()).toEqual("PNG");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("deletes the previous tempfile", async () => {
      const oldPath = await rbObjDup(await subject.path());
      await subject.format("png");
      expect(File.isExist(oldPath)).toEqual(false);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("deletes *.cache files generated from .mpc", async () => {
      const image = await Image.open(imagePath());
      await image.format("mpc");
      const cachePath = await rbStrSend(await image.path(), "sub", /mpc$/m, "cache")[0];
      await image.format("png");
      expect(File.isExist(cachePath as string | { toPath(): string })).toEqual(false);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("doesn't delete itself when formatted to the same format", async () => {
      await subject.format(await ((await subject.type()) as string).toLowerCase());
      expect(File.isExist(await subject.path())).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reformats multi-image formats to multiple images", async () => {
      const subject = await Image.open(imagePath("animation"));
      await subject.format("jpg", null);
      expect(
        Dir.glob((await rbStrSend(await subject.path(), "sub", ".", "*.")[0]) as string),
      ).not.toBeEmpty();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reformats multi-image formats to a single image", async () => {
      const subject = await Image.open(imagePath("animation"));
      await subject.format("jpg");
      expect(await subject.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reformats a layer", async () => {
      const subject = await Image.open(imagePath("animation"));
      const layer = await first(await subject.layers());
      await layer.format("jpg");
      expect(await layer.isValid()).toBeRubyTruthy();
      expect((await layer.path())[/\..+$/m]).toEqual(".jpg");
      expect(File.isExist(await layer.path())).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("clears the info only at the end", async () => {
      await subject.format("png", async () => await subject.type());
      expect(await subject.type()).toEqual("PNG");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns self", async () => {
      expect(await subject.format("png")).toEqualRuby(subject);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reads read_opts from passed arguments", async () => {
      const subject = await Image.open(imagePath("animation"));
      const layer = await first(await subject.layers());
      await layer.format("jpg", null, { density: "300" });
      expect(await layer.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("not change tempfile when convert failed", async () => {
      const subject = await Image.create(
        null,
        async (f) => await f.write(File.binread(imagePath("not") as string)),
      );
      const currentPath = await subject.path();
      const newTempfile = await Utilities.tempfile("png");
      const newPath = await newTempfile.path();
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
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("writes the image", async () => {
      const outputPath = randomPath("test output");
      await subject.write(outputPath);
      expect(await new Image(outputPath).isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("writes an image with stream", async () => {
      const outputStream = new StringIO();
      await subject.write(outputStream);
      expect(await (await Image.read(outputStream.string())).isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("writes layers", async () => {
      const outputPath = randomPath([
        "",
        `.${await ((await subject.type()) as string).toLowerCase()}`,
      ]);
      const subject = new Image(imagePath("gif"));
      await (await ((await subject.frames())[0] ?? null)).write(outputPath);
      expect(await new Image(outputPath).isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("accepts a Pathname", async () => {
      const outputPath = await this.Pathname(randomPath());
      await subject.write(outputPath);
      expect(await new Image(await rbObjAsString(outputPath)).isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("works when writing to the same path", async () => {
      await subject.write(await subject.path());
      expect(File.read(await subject.path())).not.toBeEmpty();
    });
  });

  describe("#valid?", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns true when image is valid", async () => {
      const image = new Image(imagePath());
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns false when image is not valid", async () => {
      const image = new Image(imagePath("not"));
      expect(await image.isValid()).toBeRubyFalsy();
    });
  });

  describe("#[]", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("inspects image meta info", () => {
      expect(subject["width"]).toBeInstanceOf(Number);
      expect(subject["height"]).toBeInstanceOf(Number);
      for (const x of subject["dimensions"]) expect(x).toBeInstanceOf(Number);
      expect(subject["colorspace"]).toBeInstanceOf(String);
      expect(subject["format"]).toMatch(/[A-Z]/);
      expect(subject["signature"]).toMatch(/[a-zA-Z0-9]{64}/);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("supports string keys", () => {
      expect(subject["width"]).toBeInstanceOf(Number);
      expect(subject["height"]).toBeInstanceOf(Number);
      for (const x of subject["dimensions"]) expect(x).toBeInstanceOf(Number);
      expect(subject["colorspace"]).toBeInstanceOf(String);
      expect(subject["format"]).toMatch(/[A-Z]/);
      expect(subject["signature"]).toMatch(/[a-zA-Z0-9]{64}/);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("reads exif", () => {
      const subject = new Image(imagePath("exif"));
      expect(subject["EXIF:Flash"]).toEqual("0");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("passes unknown values directly to -format", async () => {
      expect(
        await (await (rbStrSend(subject["%w %h"], "split")[0] as string[])).map((x) => x.toI()),
      ).toEqualRuby([subject["width"], subject["height"]]);
    });
  });

  // BLOCKED: mini-magick-lib-native-idioms

  it.fails("has attributes", async () => {
    expect(await subject.type()).toMatch(/^[A-Z]+$/m);
    expect(await subject.width).toBeInstanceOf(Number);
    expect(await (await subject.width).isNonzero()).toBeRubyTruthy();
    expect(await subject.height()).toBeInstanceOf(Number);
    expect(await (await subject.height()).isNonzero()).toBeRubyTruthy();
    for (const x of await subject.dimensions()) expect(x).toBeInstanceOf(Number);
    expect(
      await (subject instanceof globalThis.Set || subject instanceof globalThis.Map
        ? subject.size
        : subject.length),
    ).toBeInstanceOf(Number);
    expect(
      await (
        await (subject instanceof globalThis.Set || subject instanceof globalThis.Map
          ? subject.size
          : subject.length)
      ).isNonzero(),
    ).toBeRubyTruthy();
    expect(await subject.humanSize()).toBeInstanceOf(String);
    expect(await (await subject.humanSize()).isNonempty()).toBeRubyTruthy();
    expect(await subject.colorspace()).toBeInstanceOf(String);
    for (const x of await subject.resolution()) expect(x).toBeInstanceOf(Number);
    expect(await subject.signature()).toMatch(/[a-zA-Z0-9]{64}/);
  });

  // BLOCKED: mini-magick-lib-native-idioms

  it.fails("generates attributes of layers", async () => {
    expect(await (await subject.layers())[0].type()).toMatch(/^[A-Z]+$/m);
    expect(
      await ((x) =>
        x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
        (await subject.layers())[0],
      ),
    ).toBeGreaterThan(0);
  });

  // BLOCKED: mini-magick-lib-native-idioms

  it.fails("changes colorspace when called with an argument", async () => {
    const spy = vi.spyOn(Tool.prototype, "call");
    await subject.colorspace("Gray");
    expect(spy).toHaveBeenCalled();
  });

  // BLOCKED: mini-magick-lib-native-idioms

  it.fails("changes size when called with an argument", async () => {
    const spy = vi.spyOn(Tool.prototype, "call");
    await subject.size("20x20");
    expect(spy).toHaveBeenCalled();
  });

  describe("#size", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns the correct value even if the log contains unit prefixes", async () => {
      const subject = new Image(imagePath("large_webp"));
      expect(
        await (subject instanceof globalThis.Set || subject instanceof globalThis.Map
          ? subject.size
          : subject.length),
      ).toBeInstanceOf(Number);
    });
  });

  describe("#exif", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns a hash of EXIF data", async () => {
      const subject = new Image(imagePath("exif"));
      expect((await subject.exif())["DateTimeOriginal"]).toBeInstanceOf(String);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("decodes the ExifVersion", async (ctx) => {
      ctx.skip(env.CI != null);
      const subject = new Image(imagePath("exif"));
      expect((await subject.exif())["ExifVersion"]).toEqual("0220");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("handles no EXIF data", async () => {
      const subject = new Image(imagePath("no_exif"));
      expect(await subject.exif()).toEqualRuby({});
    });
  });

  describe("#resolution", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("accepts units", async () => {
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

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns image JSON data", async (ctx) => {
        ctx.skip(env.CI != null);
        expect((await subject.data())["format"]).toEqual("JPEG");
        expect((await subject.data())["colorspace"]).toEqual("sRGB");
      });
    });

    describe("when the data return is an array (ex png)", () => {
      beforeEach(() => {
        subject = new Image(imagePath("png"));
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns image JSON data", async (ctx) => {
        ctx.skip(env.CI != null);
        expect((await subject.data())["format"]).toEqual("PNG");
        expect((await subject.data())["colorspace"]).toEqual("sRGB");
      });
    });
  });

  describe("#layers", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns a list of images", async () => {
      for (const x of await subject.layers()) expect(x).toBeInstanceOf(Image);
      expect(await (await first(await subject.layers())).isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns multiple images for GIFs, PDFs and PSDs", async () => {
      const gif = new Image(imagePath("gif"));
      expect(await (await gif.layers()).length).toBeGreaterThan(1);
      expect(await (await gif.frames()).length).toBeGreaterThan(1);
      expect(await (await gif.pages()).length).toBeGreaterThan(1);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns one image for other formats", async () => {
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
      // BLOCKED: mini-magick-lib-native-idioms
      it.fails("returns a width-by-height matrix", async () => {
        for (const row of pix) {
          expect(
            await (row instanceof globalThis.Set || row instanceof globalThis.Map
              ? row.size
              : row.length),
          ).toEqualRuby(await subject.width);
        }
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a magenta pixel", () => {
        expect(pix[3][3]).toEqualRuby(magenta);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a gray pixel", () => {
        expect(pix[-4][-4]).toEqualRuby(gray);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a green pixel", () => {
        expect(pix[3][-4]).toEqualRuby(green);
      });

      // BLOCKED: mini-magick-lib-native-idioms

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
        await subject.crop(`${cols ?? ""}x${rows ?? ""}+3+3`);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a matrix of the requested height", async () => {
        expect(
          await (pix instanceof globalThis.Set || pix instanceof globalThis.Map
            ? pix.size
            : pix.length),
        ).toEqualRuby(rows);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a matrix of the requested width", async () => {
        for (const x of pix) {
          expect(
            await (x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length),
          ).toEqualRuby(cols);
        }
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a magenta pixel", () => {
        expect(pix[0][0]).toEqualRuby(magenta);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a gray pixel", () => {
        expect(pix[-1][-1]).toEqualRuby(gray);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a cyan pixel", () => {
        expect(pix[-1][0]).toEqualRuby(cyan);
      });

      // BLOCKED: mini-magick-lib-native-idioms

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
        await subject.resize("50%");
        await subject.colorspace("Gray");
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a matrix of the requested height", async () => {
        expect(
          await (pix instanceof globalThis.Set || pix instanceof globalThis.Map
            ? pix.size
            : pix.length),
        ).toEqualRuby(rows);
      });

      // BLOCKED: mini-magick-lib-native-idioms

      it.fails("returns a matrix of the requested width", async () => {
        for (const x of pix) {
          expect(
            await (x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length),
          ).toEqualRuby(cols);
        }
      });

      // BLOCKED: mini-magick-lib-native-idioms

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

      // BLOCKED: mini-magick-lib-native-idioms

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
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("is executed by #method_missing", async () => {
      await expect(async () => await subject.resize("20x30!")).toChange(
        async () => await subject.dimensions(),
        { to: [20, 30] },
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns self", async () => {
      expect(await subject.resize("20x30!")).toEqualRuby(subject);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("doesn't let ruby call #to_ary when flattening", async () => {
      await [subject, subject].flat(1);
    });
  });

  describe("#combine_options", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("chains multiple options and executes them in one command", async () => {
      await expect(
        async () => await subject.combineOptions(async (c: unknown) => await c.resize("20x30!")),
      ).toChange(async () => await subject.dimensions(), { to: [20, 30] });
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("doesn't allow calling of #format", async () => {
      await expect(
        (async () => await subject.combineOptions(async (c: unknown) => await c.format("png")))(),
      ).rejects.toSatisfy(
        (e: Error) =>
          e instanceof Error &&
          e.message === "you must call #format on a MiniMagick::Image directly",
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("clears the info only at the end", async () => {
      await subject.combineOptions(async (c: unknown) => {
        await c.resize("20x30!");
        return await subject.width;
      });
      expect(await subject.dimensions()).toEqual([20, 30]);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns self", async () => {
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

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("creates a composite of two images", async () => {
      const image = await subject.composite(otherImage);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("creates a composite of two images with mask", async () => {
      const image = await subject.composite(otherImage, "jpg", mask);
      expect(await image.isValid()).toBeRubyTruthy();
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("yields an optional block", async () => {
      await expect(async (b: unknown) => await subject.composite(otherImage, b)).toYieldWithArgs(
        Tool,
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("makes the composited image with the provided extension", async () => {
      const result = await subject.composite(otherImage, "png");
      expect(await result.path()).toEndWith(".png");
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("defaults the extension to the extension of the base image", async () => {
      let subject = await Image.open(imagePath("jpg"));
      let result = await subject.composite(otherImage);
      expect(await result.path()).toEndWith(".jpeg");
      subject = await Image.open(imagePath("gif"));
      result = await subject.composite(otherImage);
      expect(await result.path()).toEndWith(".gif");
    });
  });

  describe("#collapse!", () => {
    beforeEach(async () => {
      subject = await Image.open(imagePath("animation"));
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("collapses the image to one frame", async () => {
      await subject.collapseBang();
      expect(await (await subject.identify()).split("\n").length).toEqual(1);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("keeps the extension", async () => {
      await expect(async () => await subject.collapseBang()).not.toChange(
        async () => await subject.type(),
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("clears the info", async () => {
      await expect(async () => await subject.collapseBang()).toChange(
        async () =>
          await (subject instanceof globalThis.Set || subject instanceof globalThis.Map
            ? subject.size
            : subject.length),
      );
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns self", async () => {
      expect(await subject.collapseBang()).toEqualRuby(subject);
    });
  });

  describe("#destroy!", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("deletes the underlying tempfile", async () => {
      const image = await Image.open(imagePath());
      await image.destroyBang();
      expect(File.isExist(await image.path())).toEqual(false);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("doesn't delete when there is no tempfile", async () => {
      const image = new Image(imagePath());
      await image.destroyBang();
      expect(File.isExist(await image.path())).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("deletes .cache files generated by handling .mpc files", async () => {
      const image = await Image.open(imagePath());
      await image.format("mpc");
      await image.destroyBang();
      expect(
        File.isExist(
          (await rbStrSend(await image.path(), "sub", /mpc$/m, "cache")[0]) as
            | string
            | { toPath(): string },
        ),
      ).toEqual(false);
    });
  });

  describe("#identify", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns the output of identify", async () => {
      expect(await subject.identify()).toMatch(await subject.type());
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("yields an optional block", async () => {
      const output = await subject.identify(async (b: unknown) => await b.verbose());
      expect(output).toMatch("Format:");
    });
  });

  describe("#landscape?", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns true if image width greater than height", async () => {
      const image = await Image.open(imagePath("clipping_path"));
      expect(await image.isLandscape()).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns false if image width less than height", async () => {
      const image = await Image.open(imagePath("default"));
      expect(await image.isLandscape()).toEqual(false);
    });
  });

  describe("#portrait?", () => {
    // BLOCKED: mini-magick-lib-native-idioms
    it.fails("returns true if image width greater than height", async () => {
      const image = await Image.open(imagePath("default"));
      expect(await image.isPortrait()).toEqual(true);
    });

    // BLOCKED: mini-magick-lib-native-idioms

    it.fails("returns false if image width less than height", async () => {
      const image = await Image.open(imagePath("clipping_path"));
      expect(await image.isPortrait()).toEqual(false);
    });
  });
});
