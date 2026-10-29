import { rbFSend, rbObjRespondTo, ArgumentError, RuntimeError } from "@blazetrails/ruby-compat";
import WasmVips from "wasm-vips";
import { Chainable, chainableProxy } from "./chainable.js";
import { Error } from "./image-processing.js";
import { Processor as BaseProcessor } from "./processor.js";

type Options = Record<string, unknown>;
type Image = InstanceType<Awaited<ReturnType<typeof WasmVips>>["Image"]>;

/** @noRailsEquivalent PERMANENT */
export const vips = await WasmVips();

/** @noRailsEquivalent PERMANENT */
function atLeastLibvips(x: number, y: number): boolean {
  const major = Number(vips.version(0));
  const minor = Number(vips.version(1));
  return major > x || (major === x && minor >= y);
}

if (!atLeastLibvips(8, 6)) {
  throw new RuntimeError("image_processing/vips requires libvips 8.6+");
}

const MAX_COORD = 10_000_000;

/** @noRailsEquivalent PERMANENT */
function addAlpha(image: Image): Image {
  const maxAlpha =
    image.interpretation === "grey16" || image.interpretation === "rgb16" ? 65535 : 255;
  return image.bandjoin(maxAlpha);
}

const LOAD_OPTIONS = "memory access fail_on revalidate flags fail sequential disc";
const SAVE_OPTIONS = "keep background page_height profile strip";

/** @noRailsEquivalent PERMANENT */
const INTROSPECT_OPTIONAL_INPUT: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    csvload: `skip lines whitespace separator ${LOAD_OPTIONS}`,
    gifload: `n page ${LOAD_OPTIONS}`,
    heifload: `page n thumbnail unlimited ${LOAD_OPTIONS}`,
    jpegload: `shrink autorotate unlimited ${LOAD_OPTIONS}`,
    jxlload: `page n ${LOAD_OPTIONS}`,
    matrixload: LOAD_OPTIONS,
    pngload: `unlimited ${LOAD_OPTIONS}`,
    ppmload: LOAD_OPTIONS,
    radload: LOAD_OPTIONS,
    svgload: `dpi scale unlimited stylesheet high_bitdepth ${LOAD_OPTIONS}`,
    tiffload: `page n autorotate subifd unlimited ${LOAD_OPTIONS}`,
    vipsload: LOAD_OPTIONS,
    webpload: `page n scale ${LOAD_OPTIONS}`,
    csvsave: `separator ${SAVE_OPTIONS}`,
    gifsave: `dither effort bitdepth interframe_maxerror reuse interpalette_maxerror interlace keep_duplicate_frames ${SAVE_OPTIONS}`,
    heifsave: `Q bitdepth lossless compression effort subsample_mode encoder tune ${SAVE_OPTIONS}`,
    jpegsave: `Q optimize_coding interlace trellis_quant overshoot_deringing optimize_scans quant_table subsample_mode restart_interval ${SAVE_OPTIONS}`,
    jxlsave: `tier distance effort lossless Q bitdepth ${SAVE_OPTIONS}`,
    matrixsave: SAVE_OPTIONS,
    pngsave: `compression interlace filter palette Q dither bitdepth effort ${SAVE_OPTIONS}`,
    ppmsave: `format ascii bitdepth ${SAVE_OPTIONS}`,
    radsave: SAVE_OPTIONS,
    tiffsave: `compression Q predictor tile tile_width tile_height pyramid miniswhite bitdepth resunit xres yres bigtiff properties region_shrink level lossless depth subifd premultiply ${SAVE_OPTIONS}`,
    vipssave: SAVE_OPTIONS,
    webpsave: `Q lossless exact preset smart_subsample near_lossless alpha_q min_size kmin kmax effort target_size mixed smart_deblock passes ${SAVE_OPTIONS}`,
  }).map(([operation, names]) => [operation, names.split(" ")]),
);

const SAVER_SUFFIXES: Record<string, string> = {
  ".csv": "csvsave",
  ".gif": "gifsave",
  ".heic": "heifsave",
  ".heif": "heifsave",
  ".avif": "heifsave",
  ".jpg": "jpegsave",
  ".jpeg": "jpegsave",
  ".jpe": "jpegsave",
  ".jxl": "jxlsave",
  ".mat": "matrixsave",
  ".png": "pngsave",
  ".ppm": "ppmsave",
  ".pgm": "ppmsave",
  ".pbm": "ppmsave",
  ".pfm": "ppmsave",
  ".pnm": "ppmsave",
  ".hdr": "radsave",
  ".tif": "tiffsave",
  ".tiff": "tiffsave",
  ".v": "vipssave",
  ".vips": "vipssave",
  ".webp": "webpsave",
};

/** @noRailsEquivalent PERMANENT */
function vipsForeignFindLoad(filename: string): string | null {
  try {
    const loader = vips.Image.newFromFile(filename).getString("vips-loader");
    return Object.hasOwn(INTROSPECT_OPTIONAL_INPUT, loader) ? loader : null;
  } catch (error) {
    if (error instanceof WebAssembly.Exception) return null;
    throw error;
  }
}

