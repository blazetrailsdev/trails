import { ArgumentError, type File, type Tempfile } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export interface UploadedFileOptions {
  tempfile?: Tempfile;
  filename?: string;
  type?: string;
  head?: string;
}

export class UploadedFile {
  originalFilename: string | null;
  contentType: string | null;
  tempfile: Tempfile;
  headers: string | null;

  constructor(hash: UploadedFileOptions) {
    this.tempfile = hash.tempfile!;
    if (this.tempfile == null) throw new ArgumentError(":tempfile is required");

    this.contentType = hash.type ?? null;

    if (hash.filename != null) {
      this.originalFilename = hash.filename;
    } else {
      this.originalFilename = null;
    }

    if (hash.head != null) {
      this.headers = hash.head;
    } else {
      this.headers = null;
    }
  }

  read(): string;
  read(length: number | null, buffer?: Uint8Array | null): string | null;
  read(length: number | null = null, buffer: Uint8Array | null = null): string | null {
    return this.tempfile.read(length, buffer);
  }

  open(): File {
    return this.tempfile.open();
  }

  close(unlinkNow = false): void {
    this.tempfile.close(unlinkNow);
  }

  path(): string | null {
    return this.tempfile.path();
  }

  toPath(): string | null {
    return this.tempfile.toPath();
  }

  rewind(): number {
    return this.tempfile.rewind();
  }

  size(): number {
    return this.tempfile.size();
  }

  isEof(): boolean {
    return this.tempfile.isEof();
  }

  toIo(): File {
    return this.tempfile.toIo();
  }
}
