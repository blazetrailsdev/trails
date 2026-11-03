import "./test-helpers/database/setup.js";
import { assertChanges } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { LoadError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, type TestContext } from "vitest";
import { ActiveStorage } from "./active-storage.js";
import { Current } from "./current.js";
import { Blob } from "./blob.js";
import { InvariableError } from "./errors.js";
import {
  UnsupportedImageProcessingArgument,
  UnsupportedImageProcessingMethod,
} from "./transformers/image-processing-transformer.js";
import { createFileBlob, fileFixture, readImage } from "./test-helpers/test-helper.js";
import type { Variant } from "./variant.js";

describe("ActiveStorage::VariantTest", { timeout: 30_000 }, () => {
  let wasTracking: boolean;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    wasTracking = ActiveStorage.trackVariants;
    ActiveStorage.trackVariants = false;
    Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  });

  afterEach(() => {
    ActiveStorage.trackVariants = wasTracking;
    Current.reset();
  });

  async function processVariantsWith(
    ctx: TestContext,
    processor: string,
    block: () => Promise<unknown>,
  ): Promise<void> {
    const previousProcessor = ActiveStorage.variantProcessor;
    try {
      ActiveStorage.variantProcessor = processor;
      await block();
    } catch (error) {
      if (!(error instanceof LoadError)) throw error;
      ctx.skip(`Variant processor :${processor} is not installed`);
    } finally {
      ActiveStorage.variantProcessor = previousProcessor;
    }
  }

  const variantOf = (blob: Blob, transformations: Record<string, unknown>) =>
    blob.variant(transformations) as Variant;

  it("variations have the same key for different types of the same transformation", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variantA = variantOf(blob, { resizeToLimit: [100, 100] });
    const variantB = variantOf(blob, { resizeToLimit: [100, 100] });

    expect(variantB.key).toBe(variantA.key);
  });

  it("resized variation of JPEG blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { resizeToLimit: [100, 100] }).processed();
    expect(variant.url()).toMatch(/racecar\.jpg/);

    const image = await readImage(variant);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
  });

  it("resized and monochrome variation of JPEG blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, {
      resizeToLimit: [100, 100],
      colourspace: "b-w",
    }).processed();
    expect(variant.url()).toMatch(/racecar\.jpg/);

    const image = await readImage(variant);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
    expect(await image.colorspace()).toMatch(/Gray/);
  });

  it("monochrome with default variant_processor", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { colourspace: "b-w" }).processed();
    const image = await readImage(variant);
    expect(await image.colorspace()).toMatch(/Gray/);
  });

  it("disabled variation of JPEG blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, {
      resizeToLimit: [100, 100],
      colourspace: "srgb",
    }).processed();
    expect(variant.url()).toMatch(/racecar\.jpg/);

    const image = await readImage(variant);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
    expect(await image.colorspace()).toMatch(/RGB/);
  });

  it("center-weighted crop of JPEG blob using :resize_to_fill", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { resizeToFill: [100, 100] }).processed();
    expect(variant.url()).toMatch(/racecar\.jpg/);

    const image = await readImage(variant);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(100);
  });

  // BLOCKED: wasm-vips-magickload-for-psd-ico-bmp
  it.skip("resized variation of PSD blob", async () => {
    const blob = await createFileBlob({
      filename: "icon.psd",
      contentType: "image/vnd.adobe.photoshop",
    });
    const variant = await variantOf(blob, { resizeToLimit: [20, 20] }).processed();
    expect(variant.url()).toMatch(/icon\.png/);

    const image = await readImage(variant);
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(20);
    expect(await image.height()).toBe(20);
  });

  // BLOCKED: wasm-vips-magickload-for-psd-ico-bmp
  it.skip("resized variation of ICO blob", async () => {
    const blob = await createFileBlob({
      filename: "favicon.ico",
      contentType: "image/vnd.microsoft.icon",
    });
    const variant = await variantOf(blob, { resizeToLimit: [20, 20] }).processed();
    expect(variant.url()).toMatch(/icon\.png/);

    const image = await readImage(variant);
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(20);
    expect(await image.height()).toBe(20);
  });

  it("resized variation of TIFF blob", async () => {
    const blob = await createFileBlob({ filename: "racecar.tif" });
    const variant = await variantOf(blob, { resizeToLimit: [50, 50] }).processed();
    expect(variant.url()).toMatch(/racecar\.png/);

    const image = await readImage(variant);
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(50);
    expect(await image.height()).toBe(33);
  });

  // BLOCKED: wasm-vips-magickload-for-psd-ico-bmp
  it.skip("resized variation of BMP blob", async () => {
    const blob = await createFileBlob({ filename: "colors.bmp", contentType: "image/bmp" });
    const variant = await variantOf(blob, { resizeToLimit: [15, 15] }).processed();
    expect(variant.url()).toMatch(/colors\.png/);

    const image = await readImage(variant);
    expect(await image.type()).toBe("PNG");
    expect(await image.width()).toBe(15);
    expect(await image.height()).toBe(8);
  });

  it("resized variation of WEBP blob", async () => {
    const blob = await createFileBlob({ filename: "valley.webp" });
    const variant = await variantOf(blob, { resizeToLimit: [50, 50] }).processed();
    expect(variant.url()).toMatch(/valley\.webp/);

    const image = await readImage(variant);
    expect(await image.type()).toBe("WEBP");
    expect(await image.width()).toBe(50);
    expect([33, 34]).toContain(await image.height());
  });

  it("optimized variation of GIF blob", async (ctx) => {
    const blob = await createFileBlob({ filename: "image.gif", contentType: "image/gif" });

    await processVariantsWith(ctx, "vips", async () => {
      await expect(
        variantOf(blob, {
          saver: { optimizeGifFrames: true, optimizeGifTransparency: true },
        }).processed(),
      ).resolves.toBeDefined();
    });

    await processVariantsWith(ctx, "mini_magick", async () => {
      await expect(variantOf(blob, { layers: "Optimize" }).processed()).resolves.toBeDefined();
    });
  });

  it("PNG variation of JPEG blob with lowercase format", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { format: "png" }).processed();
    expect(variant.filename.toString()).toBe("racecar.png");
    expect(variant.contentType).toBe("image/png");
    expect(await (await readImage(variant)).type()).toBe("PNG");
  });

  it("PNG variation of JPEG blob with uppercase format", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { format: "PNG" }).processed();
    expect(variant.filename.toString()).toBe("racecar.png");
    expect(variant.contentType).toBe("image/png");
    expect(await (await readImage(variant)).type()).toBe("PNG");
  });

  it("variation of invariable blob", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    expect(() => blob.variant({ resizeToLimit: [100, 100] })).toThrow(InvariableError);
    expect(() => blob.variant({ resizeToLimit: [100, 100] })).toThrow(
      /blob with ID=\d+ and content_type=application\/pdf/,
    );
  });

  it("url doesn't grow in length despite long variant options", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      const variant = await variantOf(blob, { font: "a".repeat(10_000) }).processed();
      expect(variant.url().length).toBeLessThan(785);
    });
  });

  it("thumbnail variation of JPEG blob processed with VIPS", async (ctx) => {
    await processVariantsWith(ctx, "vips", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      const variant = await variantOf(blob, { thumbnailImage: 100 }).processed();

      const image = await readImage(variant);
      expect(await image.width()).toBe(100);
      expect(await image.height()).toBe(67);
    });
  });

  it("thumbnail variation of extensionless GIF blob processed with VIPS", async (ctx) => {
    await processVariantsWith(ctx, "vips", async () => {
      const blob = await Blob.createAndUploadBang({
        io: fileFixture("image.gif").open(),
        filename: "image",
        contentType: "image/gif",
      });
      const variant = await variantOf(blob, { resizeToFit: [100, 100] }).processed();

      const image = await readImage(variant);
      expect(variant.filename.toString()).toBe("image.gif");
      expect(variant.contentType).toBe("image/gif");
      expect(await image.type()).toBe("GIF");
      expect(await image.width()).toBe(100);
      expect(await image.height()).toBe(100);
    });
  });

  it("passes content_type on upload", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });

    const service = blob.service as unknown as { upload: (...args: unknown[]) => unknown };
    const mockUpload = (_key: unknown, _io: unknown, options: { contentType?: unknown } = {}) => {
      expect(options.contentType).toBe("image/jpeg");
    };

    service.upload = mockUpload;
    try {
      await variantOf(blob, { resizeToLimit: [100, 100] }).processed();
    } finally {
      delete (service as { upload?: unknown }).upload;
    }
  });

  it("content_type not recognized by marcel isn't included as variable", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });

    await blob.update({ content_type: "image/jpg" });

    expect(() => blob.variant({ resizeToLimit: [100, 100] })).toThrow(InvariableError);

    const internals = blob as unknown as { format(): unknown; defaultVariantFormat(): unknown };
    expect(internals.format()).toBeNull();
    expect(internals.defaultVariantFormat()).toBe("png");
  });

  it("variations with dangerous argument string raise UnsupportedImageProcessingArgument", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(variantOf(blob, { resize: "-PaTh /tmp/file.erb" }).processed()).rejects.toThrow(
        UnsupportedImageProcessingArgument,
      );
    });
  });

  it("variations with dangerous argument array raise UnsupportedImageProcessingArgument", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(
        variantOf(blob, { resize: [123, "-write", "/tmp/file.erb"] }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);
    });
  });

  it("variations with dangerous argument in a nested array raise UnsupportedImageProcessingArgument", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(
        variantOf(blob, {
          resize: [123, ["-write", "/tmp/file.erb"], "/tmp/file.erb"],
        }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);

      await expect(
        variantOf(blob, {
          resize: [123, { "-write /tmp/file.erb": "something" }, "/tmp/file.erb"],
        }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);
    });
  });

  it("variations with dangerous argument hash raise UnsupportedImageProcessingArgument", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(
        variantOf(blob, { saver: { "-write": "/tmp/file.erb" } }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);
    });
  });

  it("variations with dangerous argument in a nested hash raise UnsupportedImageProcessingArgument", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(
        variantOf(blob, { saver: { something: { "-write": "/tmp/file.erb" } } }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);

      await expect(
        variantOf(blob, { saver: { something: ["-write", "/tmp/file.erb"] } }).processed(),
      ).rejects.toThrow(UnsupportedImageProcessingArgument);
    });
  });

  it("variations with unsupported methods raise UnsupportedImageProcessingMethod", async (ctx) => {
    await processVariantsWith(ctx, "mini_magick", async () => {
      const blob = await createFileBlob({ filename: "racecar.jpg" });
      await expect(variantOf(blob, { system: "touch /tmp/dangerous" }).processed()).rejects.toThrow(
        UnsupportedImageProcessingMethod,
      );
    });
  });

  it("destroy deletes file from service", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const variant = await variantOf(blob, { resizeToLimit: [100, 100] }).processed();

    await assertChanges(
      () => blob.service.isExist(variant.key),
      null,
      { from: true, to: false },
      async () => {
        await variant.destroy();
      },
    );
  });
});
