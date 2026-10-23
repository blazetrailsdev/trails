import {
  Encoding,
  File,
  FileUtils,
  StringIO,
  Tempfile,
  methodMissingProxy,
} from "@blazetrails/ruby-compat";

export interface UploadedFileOptions {
  path?: string | null;
  contentType?: string;
  binary?: boolean;
  filename?: string;
  io?: StringIO;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the merge is how the delegated surface reaches the class type. */
export interface UploadedFile {
  /** @noRailsEquivalent PERMANENT */
  read(): string;
  /** @noRailsEquivalent PERMANENT */
  isBinmode(): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class UploadedFile {
  readonly originalFilename: string;
  contentType: string;

  private _tempfile: Tempfile | StringIO;

  constructor(
    filepath?: string | UploadedFileOptions | null,
    ct: string | UploadedFileOptions = "text/plain",
    bin: boolean = false,
  ) {
    let opts: UploadedFileOptions;
    if (filepath !== null && typeof filepath === "object") {
      opts = filepath;
    } else if (typeof ct === "object") {
      opts = { path: filepath ?? null, ...ct };
    } else {
      opts = { path: filepath ?? null, contentType: ct, binary: bin };
    }

    const path = opts.path ?? null;
    const contentType = opts.contentType ?? "text/plain";
    const binary = opts.binary ?? false;

    if (opts.io) {
      this._tempfile = opts.io;
      this.originalFilename = opts.filename ?? "";
    } else {
      if (!path || !File.isExist(path)) {
        throw new Error(`${path ?? ""} file does not exist`);
      }
      this.originalFilename = opts.filename ?? File.basename(path);
      const tempfile = Tempfile.new([this.originalFilename, File.extname(path)], undefined, {
        encoding: Encoding.BINARY,
      });
      if (binary) tempfile.binmode();
      FileUtils.copyFile(path, tempfile.path()!);
      this._tempfile = tempfile;
    }
    this.contentType = contentType;

    return methodMissingProxy(this, { delegate: (uploadedFile) => uploadedFile._tempfile });
  }

  get path(): string | undefined {
    return "path" in this._tempfile ? (this._tempfile.path() ?? undefined) : undefined;
  }

  get localPath(): string | undefined {
    return this.path;
  }
}
