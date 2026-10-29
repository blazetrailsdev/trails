import {
  block as blockPass,
  Dir,
  File,
  format,
  isPlainHash,
  TypeError,
  rbBlockGivenP,
  rbGetKwargs,
  rbInspect,
  rbFSend,
  rbObjAsString,
  rbObjRespondTo,
  ArgumentError,
  warn,
} from "@blazetrails/ruby-compat";
import * as MiniMagickGem from "@blazetrails/mini-magick";
import { Tool, type CliTool } from "@blazetrails/mini-magick/tool";
import { Chainable, chainableProxy } from "./chainable.js";
import { Error } from "./image-processing.js";
import { Processor as BaseProcessor } from "./processor.js";

type Options = Record<string, unknown>;

class Processor extends BaseProcessor {
  declare readonly magick: CliTool;

  static {
    this.accumulator("magick", Tool);
  }

  static SHARPEN_PARAMETERS = { radius: 0, sigma: 1 };

  static loadImage(
    pathOrMagick: string | CliTool,
    { loader = null, page = null, geometry = null, autoOrient = true, ...options }: Options = {},
  ): CliTool {
    let magick: CliTool;
    if (pathOrMagick instanceof Tool) {
      magick = pathOrMagick;
    } else {
      const sourcePath = pathOrMagick;
      magick = ImageProcessingMiniMagick.convertShim() as CliTool;

      Processor.Utils.applyOptions(magick, options);

      let input = sourcePath;
      if (loader != null && loader !== false) input = `${loader}:${input}`;
      if (page != null && page !== false) input += `[${page}]`;
      if (geometry != null && geometry !== false) input += `[${geometry}]`;

      magick.append(input);
    }

    if (autoOrient != null && autoOrient !== false) magick.autoOrient();
    return magick;
  }

  static async saveImage(
    magick: CliTool,
    destinationPath: string,
    { allowSplitting = false, ...options }: Options = {},
  ): Promise<void> {
    Processor.Utils.applyOptions(magick, options);

    magick.append(destinationPath);
    await magick.call();

    if (allowSplitting == null || allowSplitting === false) {
      await Processor.Utils.disallowSplitLayersBang(destinationPath);
    }
  }

  resizeToLimit(width: unknown, height: unknown, options: Options = {}): CliTool {
    return this.thumbnail(`${rbObjAsString(width)}x${rbObjAsString(height)}>`, options);
  }

  resizeToFit(width: unknown, height: unknown, options: Options = {}): CliTool {
    return this.thumbnail(`${rbObjAsString(width)}x${rbObjAsString(height)}`, options);
  }

  resizeToFill(
    width: unknown,
    height: unknown,
    { gravity = "Center", ...options }: Options = {},
  ): CliTool {
    this.thumbnail(`${rbObjAsString(width)}x${rbObjAsString(height)}^`, options);
    this.magick.gravity(gravity);
    this.magick.background(this.color("transparent"));
    return this.magick.extent(`${rbObjAsString(width)}x${rbObjAsString(height)}`);
  }

  resizeAndPad(
    width: unknown,
    height: unknown,
    { background = "transparent", gravity = "Center", ...options }: Options = {},
  ): CliTool {
    this.thumbnail(`${rbObjAsString(width)}x${rbObjAsString(height)}`, options);
    this.magick.background(this.color(background));
    this.magick.gravity(gravity);
    return this.magick.extent(`${rbObjAsString(width)}x${rbObjAsString(height)}`);
  }

  resizeToCover(width: unknown, height: unknown, options: Options = {}): CliTool {
    return this.thumbnail(`${rbObjAsString(width)}x${rbObjAsString(height)}^`, options);
  }

  crop(...args: unknown[]): CliTool {
    switch (args.length) {
      case 1:
        return this.magick.crop(...args);
      case 4:
        return this.magick.crop(`${args[2]}x${args[3]}+${args[0]}+${args[1]}`);
      default:
        throw new ArgumentError(`wrong number of arguments (expected 1 or 4, got ${args.length})`);
    }
  }

  rotate(degrees: unknown, { background = null }: Options = {}): CliTool {
    if (background != null && background !== false) {
      this.magick.background(this.color(background));
    }
    return this.magick.rotate(degrees);
  }

  composite(
    overlay: unknown = ":none",
    kwargs: Options | ((magick: CliTool) => unknown) = {},
    block?: (magick: CliTool) => unknown,
  ): CliTool {
    if (rbBlockGivenP(kwargs)) {
      block = kwargs as (magick: CliTool) => unknown;
      kwargs = {};
    }
    const {
      mask = null,
      mode: modeOption = null,
      gravity = null,
      offset = null,
      args = null,
      ...options
    } = kwargs as Options;
    let mode = modeOption;
    if (overlay === ":none") return this.magick.composite();

    if (Object.hasOwn(options, "compose")) {
      warn(
        "[IMAGE_PROCESSING] The :compose parameter in #composite has been renamed to :mode, the :compose alias will be removed in ImageProcessing 2.",
      );
      mode = options.compose;
    }

    let geometry: unknown;
    if (Object.hasOwn(options, "geometry")) {
      warn(
        '[IMAGE_PROCESSING] The :geometry parameter in #composite has been deprecated and will be removed in ImageProcessing 2. Use :offset instead, e.g. `geometry: "+10+15"` should be replaced with `offset: [10, 15]`.',
      );
      geometry = options.geometry;
    }
    if (offset != null && offset !== false) geometry = format("%+d%+d", ...(offset as number[]));

    const overlayPath = this.convertToPath(overlay, "overlay");
    const maskPath = mask != null && mask !== false ? this.convertToPath(mask, "mask") : null;

    this.magick.append(overlayPath);
    if (maskPath != null) this.magick.append(maskPath);

    if (mode != null && mode !== false) this.magick.compose(mode);
    if (args != null && args !== false) this.define({ compose: { args } });

    if (gravity != null && gravity !== false) this.magick.gravity(gravity);
    if (geometry != null && geometry !== false) this.magick.geometry(geometry);

    if (block != null) block(this.magick);

    return this.magick.composite();
  }

