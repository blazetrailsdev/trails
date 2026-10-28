import {
  fetch,
  chomp,
  stringSplit,
  rbStrEnumerateLines,
  matchOperator,
  RangeError,
  kernelInteger,
  File,
  ArgumentError,
  TypeError,
  excSetupMessage,
  JSON,
  rbAryFetch,
} from "@blazetrails/ruby-compat";
import { Invalid } from "../mini-magick.js";
import type { CliTool } from "../tool.js";
import { MiniMagick } from "../mini-magick.js";

export class Info {
  declare _path: string;
  declare _info: Record<string, unknown>;

  static toString(): string {
    return "MiniMagick::Image::Info";
  }

  static ASCII_ENCODED_EXIF_KEYS: string[] = ["ExifVersion", "FlashPixVersion"];

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

  async cheapInfo(value: string) {
    try {
      if (Object.hasOwn(this._info, value)) {
        return this._info[value];
      }
      const [format, width, height, size] = stringSplit(
        this.parseWarnings((await this.get("%m %w %h %b")) as string),
        " ",
      );
      let path = this._path;
      if ((matchOperator(path, /\[\d+\]$/m) ?? false) !== false) {
        path = path.slice(0, path.search(/\[\d+\]$/m));
      }
      Object.assign(this._info, {
        format: format,
        width: kernelInteger(width),
        height: kernelInteger(height),
        dimensions: [kernelInteger(width), kernelInteger(height)],
        size: File.size(path),
        human_size: size,
      });
      return fetch(this._info, value);
    } catch (error) {
      if (error instanceof ArgumentError || error instanceof TypeError) {
        throw excSetupMessage(new Invalid("image data can't be read"), error);
      } else {
        throw error;
      }
    }
  }

  parseWarnings(rawInfo: string) {
    if (!(stringSplit(rawInfo, "\n").length > 1)) {
      return rawInfo;
    }
    for (const line of stringSplit(rawInfo, "\n")) {
      if (/^[A-Z]+ \d+ \d+ \d+(|\.\d+)([KMGTPEZY]{0,1})B$/m.test(line)) {
        return line;
      }
    }
    throw new TypeError();
  }

  async colorspace() {
    if (!((this._info["colorspace"] ?? false) !== false))
      this._info["colorspace"] = await this.get("%r");
    return this._info["colorspace"];
  }

  async resolution(unit: string | null = null) {
    const output = await this.identify((b) => {
      if (unit != null) {
        b.units(unit);
      }
      return b.format("%x %y");
    });
    return stringSplit(output, " ").map((x) => parseInt(x, 10) || 0);
  }

  rawExif(value: string): unknown {
    return this.get(`%[${value ?? ""}]`);
  }

  async exif() {
    if (!((this._info["exif"] ?? false) !== false))
      this._info["exif"] = await (async () => {
        const hash: Record<string, string> = {};
        const output = (await this.get("%[EXIF:*]")) as string;
        for (let line of rbStrEnumerateLines(output, [])) {
          line = chomp(line, "\n");
          if (/^exif:/m.test(line)) {
            const postMatch = line.slice(line.search(/^exif:/m) + "exif:".length);
            const fields = stringSplit(postMatch, "=", 2);
            const key = fields[0];
            let value: string | undefined = fields[1];
            if (Info.ASCII_ENCODED_EXIF_KEYS.includes(key)) {
              value = this.decodeCommaSeparatedAsciiCharacters(value);
            }
            hash[key] = value!;
          } else {
            hash[Object.keys(hash).at(-1)!] += `\n${line}`;
          }
        }
        return hash;
      })();
    return this._info["exif"];
  }

  async raw(value: string) {
    if (!((this._info[`raw:${value ?? ""}`] ?? false) !== false))
      this._info[`raw:${value ?? ""}`] = await this.identify((b) => b.format(value));
    return this._info[`raw:${value ?? ""}`];
  }

  signature(): string | Promise<string> {
    if (!((this._info["signature"] ?? false) !== false))
      return (async () => (this._info["signature"] = (await this.get("%#")) as string))();
    return this._info["signature"] as string;
  }

  async data() {
    if (!((this._info["data"] ?? false) !== false))
      this._info["data"] = await (async () => {
        const json = (await MiniMagick.convert((convert: CliTool) => {
          convert.append(this.path());
          convert.append("json:");
        })) as string;
        let data: unknown = JSON.parse(json);
        if (Array.isArray(data)) {
          data = rbAryFetch(data, 0);
        }
        return fetch(data as Record<string, unknown>, "image");
      })();
    return this._info["data"];
  }

  identify(block?: (builder: CliTool) => unknown): Promise<string> {
    return MiniMagick.identify((builder: CliTool) => {
      if (block != null) {
        block(builder);
      }
      builder.append(this.path());
    }) as Promise<string>;
  }

  /** @internal */
  protected decodeCommaSeparatedAsciiCharacters(encodedValue: string | undefined) {
    if (!encodedValue!.includes(",")) {
      return encodedValue;
    }
    return (encodedValue!.match(/\d+/g) ?? [])
      .map((x) => parseInt(x, 10))
      .map((x) => {
        if (x > 255) throw new RangeError(`${x} out of char range`);
        return String.fromCharCode(x);
      })
      .join("");
  }

  /** @internal */
  protected path() {
    let value = this._path;
    if (!((matchOperator(value, /\[\d+\]$/m) ?? false) !== false)) {
      value = value + "[0]";
    }
    return value;
  }
}
