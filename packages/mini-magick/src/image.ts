import { Info } from "./image/info.js";
import { Utilities } from "./utilities.js";
import { eachSlice } from "@blazetrails/activesupport";
import {
  StringIO,
  Enumerator,
  IO,
  rbStrSend,
  rbObjAsString,
  matchOperator,
  File,
  rbModDefineMethod,
  rbEqual,
  rbFSend,
  PROTOCOL_PROBES,
  rbObjClass,
  rbHash,
  excSetupMessage,
  ArgumentError,
  rbCheckArrayType,
  toA,
  pack,
  rbObjDup,
  Pathname,
  FileUtils,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { replace, rbAref, lines } from "./codegen-runtime.js";
import { Invalid, Error } from "./mini-magick.js";
import { MiniMagick } from "./namespaces.js";
import { Shell } from "./shell.js";
import type { Tempfile } from "@blazetrails/ruby-compat";

export class Image {
  declare _path: string;
  declare _tempfile: unknown;
  declare _info: Info | string;
  declare static _info: unknown;

  static toString(): string {
    return "MiniMagick::Image";
  }

  static read(stream: string | StringIO | Tempfile, ext: string | null = null) {
    if (typeof stream === "string") {
      stream = new StringIO(stream);
    }
    return this.create(ext, (file) => IO.copyStream(stream, file));
  }

  static importPixels(
    blob: unknown,
    columns: unknown,
    rows: unknown,
    depth: unknown,
    map: string,
    format: unknown = "png",
  ) {
    return ((image) => {
      const outputPath = rbStrSend(image.path(), "sub", /\.\w+$/m, `.${format}`)[0];
      MiniMagick.convert((convert: unknown) => {
        convert.size(`${columns ?? ""}x${rows ?? ""}`);
        convert.depth(depth);
        if (Array.isArray(convert)) convert.push(`${map ?? ""}:${image.path() ?? ""}`);
        else if (convert instanceof globalThis.Set)
          convert.add(`${map ?? ""}:${image.path() ?? ""}`);
        else convert.append(`${map ?? ""}:${image.path() ?? ""}`);
        return typeof convert === "string"
          ? convert + outputPath
          : Array.isArray(convert)
            ? (convert.push(outputPath), convert)
            : convert instanceof globalThis.Set
              ? convert.add(outputPath)
              : convert.append(outputPath);
      });
      replace(image.path(), outputPath);
      return image;
    })(this.read(blob as string | Tempfile | StringIO, ".dat"));
  }

  static open(
    pathOrUrl: unknown,
    ext: { Foo: string } | string | null = null,
    { ...options }: Record<string, unknown> = {},
  ) {
    let uri, pathname;
    if ((matchOperator(rbObjAsString(pathOrUrl), /^(https?|ftp):\/\//) ?? false) !== false) {
      uri = this.URI(pathOrUrl);
      if (!(ext != null && ext !== false))
        ext = rbStrSend(File.extname(uri.path()), "sub", /:.*/, "")[0] as string;
      return uri.open(options, (file: unknown) =>
        this.read(file as string | Tempfile | StringIO, ext),
      );
    } else {
      pathname = this.Pathname(pathOrUrl);
      if (!(ext != null && ext !== false)) ext = File.extname(rbObjAsString(pathname));
      return pathname.open({ binmode: true, ...options }, (file: unknown) =>
        this.read(file as string | Tempfile | StringIO, ext),
      );
    }
  }

  static create(ext: null = null, block?: (...args: unknown[]) => unknown) {
    const tempfile = Utilities.tempfile(rbObjAsString(ext).toLowerCase(), block);
    return new this(tempfile.path(), tempfile);
  }

  static attribute(name: string, key: string = rbObjAsString(name)) {
    return rbModDefineMethod(this, name, (...args: unknown[][]) => {
      if (args.some((x) => x != null && x !== false) && !rbEqual(name, "resolution")) {
        return this.mogrify((b: unknown) => rbFSend(b, name, ...args));
      } else {
        return rbAref(this._info, key, ...args);
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
    inputPath: unknown,
    tempfile: unknown = null,
    block?: (...args: unknown[]) => unknown,
  ) {
    this._path = rbObjAsString(inputPath);
    this._tempfile = tempfile;
    this._info = new Info(this._path);
    if (block != null) {
      this.combineOptions(block);
    }
    return new Proxy(this, {
      get(target, name, receiver) {
        if (
          typeof name === "symbol" ||
          name in target ||
          PROTOCOL_PROBES.has(name) ||
          !(receiver as Image).isRespondToMissing(name, false)
        )
          return Reflect.get(target, name, receiver);
        return (...args: unknown[]) => (receiver as Image).methodMissing(name, ...args);
      },
    });
  }

  equals(other: Info) {
    return (
      rbEqual(rbObjClass(this) as unknown as typeof Image, rbObjClass(other)) &&
      rbEqual(this.signature(), other.signature())
    );
  }

  isEql(other: unknown) {
    return this.equals(other as Info);
  }

  hash() {
    return rbHash(this.signature());
  }

  toBlob() {
    return File.binread(this.path);
  }

  isValid() {
    try {
      this.validateBang();
      return true;
    } catch (error) {
      if (error instanceof Invalid) {
        return false;
      } else {
        throw error;
      }
    }
  }

  validateBang() {
    try {
      return this.identify();
    } catch (error) {
      if (error instanceof Error) {
        throw excSetupMessage(new Invalid(error.message), error);
      } else {
        throw error;
      }
    }
  }

  get(value: unknown) {
    return this._info[rbObjAsString(value)];
  }

  info(value: unknown) {
    return this.get(value);
  }

  layers() {
    const layersCount = lines(this.identify()).length;
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(layersCount.times()).map(
      (idx) => new Image(`${this.path ?? ""}[${idx ?? ""}]`),
    );
  }

  pages() {
    return this.layers();
  }

  frames() {
    return this.layers();
  }

  getPixels(map: unknown[] | string = "RGB") {
    if (!["RGB", "RGBA"].includes(map)) {
      throw new ArgumentError("Invalid map value");
    }
    const convert = MiniMagick.convert();
    if (Array.isArray(convert)) convert.push(this.path);
    else if (convert instanceof globalThis.Set) convert.add(this.path);
    else convert.append(this.path);
    convert.depth(8);
    if (Array.isArray(convert)) convert.push(`${map}:-`);
    else if (convert instanceof globalThis.Set) convert.add(`${map}:-`);
    else convert.append(`${map}:-`);
    const shell = new Shell();
    const [output] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
      shell.run(convert.command()),
    );
    const pixelsArray = output.unpack("C*");
    const pixels = toA(eachSlice(eachSlice(pixelsArray, map.length), this.width));
    if (Array.isArray(output)) output.length = 0;
    else output.clear();
    if (Array.isArray(pixelsArray)) pixelsArray.length = 0;
    else pixelsArray.clear();
    return pixels;
  }

  static getImageFromPixels(
    pixels: unknown[],
    dimension: unknown,
    map: unknown,
    depth: unknown,
    format: unknown,
  ) {
    pixels = pixels.flat(Infinity);
    const blob = pack(pixels, "C*");
    return this.importPixels(
      blob,
      ...(dimension == null ? [] : (rbCheckArrayType(dimension) ?? [dimension])),
      depth,
      map,
      format,
    );
  }

  format(
    format: string,
    page: unknown = 0,
    readOpts: unknown = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    let newTempfile, newPath: unknown, inputPath: unknown;
    try {
      if (this._tempfile != null && this._tempfile !== false) {
        newTempfile = Utilities.tempfile(`.${format ?? ""}`);
        newPath = newTempfile.path();
      } else {
        newPath = rbObjAsString(this.Pathname(this.path).subExt(`.${format ?? ""}`));
      }
      inputPath = rbObjDup(this.path);
      if (page != null && !((this.isLayer() ?? false) !== false)) {
        if (Array.isArray(inputPath)) inputPath.push(`[${page}]`);
        else if (inputPath instanceof globalThis.Set) inputPath.add(`[${page}]`);
        else inputPath.append(`[${page}]`);
      }
      MiniMagick.convert((convert: unknown): unknown => {
        for (const [opt, val] of Object.entries(readOpts)) {
          rbFSend(convert, rbObjAsString(opt), val);
        }
        if (Array.isArray(convert)) convert.push(inputPath);
        else if (convert instanceof globalThis.Set) convert.add(inputPath);
        else convert.append(inputPath);
        if (block != null) {
          block(convert);
        }
        return typeof convert === "string"
          ? convert + newPath
          : Array.isArray(convert)
            ? (convert.push(newPath), convert)
            : convert instanceof globalThis.Set
              ? convert.add(newPath)
              : convert.append(newPath);
      });
      if (this._tempfile != null && this._tempfile !== false) {
        this.destroyBang();
        this._tempfile = newTempfile;
      } else if (!(rbEqual(this.path, newPath) || this.isLayer())) {
        File.delete(this.path);
      }
      replace(this.path, newPath);
      if (Array.isArray(this._info)) this._info.length = 0;
      else if (typeof this._info === "string") this._info = "";
      else this._info.clear();
      return this;
    } catch (e) {
      if (e instanceof Invalid || e instanceof Error) {
        if (newTempfile != null && newTempfile !== false && !rbEqual(this._tempfile, newTempfile)) {
          newTempfile.unlink();
        }
        throw e;
      } else {
        throw e;
      }
    }
  }

  combineOptions(block?: (...args: unknown[]) => unknown) {
    return this.mogrify(undefined, block);
  }

  methodMissing(name: string, ...args: unknown[][]) {
    return this.mogrify(undefined, (builder) => rbFSend(builder, name, ...args));
  }

  isRespondToMissing(_name: string, _includeAll: boolean) {
    return false;
  }

  write(outputTo: unknown) {
    if (typeof outputTo === "string" || outputTo instanceof Pathname) {
      if (this.isLayer()) {
        return MiniMagick.convert((builder: unknown) => {
          if (Array.isArray(builder)) builder.push(this.path);
          else if (builder instanceof globalThis.Set) builder.add(this.path);
          else builder.append(this.path);
          return typeof builder === "string"
            ? builder + outputTo
            : Array.isArray(builder)
              ? (builder.push(outputTo), builder)
              : builder instanceof globalThis.Set
                ? builder.add(outputTo)
                : builder.append(outputTo);
        });
      } else if (!rbEqual(this.path, rbObjAsString(outputTo))) {
        return FileUtils.copyFile(this.path, outputTo);
      }
      return null;
    } else {
      return IO.copyStream(File.open(this.path, "rb"), outputTo as IO);
    }
  }

  composite(
    otherImage: unknown,
    outputExtension: unknown = (this.type() as string).toLowerCase(),
    mask: unknown = null,
    block?: (...args: unknown[]) => unknown,
  ) {
    const outputTempfile = Utilities.tempfile(`.${outputExtension}`);
    MiniMagick.composite((composite: unknown) => {
      if (block != null) {
        block(composite);
      }
      if (Array.isArray(composite)) composite.push(otherImage.path());
      else if (composite instanceof globalThis.Set) composite.add(otherImage.path());
      else composite.append(otherImage.path());
      if (Array.isArray(composite)) composite.push(this.path);
      else if (composite instanceof globalThis.Set) composite.add(this.path);
      else composite.append(this.path);
      if (mask != null && mask !== false) {
        if (Array.isArray(composite)) composite.push(mask.path());
        else if (composite instanceof globalThis.Set) composite.add(mask.path());
        else composite.append(mask.path());
      }
      return typeof composite === "string"
        ? composite + outputTempfile.path()
        : Array.isArray(composite)
          ? (composite.push(outputTempfile.path()), composite)
          : composite instanceof globalThis.Set
            ? composite.add(outputTempfile.path())
            : composite.append(outputTempfile.path());
    });
    return new Image(outputTempfile.path(), outputTempfile);
  }

  collapseBang(frame: unknown = 0) {
    return this.mogrify(frame as undefined | null, (builder) => builder.quality(100));
  }

  destroyBang() {
    if (this._tempfile != null && this._tempfile !== false) {
      if (this._tempfile.path().endsWith(".mpc")) {
        FileUtils.rmF(
          rbStrSend(this._tempfile.path(), "sub", /mpc$/m, "cache")[0] as string | string[],
        );
      }
      return this._tempfile.unlink();
    }
    return null;
  }

  identify(block?: (...args: unknown[]) => unknown) {
    return MiniMagick.identify((builder: unknown) => {
      if (block != null) {
        block(builder);
      }
      return typeof builder === "string"
        ? builder + this.path
        : Array.isArray(builder)
          ? (builder.push(this.path), builder)
          : builder instanceof globalThis.Set
            ? builder.add(this.path)
            : builder.append(this.path);
    });
  }

  mogrify(page: undefined | null = null, block?: (...args: unknown[]) => unknown) {
    MiniMagick.mogrify((builder: unknown) => {
      if (block != null) {
        block(builder);
      }
      if (
        (builder.args instanceof globalThis.Set ||
        builder.args instanceof globalThis.Map ||
        builder.args instanceof Enumerator
          ? [...builder.args]
          : Object.getPrototypeOf(builder.args) === Object.prototype
            ? Object.entries(builder.args as object)
            : (builder.args as unknown[])
        ).includes("-format")
      ) {
        throw new Error("you must call #format on a MiniMagick::Image directly");
      }
      return typeof builder === "string"
        ? builder +
            (page != null && page !== false ? `${this.path ?? ""}[${page ?? ""}]` : this.path)
        : Array.isArray(builder)
          ? (builder.push(
              page != null && page !== false ? `${this.path ?? ""}[${page ?? ""}]` : this.path,
            ),
            builder)
          : builder instanceof globalThis.Set
            ? builder.add(
                page != null && page !== false ? `${this.path ?? ""}[${page ?? ""}]` : this.path,
              )
            : builder.append(
                page != null && page !== false ? `${this.path ?? ""}[${page ?? ""}]` : this.path,
              );
    });
    if (Array.isArray(this._info)) this._info.length = 0;
    else if (typeof this._info === "string") this._info = "";
    else this._info.clear();
    return this;
  }

  isLayer() {
    return matchOperator(this.path, /\[\d+\]$/m);
  }

  isLandscape() {
    return this.width > this.height();
  }

  isPortrait() {
    return this.height() > this.width;
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
rbModConstSet(MiniMagick, "Image", Image);
