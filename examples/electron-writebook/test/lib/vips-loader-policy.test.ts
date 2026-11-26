import { describe, expect, it, type TestContext } from "vitest";
import "../test-helper.ts";
import { vips as Vips } from "@blazetrails/image-processing/vips";

// libvips selects a loader from a file's actual bytes, not from its declared content type. These
// tests pin which loader is selected for each file type under the app's configured loader policy
// (config/initializers/vips.ts).
//
// wasm-vips binds no vips_foreign_find_load, so a probe opens the file and reads the
// `vips-loader` it was opened with: the nickname of the class Ruby's assertion names
// (VipsForeignLoadPngFile is `pngload`).

// Emscripten's in-memory filesystem, which wasm-vips exposes untyped.
const FS = (
  Vips as unknown as {
    FS: { writeFile(path: string, data: Uint8Array | string): void; unlink(path: string): void };
  }
).FS;

// Header bytes are enough for libvips to identify a format; native types are encoded live, exotic
// ones are represented by their magic bytes.
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const BMP = latin1("BM" + "\x00".repeat(8) + "\x36\x00\x00\x00" + "\x00".repeat(40));
const PSD = latin1("8BPS" + "\x00\x01" + "\x00".repeat(26));
const ICO = latin1("\x00\x00\x01\x00\x01\x00" + "\x00".repeat(16));
const SVG = latin1(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>`);

function encode(ext: string): Uint8Array {
  return Vips.Image.black(8, 8).add(128).cast("uchar").writeToBuffer(`.${ext}`);
}

function loaderFor(bytes: Uint8Array): string | null {
  const path = "/tmp/loader_probe.img";
  FS.writeFile(path, bytes);
  try {
    return Vips.Image.newFromFile(path).getString("vips-loader");
  } catch {
    return null;
  } finally {
    FS.unlink(path);
  }
}

// Invoke a specific libvips loader directly and assert it is refused because the
// operation is blocked (rather than because the bytes are not a valid image).
function assertLoaderBlocked(ctx: TestContext, operation: string, extension: string): void {
  const path = `/tmp/blocked_loader${extension}`;
  FS.writeFile(path, "not an image");
  try {
    const loader = (Vips.Image as unknown as Record<string, (path: string) => unknown>)[operation];
    if (typeof loader !== "function") {
      ctx.skip(`libvips does not support ${operation} on this system`);
    }
    let actual = "";
    expect(() => {
      try {
        loader(path);
      } catch (error) {
        actual = String((error as Error).message);
        throw error;
      }
    }).toThrow();
    expect(actual).toMatch(new RegExp(`^${operation}: operation is blocked$`, "m"));
  } finally {
    FS.unlink(path);
  }
}

describe("VipsLoaderPolicyTest", () => {
  it("loads PNG", () => {
    expect(loaderFor(encode("png"))).toBe("pngload");
  });

  it("loads GIF", () => {
    expect(loaderFor(encode("gif"))).toBe("gifload");
  });

  it("loads JPEG", () => {
    expect(loaderFor(encode("jpg"))).toBe("jpegload");
  });

  it("loads TIFF", () => {
    expect(loaderFor(encode("tif"))).toBe("tiffload");
  });

  it("loads WebP", () => {
    expect(loaderFor(encode("webp"))).toBe("webpload");
  });

  // wasm-vips is built without libheif, so it has no heifload.
  it.skip("loads AVIF", () => {});

  // wasm-vips is built without libheif, so it has no heifload.
  it.skip("loads HEIC", () => {});

  it("denies BMP through magickload", () => {
    expect(loaderFor(BMP)).toBeNull();
  });

  it("denies PSD through magickload", () => {
    expect(loaderFor(PSD)).toBeNull();
  });

  it("denies ICO through magickload", () => {
    expect(loaderFor(ICO)).toBeNull();
  });

  it("denies SVG through svgload", () => {
    expect(loaderFor(SVG)).toBeNull();
  });

  it("denies OpenSlide files through openslideload", (ctx) => {
    // OpenSlide files can segfault the embedded sqlite in forked parallel workers
    assertLoaderBlocked(ctx, "openslideload", ".svs");
  });

  it("denies FITS files through fitsload", (ctx) => {
    assertLoaderBlocked(ctx, "fitsload", ".fits");
  });

  it("denies MATLAB files through matload", (ctx) => {
    assertLoaderBlocked(ctx, "matload", ".mat");
  });

  it("denies NIFTI files through niftiload", (ctx) => {
    assertLoaderBlocked(ctx, "niftiload", ".nii");
  });

  it("denies RAW files through dcrawload", (ctx) => {
    assertLoaderBlocked(ctx, "dcrawload", ".raw");
  });

  it("denies VIPS files through vipsload", (ctx) => {
    assertLoaderBlocked(ctx, "vipsload", ".vips");
  });
});
