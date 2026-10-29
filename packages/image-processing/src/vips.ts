import { rbFSend, rbObjRespondTo, ArgumentError } from "@blazetrails/ruby-compat";
import WasmVips from "wasm-vips";
import { Chainable, chainableProxy } from "./chainable.js";
import { Error } from "./image-processing.js";
import { Processor as BaseProcessor } from "./processor.js";

type Options = Record<string, unknown>;
type Image = InstanceType<Awaited<ReturnType<typeof WasmVips>>["Image"]>;

/** @noRailsEquivalent PERMANENT */
export const vips = await WasmVips();

if (!(Number(vips.version(0)) > 8 || (vips.version(0) === 8 && Number(vips.version(1)) >= 6))) {
  throw new globalThis.Error("image_processing/vips requires libvips 8.6+");
}

const MAX_COORD = 10_000_000;

function addAlpha(image: Image): Image {
  const maxAlpha =
    image.interpretation === "grey16" || image.interpretation === "rgb16" ? 65535 : 255;
  return image.bandjoin(maxAlpha);
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

  /** @missingRailsCall select_valid_loader_options — CONVERGEABLE image-processing-vips-loader-saver-option-introspection */
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

  /** @missingRailsCall select_valid_saver_options — CONVERGEABLE image-processing-vips-loader-saver-option-introspection */
  static saveImage(
    image: Image,
    path: string,
    { saver = null, quality = null, ...options }: Options = {},
  ): unknown {
    if (quality != null && quality !== false) options.Q = quality;

    if (saver != null && saver !== false) {
      return rbFSend(image, `${saver}save`, path, options);
    } else {
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

    if (image.width * height > width * image.height) {
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

  remove(name: string): Image {
    const image = this.image as Image;
    image.remove(name);
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
      const atLeast88 =
        Number(vips.version(0)) > 8 || (vips.version(0) === 8 && Number(vips.version(1)) >= 8);
      const noRotate = atLeast88 ? { no_rotate: true } : { auto_rotate: false };
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
}

const ImageProcessingVips = {
  ...Chainable,
  Processor,

  isValidImage(file: { path(): string }): boolean {
    try {
      vips.Image.newFromFile(file.path(), { access: "sequential" }).avg();
      return true;
    } catch {
      return false;
    }
  },
};

export const Vips = chainableProxy(ImageProcessingVips);
