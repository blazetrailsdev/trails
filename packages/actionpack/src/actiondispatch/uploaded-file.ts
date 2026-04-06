/**
 * ActionDispatch::Http::UploadedFile
 *
 * Represents a file uploaded via multipart form data.
 */

import { getPath } from "@blazetrails/activesupport";
import { getFs } from "@blazetrails/activesupport";

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

  constructor(options: UploadedFileOptions = {}) {
    if (!options.tempfile && options.content == null) {
      throw new Error("ArgumentError: either :tempfile or :content is required");
    }
    this.originalFilename = options.filename ?? "";
    this.contentType = options.type ?? "application/octet-stream";
    this.headers = options.head ?? "";
    this._tempfile = options.tempfile ?? null;
    this._content =
      options.content != null
        ? Buffer.isBuffer(options.content)
          ? options.content
          : Buffer.from(options.content)
        : null;
  }

  /** The file extension (including dot). */
  get extname(): string {
    return getPath().extname(this.originalFilename);
  }

  /** The file size in bytes. */
  get size(): number {
    if (this._content) return this._content.length;
    if (this._tempfile) {
      try {
        return getFs().statSync(this._tempfile).size;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  /** Read the file content. */
  read(): Buffer {
    if (this._content) return this._content;
    if (this._tempfile) {
      return getFs().readFileSync(this._tempfile);
    }
    return Buffer.alloc(0);
  }

  /** Read the file content as a string. */
  readAsString(encoding: BufferEncoding = "utf-8"): string {
    return this.read().toString(encoding);
  }

  /** Write content to the tempfile or in-memory buffer. */
  write(data: Buffer | string): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (this._content) {
      this._content = Buffer.concat([this._content, buf]);
    } else {
      this._content = buf;
    }
  }

  /** Rewind to the beginning (no-op for in-memory, resets read position). */
  rewind(): void {
    // No-op for in-memory storage
  }

  /** Close the file handle. */
  close(unlink?: boolean): void {
    if (unlink && this._tempfile) {
      const tempPath = this._tempfile;
      try {
        getFs().unlinkSync(tempPath);
        this._tempfile = null;
      } catch {
        try {
          if (!getFs().existsSync(tempPath)) {
            this._tempfile = null;
          }
        } catch {
          // Leave _tempfile as-is if existence check fails.
        }
      }
    }
    this._closed = true;
  }

  /** Whether the file has been closed. */
  get closed(): boolean {
    return this._closed;
  }

  /** Whether the file is empty (zero bytes). */
  get empty(): boolean {
    return this.size === 0;
  }

  /** Get the tempfile path. */
  get tempfilePath(): string | null {
    return this._tempfile;
  }

  /** Check if this looks like a valid uploaded file. */
  get valid(): boolean {
    return this.originalFilename.length > 0 && this.size > 0;
  }

  /** String representation. */
  toString(): string {
    return `#<ActionDispatch::Http::UploadedFile filename="${this.originalFilename}" content_type="${this.contentType}" size=${this.size}>`;
  }

  /** Inspect (same as toString). */
  inspect(): string {
    return this.toString();
  }
}
