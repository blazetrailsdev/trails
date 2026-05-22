import { getFs } from "@blazetrails/activesupport";
import { ArgumentError, escapePath } from "../utils.js";
import { UploadedFile } from "./uploaded-file.js";

export const MULTIPART_BOUNDARY = "AaB03x";

type Params = Record<string, unknown>;

/**
 * Rack::Multipart::Generator
 *
 * Symmetrical to `Rack::Multipart::Parser`. Used by mock requests to
 * serialise a hash of params (including {@link UploadedFile} values)
 * into a multipart/form-data body keyed off {@link MULTIPART_BOUNDARY}.
 */
export class Generator {
  private _params: Params;

  private _first: boolean;

  private _flattened: Params | null = null;

  constructor(params: unknown, first: boolean = true) {
    if (first && (params === null || typeof params !== "object" || Array.isArray(params))) {
      throw new ArgumentError("value must be a Hash");
    }
    this._params = params as Params;
    this._first = first;
  }

  dump(): string | Params | null {
    if (this._first && !this.isMultipart()) return null;
    if (!this._first) return this.flattenedParams();

    let out = "";
    for (const [name, file] of Object.entries(this.flattenedParams())) {
      if (file instanceof UploadedFile) {
        out += this.contentForTempfile(file, file, name);
      } else {
        out += this.contentForOther(file, name);
      }
    }
    return out + `--${MULTIPART_BOUNDARY}--\r`;
  }

  /** @internal */
  private isMultipart(): boolean {
    const has = (value: unknown): boolean => {
      if (value instanceof UploadedFile) return true;
      if (Array.isArray(value)) return value.some(has);
      if (value !== null && typeof value === "object") {
        return Object.values(value as Params).some(has);
      }
      return false;
    };
    return Object.values(this._params).some(has);
  }

  /** @internal */
  private flattenedParams(): Params {
    if (this._flattened) return this._flattened;
    const h: Params = {};
    for (const [key, value] of Object.entries(this._params)) {
      const k = this._first ? String(key) : `[${key}]`;
      if (Array.isArray(value)) {
        for (const v of value) {
          const sub = new Generator(v as Params, false).dump() as Params;
          for (const [sk, sv] of Object.entries(sub)) {
            h[`${k}[]${sk}`] = sv;
          }
        }
      } else if (value !== null && typeof value === "object" && !(value instanceof UploadedFile)) {
        const sub = new Generator(value as Params, false).dump() as Params;
        for (const [sk, sv] of Object.entries(sub)) {
          h[k + sk] = sv;
        }
      } else {
        h[k] = value;
      }
    }
    this._flattened = h;
    return h;
  }

  /** @internal */
  private contentForTempfile(io: UploadedFile, file: UploadedFile, name: string): string {
    const raw = io.read();
    const content = typeof raw === "string" ? raw : raw.toString("binary");
    // Rails uses `File.stat(file.path).size` so the length reflects on-disk
    // bytes rather than the (possibly re-encoded) string we just read.
    const length = file.path !== undefined ? getFs().statSync(file.path).size : null;
    const filename = `; filename="${escapePath(file.originalFilename)}"`;
    const lenLine = length !== null ? `content-length: ${length}\r\n` : "";
    return (
      `--${MULTIPART_BOUNDARY}\r\n` +
      `content-disposition: form-data; name="${name}"${filename}\r\n` +
      `content-type: ${file.contentType}\r\n` +
      `${lenLine}\r\n` +
      `${content}\r\n`
    );
  }

  /** @internal */
  private contentForOther(file: unknown, name: string): string {
    return (
      `--${MULTIPART_BOUNDARY}\r\n` +
      `content-disposition: form-data; name="${name}"\r\n` +
      `\r\n` +
      `${String(file)}\r\n`
    );
  }
}