/** @noRailsEquivalent PERMANENT */
function vipsForeignFindSave(filename: string): string | null {
  const suffix = /\.[^./]*$/.exec(filename)?.[0].toLowerCase() ?? "";
  return SAVER_SUFFIXES[suffix] ?? null;
}

/** @noRailsEquivalent PERMANENT */
function imageSet(image: Image, name: string, value: unknown): void {
  imageSetType(image, image.getTypeof(name), name, value);
}

/** @noRailsEquivalent PERMANENT */
function imageSetType(image: Image, gtype: number, name: string, value: unknown): void {
  switch (gtype) {
    case vips.Utils.typeFromName("gint"):
    case vips.Utils.typeFromName("gboolean"):
      return image.setInt(name, Number(value));
    case vips.Utils.typeFromName("gdouble"):
      return image.setDouble(name, value as number);
    case vips.Utils.typeFromName("gchararray"):
    case vips.Utils.typeFromName("VipsRefString"):
      return image.setString(name, value as string);
    case vips.Utils.typeFromName("VipsBlob"):
      return image.setBlob(
        name,
        typeof value === "string" ? new TextEncoder().encode(value) : (value as Uint8Array),
      );
    case vips.Utils.typeFromName("VipsArrayInt"):
      return image.setArrayInt(name, value as number[]);
    case vips.Utils.typeFromName("VipsArrayDouble"):
      return image.setArrayDouble(name, value as number[]);
    case vips.Utils.typeFromName("VipsImage"):
      return image.setImage(name, value as Image);
    default:
      throw new TypeError(`unsupported gtype for set ${gtype}`);
  }
}

class Processor extends BaseProcessor {
  declare readonly image: Image | string;

  static {
    this.accumulator("image", vips.Image);
  }

  static SHARPEN_MASK = vips.Image.newFromArray(
    [
      [-1, -1, -1],
      [-1, 32, -1],
      [-1, -1, -1],
    ] as unknown as number[],
    24,
  );

  static loadImage(
    pathOrImage: string | Image,
    { loader = null, autorot = true, ...options }: Options = {},
  ): Image {
    let image: Image;
    if (pathOrImage instanceof vips.Image) {
      image = pathOrImage;
    } else {
      const path = pathOrImage;

      if (loader != null && loader !== false) {
        image = rbFSend(vips.Image, `${loader}load`, path, options) as Image;
      } else {
        options = Processor.Utils.selectValidLoaderOptions(path, options);
        image = vips.Image.newFromFile(path, options);
      }
    }

    if (autorot != null && autorot !== false && !Object.hasOwn(options, "autorotate")) {
      image = image.autorot();
    }
    return image;
  }

  static supportsResizeOnLoad(): boolean {
    return true;
  }

  static saveImage(
    image: Image,
    path: string,
    { saver = null, quality = null, ...options }: Options = {},
  ): unknown {
    if (quality != null && quality !== false) options.Q = quality;

    if (saver != null && saver !== false) {
      return rbFSend(image, `${saver}save`, path, options);
    } else {
      options = Processor.Utils.selectValidSaverOptions(path, options);
      return image.writeToFile(path, options);
    }
  }

  resizeToLimit(width: number | null, height: number | null, options: Options = {}): Image {
    [width, height] = this.defaultDimensions(width, height);
    return this.thumbnail(width, height, { size: "down", ...options });
  }

  resizeToFit(width: number | null, height: number | null, options: Options = {}): Image {
    [width, height] = this.defaultDimensions(width, height);
    return this.thumbnail(width, height, options);
  }

  resizeToFill(width: number, height: number, options: Options = {}): Image {
    return this.thumbnail(width, height, { crop: "centre", ...options });
  }

  /** @missingRailsArgs gravity — PERMANENT */
  resizeAndPad(
    width: number,
    height: number,
    {
      gravity = "centre",
      extend = null,
      background = null,
      alpha = null,
      ...options
    }: Options = {},
  ): Image {
    let image = this.thumbnail(width, height, options);
    if (alpha != null && alpha !== false && !image.hasAlpha()) image = addAlpha(image);
    return image.gravity(gravity as string, width, height, {
      ...(extend != null ? { extend: extend as string } : {}),
      ...(background != null ? { background: background as number[] } : {}),
    });
  }

  resizeToCover(width: number, height: number, options: Options = {}): Image {
    const image =
      typeof this.image === "string"
        ? (this.constructor as typeof Processor).loadImage(this.image)
        : this.image;

    const imageRatio = image.width / image.height;
    const thumbnailRatio = width / height;

    if (imageRatio > thumbnailRatio) {
      width = MAX_COORD;
    } else {
      height = MAX_COORD;
    }

    return this.thumbnail(width, height, { ...options, crop: "none" });
  }

