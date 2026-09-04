import { Encoding, File, FileUtils, StringIO, Tempfile } from "@blazetrails/ruby-compat";

export interface UploadedFileOptions {
  path?: string | null;
  contentType?: string;
  binary?: boolean;
  filename?: string;
  io?: StringIO;
}

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
      FileUtils.copyFile(path, tempfile.path!);
      this._tempfile = tempfile;
    }
    this.contentType = contentType;
  }

  get path(): string | undefined {
    return "path" in this._tempfile ? (this._tempfile.path ?? undefined) : undefined;
  }

  get localPath(): string | undefined {
    return this.path;
  }

  read(): string {
    return this._tempfile.read();
  }

  /**
   * @internal Direct access to the underlying tempfile for delegating consumers.
   * @noRailsEquivalent CONVERGEABLE Rack reaches the tempfile through
   * `method_missing` delegation (uploaded_file.rb:39), which forwards to
   * `@tempfile` rather than exposing a reader.
   */
  get tempfile(): Tempfile | StringIO {
    return this._tempfile;
  }

  /**
   * `binmode?` (`vendor/ruby/io.c:6400`), reached through
   * `UploadedFile#method_missing`
   * (`vendor/rack/lib/rack/multipart/uploaded_file.rb:39`) and so answered by
   * the tempfile — an `io:` stand-in that has no `binmode?` raises, as
   * `StringIO` does in Ruby.
   */
  isBinmode(): boolean {
    return (this._tempfile as Tempfile).isBinmode();
  }

  /**
   * @internal Compat shim for callers that read `filename` directly
   * (e.g. the existing Rack tests). Rails uses {@link originalFilename}.
   * @noRailsEquivalent CONVERGEABLE `Rack::Multipart::UploadedFile` exposes only
   * `original_filename` (uploaded_file.rb:10); the callers should read that.
   */
  get filename(): string {
    return this.originalFilename;
  }
}
