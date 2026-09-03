import { File } from "@blazetrails/ruby-compat";

export interface UploadedFileOptions {
  filename?: string;
  type?: string;
  head?: string;
  tempfile?: string;
  content?: Buffer | string;
}

export class UploadedFile {
  readonly originalFilename: string;
  readonly contentType: string;
  readonly headers: string;
  private _tempfile: string | null;
  private _content: Buffer | null;
  private _closed: boolean = false;

  constructor(hash: UploadedFileOptions = {}) {
    if (!hash.tempfile && hash.content == null) {
      throw new Error("ArgumentError: either :tempfile or :content is required");
    }
    this.originalFilename = hash.filename ?? "";
    this.contentType = hash.type ?? "application/octet-stream";
    this.headers = hash.head ?? "";
    this._tempfile = hash.tempfile ?? null;
    this._content =
      hash.content != null
        ? Buffer.isBuffer(hash.content)
          ? hash.content
          : Buffer.from(hash.content)
        : null;
  }

  get extname(): string {
    return File.extname(this.originalFilename);
  }

  get size(): number {
    if (this._content) return this._content.length;
    if (this._tempfile) {
      try {
        return File.stat(this._tempfile).size;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  /** @missingRailsArgs read — CONVERGEABLE uploaded-file-read-drops-rails-length-and-buffer-arguments */
  read(): Buffer {
    if (this._content) return this._content;
    if (this._tempfile) {
      return Buffer.from(
        File.open(this._tempfile, "rb", (file) => file.read()),
        "latin1",
      );
    }
    return Buffer.alloc(0);
  }

  readAsString(encoding: BufferEncoding = "utf-8"): string {
    return this.read().toString(encoding);
  }

  write(data: Buffer | string): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (this._content) {
      this._content = Buffer.concat([this._content, buf]);
    } else {
      this._content = buf;
    }
  }

  rewind(): void {}

  close(unlinkNow = false): void {
    if (unlinkNow && this._tempfile) {
      const tempPath = this._tempfile;
      try {
        File.delete(tempPath);
        this._tempfile = null;
      } catch {
        try {
          if (!File.isExist(tempPath)) {
            this._tempfile = null;
          }
        } catch {
          /** @empty */
        }
      }
    }
    this._closed = true;
  }

  get closed(): boolean {
    return this._closed;
  }

  get empty(): boolean {
    return this.size === 0;
  }

  get tempfilePath(): string | null {
    return this._tempfile;
  }

  get tempfile(): string | null {
    return this._tempfile;
  }
  set tempfile(value: string | null) {
    this._tempfile = value;
  }

  open(): Buffer {
    this._closed = false;
    return this.read();
  }

  path(): string | null {
    return this._tempfile;
  }

  toPath(): string | null {
    return this._tempfile;
  }

  isEof(): boolean {
    return this.size === 0;
  }

  toIo(): Buffer {
    return this.read();
  }

  get valid(): boolean {
    return this.originalFilename.length > 0 && this.size > 0;
  }

  toString(): string {
    return `#<ActionDispatch::Http::UploadedFile filename="${this.originalFilename}" content_type="${this.contentType}" size=${this.size}>`;
  }

  inspect(): string {
    return this.toString();
  }
}
