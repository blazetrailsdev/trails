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
  matchOperator,
} from "@blazetrails/ruby-compat";
import type { Tool } from "./tool.js";
import { Invalid, Error } from "./mini-magick.js";
import { MiniMagick } from "./mini-magick.js";
import { Shell } from "./shell.js";
import type { Tempfile } from "@blazetrails/ruby-compat";

export class Image {
  declare _path: string;
  declare _tempfile: Tempfile | null;
  declare _info: Info;

  static toString(): string {
    return "MiniMagick::Image";
  }

  static read(stream: string | StringIO | Tempfile, ext: string | null = null) {
    if (typeof stream === "string") {
      stream = new StringIO(stream);
    }
    return this.create(ext, (file) => IO.copyStream(stream, file));
  }

  static async importPixels(
    blob: string | StringIO | Tempfile,
    columns: number,
    rows: number,
    depth: number,
    map: string,
    format: string = "png",
  ) {
    return (async (image: Image) => {
      const outputPath = image.path.replace(/\.\w+$/m, `.${format}`);
      await MiniMagick.convert((convert: Tool) => {
        convert.size(`${columns}x${rows}`);
        convert.depth(depth);
        convert.append(`${map}:${image.path}`);
        convert.append(outputPath);
      });
      image._path = image._info._path = outputPath;
      return image;
    })(this.read(blob, ".dat"));
  }

  static open(
    pathOrUrl: string | Pathname,
    ext: string | null = null,
    { ...options }: Record<string, unknown> = {},
  ) {
    let uri, pathname;
    if (/^(https?|ftp):\/\//.test(String(pathOrUrl))) {
      uri = URI.parse(String(pathOrUrl));
      if (ext == null) ext = File.extname(uri.path()).replace(/:.*/, "");
      return uri.open(options, (file: unknown) =>
        this.read(file as string | Tempfile | StringIO, ext),
      );
    } else {
      pathname = pathOrUrl instanceof Pathname ? pathOrUrl : new Pathname(pathOrUrl);
      if (ext == null) ext = File.extname(String(pathname));
      return pathname.open({ binmode: true, ...options }, (file: unknown) =>
        this.read(file as string | Tempfile | StringIO, ext),
      );
    }
  }

  static create(ext: string | null = null, block?: (file: Tempfile) => unknown) {
    const tempfile = Utilities.tempfile((ext ?? "").toLowerCase(), block);
    return new this(tempfile.path(), tempfile);
  }

  static attribute(name: string, key: string = name) {
    return rbModDefineMethod(this, name, function (this: Image, ...args: unknown[]) {
      if (args.some((x) => x != null && x !== false) && name !== "resolution") {
        return this.mogrify(undefined, (b) => rbFSend(b, name, ...args));
      } else {
        return this._info.get(key, ...args);
      }
    });
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
    block?: (builder: Tool) => unknown,
  ) {
    this._path = String(inputPath);
    this._tempfile = tempfile;
    this._info = new Info(this._path);
    if (block != null) {
      this.combineOptions(block);
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

  async equals(other: Image) {
    return (
      rbObjClass(this) === rbObjClass(other) &&
      (await this.signature()) === (await other.signature())
    );
  }

  isEql(other: Image) {
    return this.equals(other);
  }

  async hash() {
    return rbHash(await this.signature());
  }

  toBlob() {
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

  get(value: string) {
    return this._info.get(String(value));
  }

  info(value: string) {
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
    const convert = MiniMagick.convert() as Tool;
    convert.append(this.path);
    convert.depth(8);
    convert.append(`${map}:-`);
    const shell = new Shell();
    const [output] = await shell.run(convert.command());
    const pixelsArray = unpack(output, "C*");
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
    block?: (convert: Tool) => unknown,
  ) {
    let newTempfile: Tempfile | undefined, newPath: string;
    try {
      if (this._tempfile != null) {
        newTempfile = Utilities.tempfile(`.${format ?? ""}`);
        newPath = newTempfile.path();
      } else {
        newPath = String(new Pathname(this.path).subExt(`.${format}`));
      }
      let inputPath = this.path;
      if (page != null && this.isLayer() == null) inputPath += `[${page}]`;
      await MiniMagick.convert((convert: Tool) => {
        for (const [opt, val] of Object.entries(readOpts)) {
          rbFSend(convert, opt, val);
        }
        convert.append(inputPath);
        if (block != null) {
          block(convert);
        }
        convert.append(newPath);
      });
      if (this._tempfile != null) {
        this.destroyBang();
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

  combineOptions(block?: (builder: Tool) => unknown) {
    return this.mogrify(undefined, block);
  }

  methodMissing(name: string, ...args: unknown[]): Promise<this> {
    return this.mogrify(undefined, (builder) => rbFSend(builder, name, ...args));
  }

  isRespondToMissing(_name: string, _includeAll: boolean) {
    return false;
  }

  async write(outputTo: string | Pathname | IO) {
    if (typeof outputTo === "string" || outputTo instanceof Pathname) {
      if (this.isLayer() != null) {
        return await MiniMagick.convert((builder: Tool) => {
          builder.append(this.path);
          builder.append(outputTo);
        });
      } else if (this.path !== String(outputTo)) {
        return FileUtils.copyFile(this.path, outputTo);
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
    block?: (composite: Tool) => unknown,
  ) {
    if (outputExtension === undefined)
      outputExtension = ((await this.type()) as string).toLowerCase();
    const outputTempfile = Utilities.tempfile(`.${outputExtension}`);
    await MiniMagick.composite((composite: Tool) => {
      if (block != null) {
        block(composite);
      }
      composite.append(otherImage.path);
      composite.append(this.path);
      if (mask != null) composite.append(mask.path);
      composite.append(outputTempfile.path());
    });
    return new Image(outputTempfile.path(), outputTempfile);
  }

  collapseBang(frame: number = 0) {
    return this.mogrify(frame, (builder) => builder.quality(100));
  }

  destroyBang() {
    if (this._tempfile != null) {
      if (this._tempfile.path().endsWith(".mpc")) {
        FileUtils.rmF(this._tempfile.path().replace(/mpc$/m, "cache"));
      }
      return this._tempfile.unlink();
    }
    return null;
  }

  identify(block?: (builder: Tool) => unknown): Promise<string> {
    return MiniMagick.identify((builder: Tool) => {
      if (block != null) {
        block(builder);
      }
      builder.append(this.path);
    }) as Promise<string>;
  }

  async mogrify(page: number | null = null, block?: (builder: Tool) => unknown) {
    await MiniMagick.mogrify((builder: Tool) => {
      if (block != null) {
        block(builder);
      }
      if (builder.args.includes("-format")) {
        throw new Error("you must call #format on a MiniMagick::Image directly");
      }
      builder.append(page != null ? `${this.path}[${page}]` : this.path);
    });
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
