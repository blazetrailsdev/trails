import {
  ArgumentError,
  hashAref,
  type File,
  type Hash,
  type Tempfile,
} from "@blazetrails/ruby-compat";

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

  constructor(hash: UploadedFileOptions | Hash<string, unknown>) {
    this.tempfile = hashAref(hash, "tempfile") as Tempfile;
    if (this.tempfile == null) throw new ArgumentError(":tempfile is required");

    this.contentType = (hashAref(hash, "type") as string | null) ?? null;

    if (hashAref(hash, "filename") != null) {
      this.originalFilename = hashAref(hash, "filename") as string;
    } else {
      this.originalFilename = null;
    }

    if (hashAref(hash, "head") != null) {
      this.headers = hashAref(hash, "head") as string;
    } else {
      this.headers = null;
    }
  }

  read(): string;
  read(length: number | null, buffer?: Uint8Array | null): string | Uint8Array | null;
  read(length: number | null = null, buffer: Uint8Array | null = null): string | Uint8Array | null {
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