  define(options: string | Record<string, Options>): CliTool {
    if (typeof options === "string") return this.magick.define(options);
    return Processor.Utils.applyDefine(this.magick, options);
  }

  limits(options: Options): CliTool {
    for (const [type, value] of Object.entries(options)) {
      this.magick.args.unshift("-limit", String(type), String(value));
    }
    return this.magick;
  }

  append(...args: unknown[]): CliTool {
    if (args.length === 0) {
      return this.magick.methodMissing("append");
    } else {
      return this.magick.mergeBang(args);
    }
  }

  /** @internal */
  private color(value: unknown): string {
    if (value === "transparent") return "rgba(255,255,255,0.0)";
    if (Array.isArray(value) && value.length === 3) return `rgb(${value.join(",")})`;
    if (Array.isArray(value) && value.length === 4) return `rgba(${value.join(",")})`;
    if (typeof value === "string") return value;

    throw new ArgumentError(
      `unrecognized color format: ${rbInspect(value)} (must be one of: string, 3-element RGB array, 4-element RGBA array)`,
    );
  }

  /** @internal */
  private thumbnail(geometry: string, keywords: { sharpen?: unknown } = {}): CliTool {
    rbGetKwargs(keywords, ["sharpen"]);
    let { sharpen = null } = keywords;
    this.magick.resize(geometry);

    if (sharpen != null && sharpen !== false) {
      if (!isPlainHash(sharpen)) {
        throw new TypeError(`no implicit conversion of ${rbInspect(sharpen)} into Hash`);
      }
      sharpen = { ...Processor.SHARPEN_PARAMETERS, ...sharpen };
      this.magick.sharpen(`${(sharpen as Options).radius}x${(sharpen as Options).sigma}`);
    }

    return this.magick;
  }

  /** @internal */
  private convertToPath(file: unknown, name: string): string {
    if (typeof file === "string") {
      return file;
    } else if (rbObjRespondTo(file, "toPath")) {
      return (file as { toPath(): string }).toPath();
    } else if (rbObjRespondTo(file, "path")) {
      return (file as { path(): string }).path();
    } else {
      throw new ArgumentError(`${name} must be a String, Pathname, or respond to #path`);
    }
  }

  static Utils = {
    async disallowSplitLayersBang(destinationPath: string): Promise<void> {
      const layers = await Dir.globAsync(destinationPath.replace(/(\.\w+)?$/, "-*$&"));

      if (layers.length > 0) {
        for (const path of layers) await File.deleteAsync(path);
        throw new Error(
          "Source format is multi-layer, but destination format is single-layer. If you care only about the first layer, add `.loader(page: 0)` to your pipeline. If you want to process each layer, see https://github.com/janko/image_processing/wiki/Splitting-a-PDF-into-multiple-images or use `.saver(allow_splitting: true)`.",
        );
      }
    },

    applyOptions(magick: CliTool, { define = {}, ...options }: Options): void {
      for (const [option, value] of Object.entries(options)) {
        if (value === true || value == null) {
          rbFSend(magick, option);
        } else if (value === false) {
          (rbFSend(magick, option) as CliTool).plus();
        } else {
          rbFSend(magick, option, ...(Array.isArray(value) ? value : [value]));
        }
      }

      Processor.Utils.applyDefine(magick, define as Record<string, Options>);
    },

    applyDefine(magick: CliTool, options: Record<string, Options>): CliTool {
      for (const [rawNamespace, settings] of Object.entries(options)) {
        const namespace = rawNamespace.replaceAll("_", "-");

        for (const [rawKey, value] of Object.entries(settings)) {
          const key = rawKey.replaceAll("_", "-");

          magick.define(`${namespace}:${key}=${value}`);
        }
      }

      return magick;
    },
  };
}

const ImageProcessingMiniMagick = {
  ...Chainable,
  Processor,

  convertShim(block?: (convert: CliTool) => unknown): CliTool | Promise<unknown> {
    if (rbObjRespondTo(MiniMagickGem.MiniMagick, "convert")) {
      return MiniMagickGem.MiniMagick.convert(...(block ? [blockPass(block)] : []));
    } else {
      return Tool.Convert.new(...(block ? [blockPass(block)] : []));
    }
  },

  async isValidImage(file: { path(): string }): Promise<boolean> {
    try {
      await ImageProcessingMiniMagick.convertShim((convert) => {
        convert.append(file.path());
        convert.append("null:");
      });
      return true;
    } catch (error) {
      if (error instanceof MiniMagickGem.Error) return false;
      throw error;
    }
  },
};

export const MiniMagick = chainableProxy(ImageProcessingMiniMagick);
