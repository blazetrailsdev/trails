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
  private _pos: number = 0;

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

  /**
   * `UploadedFile#read(length = nil, buffer = nil)`
   * (`vendor/rails/actionpack/lib/action_dispatch/http/upload.rb:62-64`),
   * `@tempfile.read(length, buffer)` — `nil` length reads the rest of the
   * stream, a positive length answers `nil` at EOF (`vendor/ruby/io.c:3774`
   * `io_read`), and `buffer` receives the bytes.
   *
   * Rails' `@tempfile` is a `Tempfile` holding the read position; trails holds
   * the path, so the position is {@link rewind}'s and the stream is seeked to
   * it.
   */
  read(): Buffer;
  read(length: number | null, buffer?: Uint8Array | null): Buffer | null;
  read(length: number | null = null, buffer: Uint8Array | null = null): Buffer | null {
    if (this._content) {
      const bytes = this._content.subarray(
        this._pos,
        length == null ? undefined : this._pos + length,
      );
      if (length != null && length > 0 && bytes.length === 0) return null;
      this._pos += bytes.length;
      if (buffer) buffer.set(bytes.subarray(0, Math.min(bytes.length, buffer.length)));
      return Buffer.from(bytes);
    }
    if (this._tempfile) {
      const string = File.open(this._tempfile, "rb", (file) => {
        file.seek(this._pos);
        return file.read(length, buffer);
      });
      if (string == null) return null;
      this._pos += string.length;
      return Buffer.from(string, "latin1");
    }
    return length != null && length > 0 ? null : Buffer.alloc(0);
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

  /**
   * `UploadedFile#rewind`
   * (`vendor/rails/actionpack/lib/action_dispatch/http/upload.rb:87-89`),
   * `@tempfile.rewind` (`vendor/ruby/io.c:2565`): the next {@link read} starts
   * at byte 0 again.
   */
  rewind(): void {
    this._pos = 0;
  }

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
    this.rewind();
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
