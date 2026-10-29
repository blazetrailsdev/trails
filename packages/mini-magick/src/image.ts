import { Info } from "./image/info.js";
import { Utilities } from "./utilities.js";
import {
  StringIO,
  eachSlice,
  IO,
  File,
  rbModDefineMethod,
  rbFSend,
  PROTOCOL_PROBES,
  rbObjClass,
  rbHash,
  excSetupMessage,
  ArgumentError,
  pack,
  unpack,
  rbStrEnumerateLines,
  Pathname,
  FileUtils,
  URI,
  block as blockPass,
  matchOperator,
  rbObjAsString,
} from "@blazetrails/ruby-compat";
import type { CliTool } from "./tool.js";
import { Invalid, Error } from "./mini-magick.js";
import { MiniMagick } from "./mini-magick.js";
import { Shell } from "./shell.js";
import type { Tempfile, HTTP } from "@blazetrails/ruby-compat";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Image {
  type(...args: unknown[]): Promise<string>;
  width(...args: unknown[]): Promise<number>;
  height(...args: unknown[]): Promise<number>;
  dimensions(...args: unknown[]): Promise<[number, number]>;
  size(...args: unknown[]): Promise<number>;
  humanSize(...args: unknown[]): Promise<string>;
  colorspace(...args: unknown[]): Promise<string>;
  exif(...args: unknown[]): Promise<Record<string, string>>;
  resolution(...args: unknown[]): Promise<number[]>;
  signature(...args: unknown[]): string | Promise<string>;
  data(...args: unknown[]): Promise<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Image {
  declare _path: string;
  declare _tempfile: Tempfile | null;
  declare _info: Info;
  static read(
    stream: string | Uint8Array | StringIO<string | Uint8Array> | Tempfile | IO,
    ext: string | null = null,
  ) {
    if (typeof stream === "string" || stream instanceof Uint8Array) {
      stream = new StringIO(stream);
    }
    return this.create(ext, (file) => IO.copyStream(stream, file));
  }

  static async importPixels(
    blob: string | Uint8Array | StringIO<string | Uint8Array> | Tempfile,
    columns: number,
    rows: number,
    depth: number,
    map: string,
    format: string = "png",
  ) {
    return (async (image: Image) => {
      const outputPath = image.path.replace(/\.\w+$/m, `.${format}`);
      await MiniMagick.convert(
        blockPass((convert: CliTool) => {
          convert.size(`${columns}x${rows}`);
          convert.depth(depth);
          convert.append(`${map}:${image.path}`);
          convert.append(outputPath);
        }),
      );
      image._path = image._info._path = outputPath;
      return image;
    })(this.read(blob, ".dat"));
  }

  static open(
    pathOrUrl: string | Pathname,
    ext: string | Record<string, unknown> | null = null,
    options: Record<string, unknown> = {},
  ): Image | Promise<Image> {
    if (typeof ext === "object" && ext !== null) {
      options = ext;
      ext = null;
    }
    let uri, pathname;
    if (/^(https?|ftp):\/\//.test(String(pathOrUrl))) {
      uri = URI.parse(String(pathOrUrl)) as HTTP;
      if (ext == null) ext = File.extname(uri.path ?? "").replace(/:.*/, "");
      return uri.open(
        options,
        blockPass((file: Tempfile | StringIO<string | Uint8Array>) =>
          this.read(file, ext as string),
        ),
      ) as Promise<Image>;
    } else {
      pathname = pathOrUrl instanceof Pathname ? pathOrUrl : new Pathname(pathOrUrl);
      if (ext == null) ext = File.extname(String(pathname));
      return pathname.open({ binmode: true, ...options }, (file: File) =>
        this.read(file, ext as string),
      ) as Image;
    }
  }

  static create(ext: string | null = null, block?: (file: Tempfile) => unknown) {
    const tempfile = Utilities.tempfile((ext ?? "").toLowerCase(), block);
    return new this(tempfile.path()!, tempfile);
  }

  static attribute(name: string, key: string = name) {
    return rbModDefineMethod(
      this,
      name.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
      function (this: Image, ...args: unknown[]) {
        if (args.some((x) => x != null && x !== false) && name !== "resolution") {
          return this.mogrify(undefined, (b) => rbFSend(b, name, ...args));
        } else {
          return this._info.get(key, ...args);
        }
      },
    );
  }

  get path() {
    return this._path;
  }

  get tempfile() {
    return this._tempfile;
  }

  constructor(
    inputPath: string | Pathname,
    tempfile: Tempfile | null = null,
    block?: (builder: CliTool) => unknown,
  ) {
    this._path = String(inputPath);
    this._tempfile = tempfile;
    this._info = new Info(this._path);
    if (block != null) {
      (this._info._pending = this.combineOptions(block)).catch(() => {});
    }
    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || name in target || PROTOCOL_PROBES.has(name))
          return Reflect.get(target, name, receiver);
        return (...args: unknown[]) =>
          (receiver as Image).methodMissing(
            name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
            ...args,
          );
      },
    });
  }

  equals(other: Image) {
    return rbObjClass(this) === rbObjClass(other) && this.signature() === other.signature();
  }

  eql(other: Image) {
    return this.equals(other);
  }

  hash() {
    return rbHash(this.signature());
  }

  async toBlob() {
    await this._info._pending;
    return File.binread(this.path);
  }

  async isValid() {
    try {
      await this.validateBang();
      return true;
    } catch (error) {
      if (error instanceof Invalid) {
        return false;
      } else {
        throw error;
      }
    }
  }

  async validateBang() {
    try {
      return await this.identify();
    } catch (error) {
      if (error instanceof Error) {
        throw excSetupMessage(new Invalid(error.message), error);
      } else {
        throw error;
      }
    }
  }

  get(value: unknown) {
    return this._info.get(rbObjAsString(value));
  }

  info(value: unknown) {
    return this.get(value);
  }

  async layers() {
    const layersCount = rbStrEnumerateLines(await this.identify(), []).length;
    return Array.from({ length: layersCount }, (_, idx) => new Image(`${this.path}[${idx}]`));
  }

  pages() {
    return this.layers();
  }

  frames() {
    return this.layers();
  }

  async getPixels(map: string = "RGB") {
    if (!["RGB", "RGBA"].includes(map)) {
      throw new ArgumentError("Invalid map value");
    }
    await this._info._pending;
    const convert = MiniMagick.convert() as CliTool;
    convert.append(this.path);
    convert.depth(8);
    convert.append(`${map}:-`);
    const shell = new Shell();
    const [output] = await shell.run(convert.command());
    const pixelsArray = unpack(output, "C*") as number[];
    const pixels = eachSlice(eachSlice(pixelsArray, map.length), await this.width()).toA();
    pixelsArray.length = 0;
    return pixels;
  }

  static getImageFromPixels(
    pixels: unknown[],
    dimension: [columns: number, rows: number],
    map: string,
    depth: number,
    format: string,
  ) {
    pixels = pixels.flat(Infinity);
    const blob = pack(pixels as number[], "C*");
    return this.importPixels(blob, ...dimension, depth, map, format);
  }

  async format(
    format: string,
    page: number | null = 0,
    readOpts: Record<string, unknown> = {},
    block?: (convert: CliTool) => unknown,
  ) {
    await this._info._pending;
    let newTempfile: Tempfile | null = null,
      newPath: string;
    try {
      if (this._tempfile != null) {
        newTempfile = Utilities.tempfile(`.${format ?? ""}`);
        newPath = newTempfile.path()!;
      } else {
        newPath = String(new Pathname(this.path).subExt(`.${format}`));
      }
      let inputPath = this.path;
      if (page != null && this.isLayer() == null) inputPath += `[${page}]`;
      await MiniMagick.convert(
        blockPass(async (convert: CliTool) => {
          for (const [opt, val] of Object.entries(readOpts)) {
            rbFSend(convert, opt, val);
          }
          convert.append(inputPath);
          if (block != null) {
            await block(convert);
          }
          convert.append(newPath);
        }),
      );
      if (this._tempfile != null) {
        await this.destroyBang();
        this._tempfile = newTempfile;
      } else if (!(this.path === newPath || this.isLayer() != null)) {
        File.delete(this.path);
      }
      this._path = this._info._path = newPath;
      this._info.clear();
      return this;
    } catch (e) {
      if (e instanceof Invalid || e instanceof Error) {
        if (newTempfile != null && this._tempfile !== newTempfile) {
          newTempfile.unlink();
        }
        throw e;
      } else {
        throw e;
      }
    }
  }

  combineOptions(block?: (builder: CliTool) => unknown) {
    return this.mogrify(undefined, block);
  }

  methodMissing(name: string, ...args: unknown[]): Promise<this> {
    return this.mogrify(undefined, (builder) => rbFSend(builder, name, ...args));
  }

  isRespondToMissing(_name: string, _includeAll: boolean) {
    return false;
  }

  async write(outputTo: string | Pathname | IO | StringIO<string | Uint8Array>) {
    await this._info._pending;
    if (typeof outputTo === "string" || outputTo instanceof Pathname) {
      if (this.isLayer() != null) {
        return await MiniMagick.convert(
          blockPass((builder: CliTool) => {
            builder.append(this.path);
            builder.append(outputTo);
          }),
        );
      } else if (this.path !== String(outputTo)) {
        return FileUtils.copyFile(this.path, String(outputTo));
      }
      return null;
    } else {
      return IO.copyStream(File.open(this.path, "rb"), outputTo);
    }
  }

  async composite(
    otherImage: Image,
    outputExtension: string | undefined = undefined,
    mask: Image | null = null,
    block?: (composite: CliTool) => unknown,
  ) {
    await this._info._pending;
    await otherImage._info._pending;
    await mask?._info._pending;
    if (outputExtension === undefined) outputExtension = (await this.type()).toLowerCase();
    const outputTempfile = Utilities.tempfile(`.${outputExtension}`);
    await MiniMagick.composite(
      blockPass(async (composite: CliTool) => {
        if (block != null) {
          await block(composite);
        }
        composite.append(otherImage.path);
        composite.append(this.path);
        if (mask != null) composite.append(mask.path);
        composite.append(outputTempfile.path());
      }),
    );
    return new Image(outputTempfile.path()!, outputTempfile);
  }

  collapseBang(frame: number = 0) {
    return this.mogrify(frame, (builder) => builder.quality(100));
  }

  /** @missingRailsName sub — PERMANENT */
  async destroyBang() {
    await this._info._pending;
    if (this._tempfile != null) {
      if (this._tempfile.path()!.endsWith(".mpc")) {
        FileUtils.rmF(this._tempfile.path()!.replace(/mpc$/m, "cache"));
      }
      return this._tempfile.unlink();
    }
    return null;
  }

  async identify(block?: (builder: CliTool) => unknown): Promise<string> {
    await this._info._pending;
    return (await MiniMagick.identify(
      blockPass((builder: CliTool) => {
        if (block != null) {
          block(builder);
        }
        builder.append(this.path);
      }),
    )) as string;
  }

  async mogrify(page: number | null = null, block?: (builder: CliTool) => unknown) {
    await this._info._pending;
    await MiniMagick.mogrify(
      blockPass(async (builder: CliTool) => {
        if (block != null) {
          await block(builder);
        }
        if (builder.args.includes("-format")) {
          throw new Error("you must call #format on a MiniMagick::Image directly");
        }
        builder.append(page != null ? `${this.path}[${page}]` : this.path);
      }),
    );
    this._info.clear();
    return this;
  }

  isLayer() {
    return matchOperator(this.path, /\[\d+\]$/m);
  }

  async isLandscape() {
    return (await this.width()) > (await this.height());
  }

  async isPortrait() {
    return (await this.height()) > (await this.width());
  }
}
{
  Image.attribute("type", "format");
  Image.attribute("width");
  Image.attribute("height");
  Image.attribute("dimensions");
  Image.attribute("size");
  Image.attribute("human_size");
  Image.attribute("colorspace");
  Image.attribute("exif");
  Image.attribute("resolution");
  Image.attribute("signature");
  Image.attribute("data");
}