  rotate(degrees: number, options: Options = {}): Image {
    const image = this.image as Image;
    if ([90, 180, 270].includes(degrees) && Object.keys(options).length === 0) {
      const rotCommand = `rot${degrees}` as "rot90" | "rot180" | "rot270";
      return image[rotCommand]();
    } else {
      return image.similarity({ angle: degrees, ...options });
    }
  }

  composite(
    overlay: unknown,
    _mode: unknown = null,
    { mode = "over", gravity = "north-west", offset = null, ...options }: Options = {},
  ): Image {
    if (_mode != null && typeof _mode === "object" && !Array.isArray(_mode)) {
      ({ mode = "over", gravity = "north-west", offset = null, ...options } = _mode as Options);
      _mode = null;
    }
    const image = this.image as Image;

    if (_mode != null && _mode !== false) {
      const overlays = (Array.isArray(overlay) ? overlay : [overlay]).map((object) =>
        this.convertToImage(object, "overlay"),
      );

      return image.composite(overlays, _mode as Parameters<Image["composite"]>[1], options);
    }

    let overlayImage = this.convertToImage(overlay, "overlay");
    if (!overlayImage.hasAlpha()) overlayImage = addAlpha(overlayImage);

    if (offset != null && offset !== false) {
      const opposite: Record<string, string> = {
        north: "south",
        south: "north",
        east: "west",
        west: "east",
      };
      const oppositeGravity = String(gravity).replace(/\w+/g, (word) => opposite[word] ?? "");
      const [x, y] = offset as [number, number];
      overlayImage = overlayImage.gravity(
        oppositeGravity,
        overlayImage.width + x,
        overlayImage.height + y,
      );
    }

    overlayImage = overlayImage.gravity(gravity as string, image.width, image.height);

    return image.composite([overlayImage], mode as Parameters<Image["composite"]>[1], options);
  }

  set(...args: [string, unknown]): Image {
    const image = this.image as Image;
    imageSet(image, ...args);
    return image;
  }

  setType(...args: [number, string, unknown]): Image {
    const image = this.image as Image;
    imageSetType(image, ...args);
    return image;
  }

  setValue(...args: [string, unknown]): Image {
    const image = this.image as Image;
    imageSet(image, ...args);
    return image;
  }

  remove(...args: Parameters<Image["remove"]>): Image {
    const image = this.image as Image;
    image.remove(...args);
    return image;
  }

  /** @internal */
  private thumbnail(
    width: number,
    height: number,
    { sharpen = Processor.SHARPEN_MASK, ...options }: Options = {},
  ): Image {
    let image: Image;
    if (typeof this.image === "string") {
      image = vips.Image.thumbnail(this.image, width, { height, ...options });
    } else {
      const noRotate = atLeastLibvips(8, 8) ? { no_rotate: true } : { auto_rotate: false };
      options = { ...noRotate, ...options };

      image = this.image.thumbnailImage(width, { height, ...options });
    }

    if (sharpen != null && sharpen !== false) {
      image = image.conv(sharpen as Image, { precision: "integer" });
    }
    return image;
  }

  /** @internal */
  private defaultDimensions(width: number | null, height: number | null): [number, number] {
    if (width == null && height == null) {
      throw new Error("either width or height must be specified");
    }

    return [width ?? MAX_COORD, height ?? MAX_COORD];
  }

  /** @internal */
  private convertToImage(object: unknown, name: string): Image {
    if (object instanceof vips.Image) return object;

    let path: string;
    if (typeof object === "string") {
      path = object;
    } else if (rbObjRespondTo(object, "toPath")) {
      path = (object as { toPath(): string }).toPath();
    } else if (rbObjRespondTo(object, "path")) {
      path = (object as { path(): string }).path();
    } else {
      throw new ArgumentError(
        `${name} must be a Vips::Image, String, Pathname, or respond to #path`,
      );
    }

    return vips.Image.newFromFile(path);
  }

  static Utils = {
    selectValidLoaderOptions(sourcePath: string, options: Options): Options {
      const loader = vipsForeignFindLoad(sourcePath);
      return loader != null ? Processor.Utils.selectValidOptions(loader, options) : options;
    },

    selectValidSaverOptions(destinationPath: string, options: Options): Options {
      const saver = vipsForeignFindSave(destinationPath);
      return saver != null ? Processor.Utils.selectValidOptions(saver, options) : options;
    },

    selectValidOptions(operationName: string, options: Options): Options {
      const operationOptions = INTROSPECT_OPTIONAL_INPUT[operationName];

      return Object.fromEntries(
        Object.entries(options).filter(([name]) => operationOptions.includes(name)),
      );
    },
  };
}

const ImageProcessingVips = {
  ...Chainable,
  Processor,

  isValidImage(file: { path(): string }): boolean {
    try {
      vips.Image.newFromFile(file.path(), { access: "sequential" }).avg();
      return true;
    } catch (error) {
      if (error instanceof WebAssembly.Exception) return false;
      throw error;
    }
  },
};

export const Vips = chainableProxy(ImageProcessingVips);
