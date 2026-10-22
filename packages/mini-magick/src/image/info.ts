import {
  Enumerator,
  fetch,
  rbStrSend,
  matchOperator,
  update,
  kernelInteger,
  File,
  block as rbBlock,
  ArgumentError,
  TypeError,
  excSetupMessage,
  last,
  JSON,
} from "@blazetrails/ruby-compat";
import { rbBinop } from "../codegen-runtime.js";
import { Invalid } from "../mini-magick.js";
import { MiniMagick } from "../namespaces.js";

export class Info {
  declare _path: string;
  declare _info: Record<string, unknown>;

  static toString(): string {
    return "MiniMagick::Image::Info";
  }

  static ASCII_ENCODED_EXIF_KEYS: unknown = ["ExifVersion", "FlashPixVersion"];

  constructor(path: string) {
    this._path = path;
    this._info = {};
  }

  get(value: string, ...args: unknown[]): unknown {
    if (
      value === "format" ||
      value === "width" ||
      value === "height" ||
      value === "dimensions" ||
      value === "size" ||
      value === "human_size"
    ) {
      return this.cheapInfo(value);
    } else if (value === "colorspace") {
      return this.colorspace();
    } else if (value === "resolution") {
      return this.resolution(...(args as Parameters<this["resolution"]>));
    } else if (value === "signature") {
      return this.signature();
    } else if (/^EXIF:/im.test(value)) {
      return this.rawExif(value);
    } else if (value === "exif") {
      return this.exif();
    } else if (value === "data") {
      return this.data();
    } else {
      return this.raw(value);
    }
  }

  clear() {
    return (Object.keys(this._info).forEach((k) => delete this._info[k]), this._info);
  }

  cheapInfo(value: string) {
    try {
      return fetch(
        this._info,
        value,
        rbBlock(() => {
          const [format, width, height, size] = rbStrSend(
            this.parseWarnings(this.get("%m %w %h %b")) as string,
            "split",
            " ",
          )[0] as string[];
          let path = this._path;
          if ((matchOperator(path, /\[\d+\]$/m) ?? false) !== false) {
            path = path.match(/\[\d+\]$/m).preMatch();
          }
          update(this._info, {
            format: format,
            width: kernelInteger(width),
            height: kernelInteger(height),
            dimensions: [kernelInteger(width), kernelInteger(height)],
            size: File.size(path),
            human_size: size,
          });
          return fetch(this._info, value);
        }),
      );
    } catch (error) {
      if (error instanceof ArgumentError || error instanceof TypeError) {
        throw excSetupMessage(new Invalid("image data can't be read"), error);
      } else {
        throw error;
      }
    }
  }

  parseWarnings(rawInfo: unknown) {
    if (!((rbStrSend(rawInfo as string, "split", "\n")[0] as string[]).length > 1)) {
      return rawInfo;
    }
    for (const line of rbStrSend(rawInfo as string, "split", "\n")[0] as string[]) {
      if (
        rbStrSend(line, "isMatch", /^[A-Z]+ \d+ \d+ \d+(|\.\d+)([KMGTPEZY]{0,1})B$/m)[0] as boolean
      ) {
        return line;
      }
    }
    throw new TypeError();
  }

  colorspace() {
    if (!((this._info["colorspace"] ?? false) !== false)) this._info["colorspace"] = this.get("%r");
    return this._info["colorspace"];
  }

  resolution(unit: unknown = null) {
    const output = this.identify((b) => {
      if (unit != null && unit !== false) {
        b.units(unit);
      }
      return b.format("%x %y");
    });
    return (rbStrSend(output, "split", " ")[0] as string[]).map((x) => x.toI());
  }

  rawExif(value: string): unknown {
    return this.get(`%[${value ?? ""}]`);
  }

  exif() {
    let hash: unknown, output;
    if (!((this._info["exif"] ?? false) !== false))
      this._info["exif"] = (() => {
        hash = {};
        output = this.get("%[EXIF:*]");
        rbStrSend(output as string, "eachLine", (line: unknown): unknown => {
          let match, key, value;
          line = rbStrSend(line as string, "chomp", "\n")[0];
          if (((match = line.match(/^exif:/m)) ?? false) !== false) {
            [key, value] = ((s: string, i = s.indexOf("=")) =>
              s === "" ? [] : i < 0 ? [s] : [s.slice(0, i), s.slice(i + 1)])(
              match.postMatch() as string,
            );
            if (Info.ASCII_ENCODED_EXIF_KEYS.includes(key)) {
              value = this.decodeCommaSeparatedAsciiCharacters(value);
            }
            return (hash[key] = value);
          } else {
            return ((x) =>
              typeof x === "string"
                ? x + `\n${line ?? ""}`
                : Array.isArray(x)
                  ? (x.push(`\n${line ?? ""}`), x)
                  : x instanceof globalThis.Set
                    ? x.add(`\n${line ?? ""}`)
                    : x.append(`\n${line ?? ""}`))(hash[last(Object.keys(hash))]);
          }
        });
        return hash;
      })();
    return this._info["exif"];
  }

  raw(value: string) {
    if (!((this._info[`raw:${value ?? ""}`] ?? false) !== false))
      this._info[`raw:${value ?? ""}`] = this.identify((b) => b.format(value));
    return this._info[`raw:${value ?? ""}`];
  }

  signature() {
    if (!((this._info["signature"] ?? false) !== false)) this._info["signature"] = this.get("%#");
    return this._info["signature"];
  }

  data() {
    let json, data;
    if (!((this._info["data"] ?? false) !== false))
      this._info["data"] = (() => {
        json = MiniMagick.convert((convert: unknown) => {
          if (Array.isArray(convert)) convert.push(this.path());
          else if (convert instanceof globalThis.Set) convert.add(this.path());
          else convert.append(this.path());
          return typeof convert === "string"
            ? convert + "json:"
            : Array.isArray(convert)
              ? (convert.push("json:"), convert)
              : convert instanceof globalThis.Set
                ? convert.add("json:")
                : convert.append("json:");
        });
        data = JSON.parse(json);
        if (Array.isArray(data)) {
          data = fetch(data, 0);
        }
        return fetch(data, "image");
      })();
    return this._info["data"];
  }

  identify(block?: (...args: unknown[]) => unknown) {
    return MiniMagick.identify((builder: unknown) => {
      if (block != null) {
        block(builder);
      }
      return typeof builder === "string"
        ? builder + this.path()
        : Array.isArray(builder)
          ? (builder.push(this.path()), builder)
          : builder instanceof globalThis.Set
            ? builder.add(this.path())
            : builder.append(this.path());
    });
  }

  /** @internal */
  protected decodeCommaSeparatedAsciiCharacters(encodedValue: undefined | string) {
    if (
      !(
        encodedValue instanceof globalThis.Set ||
        encodedValue instanceof globalThis.Map ||
        encodedValue instanceof Enumerator
          ? [...encodedValue]
          : Object.getPrototypeOf(encodedValue) === Object.prototype
            ? Object.entries(encodedValue as object)
            : (encodedValue as unknown[])
      ).includes(",")
    ) {
      return encodedValue;
    }
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(rbStrSend(encodedValue!, "scan", /\d+/)[0])
      .map((x) => x.toI())
      .map((x) => x.chr())
      .join();
  }

  /** @internal */
  protected path() {
    let value = this._path;
    if (!((matchOperator(value, /\[\d+\]$/m) ?? false) !== false)) {
      value = rbBinop(value, "+", "[0]");
    }
    return value;
  }
}
