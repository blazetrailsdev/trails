import { getFs, getPath } from "@blazetrails/activesupport";

export interface UploadedFileTempfile {
  path?: string;
  read(): string | Buffer;
  rewind?(): void;
  write?(data: string | Buffer): void;
}

export interface UploadedFileOptions {
  path?: string | null;
  contentType?: string;
  binary?: boolean;
  filename?: string;
  io?: UploadedFileTempfile;
}

/**
 * Rack::Multipart::UploadedFile
 *
 * A wrapper around a tempfile-like object that holds the uploaded
 * content plus the original filename and content-type. Used by
 * Rack::Multipart::Generator for building mock multipart bodies and
 * by Rack::Multipart::Parser to expose parsed files.
 */
export class UploadedFile {
  readonly originalFilename: string;
  contentType: string;

  private _tempfile: UploadedFileTempfile;

  private _binary: boolean;

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
      if (!path || !getFs().existsSync(path)) {
        // Mirrors Ruby's `raise "#{path} file does not exist"` — Rails emits
        // an empty path prefix when nil, so use "" instead of "null".
        throw new Error(`${path ?? ""} file does not exist`);
      }
      this.originalFilename = opts.filename ?? getPath().basename(path);
      const content = getFs().readFileSync(path, binary ? "latin1" : "utf-8");
      this._tempfile = makeTempfile(content, path);
    }
    this.contentType = contentType;
    this._binary = binary;
  }

  /** The tempfile's path, if it has one. */
  get path(): string | undefined {
    return this._tempfile.path;
  }

  /** Alias of {@link path}. */
  get localPath(): string | undefined {
    return this._tempfile.path;
  }

  /** Read the tempfile content. */
  read(): string | Buffer {
    return this._tempfile.read();
  }

  /** @internal Direct access to the underlying tempfile for delegating consumers. */
  get tempfile(): UploadedFileTempfile {
    return this._tempfile;
  }

  /** Whether the file is in binary mode. Mirrors Ruby's `binmode?`. */
  get binmode(): boolean {
    return this._binary;
  }

  /**
   * @internal Compat shim for callers that read `filename` directly
   * (e.g. the existing Rack tests). Rails uses {@link originalFilename}.
   */
  get filename(): string {
    return this.originalFilename;
  }
}

function makeTempfile(content: string, path: string): UploadedFileTempfile {
  let pos = 0;
  return {
    path,
    read(): string {
      const result = content.slice(pos);
      pos = content.length;
      return result;
    },
    rewind(): void {
      pos = 0;
    },
  };
}
