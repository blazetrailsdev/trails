import {
  ArgumentError,
  Encoding,
  File,
  FileUtils,
  NoMethodError,
  RuntimeError,
  StringIO,
  Tempfile,
  methodMissingProxy,
  rbObjClass,
} from "@blazetrails/ruby-compat";

export class UploadedFile {
  originalFilename: string | null;

  tempfile!: Tempfile | StringIO;

  contentType: string;

  constructor(
    content: StringIO | string,
    contentType: string = "text/plain",
    binary: boolean = false,
    { originalFilename = null }: { originalFilename?: string | null } = {},
  ) {
    this.contentType = contentType;
    this.originalFilename = originalFilename;

    if (content instanceof StringIO) {
      this.initializeFromStringio(content);
    } else {
      this.initializeFromFilePath(content);
    }

    if (binary) this.tempfile.binmode();

    return methodMissingProxy(this, { delegate: (uploadedFile) => uploadedFile.tempfile });
  }

  get path(): string | null {
    const tempfile = this.tempfile;
    if (!("path" in tempfile)) {
      throw new NoMethodError(`undefined method 'path' for an instance of ${rbObjClass(tempfile)}`);
    }
    return tempfile.path;
  }

  get localPath(): string | null {
    return this.path;
  }

  /**
   * Append to given buffer in 64K chunks to avoid multiple large
   * copies of file data in memory.  Rewind tempfile before and
   * after to make sure all data in tempfile is appended to the
   * buffer.
   *
   * Ruby's `buf` is a mutable String `readpartial` refills in place
   * (`vendor/ruby/io.c:3590`); JS strings are immutable, so the reusable buffer
   * is the `Uint8Array` `IO#read`'s `str` argument already takes.
   *
   * @missingRailsArgs new — PERMANENT: a JS string is immutable, so Ruby's reusable `String.new` buffer is a sized `Uint8Array`
   */
  appendTo(buffer: StringIO): null {
    this.tempfile.rewind();

    const buf = new Uint8Array(65_536);
    while (!this.tempfile.isEof()) buffer.write(this.tempfile.readpartial(65_536, buf));

    this.tempfile.rewind();

    return null;
  }

  private initializeFromStringio(stringio: StringIO): void {
    if (this.originalFilename == null)
      throw new ArgumentError("Missing `original_filename` for StringIO object");

    this.tempfile = stringio;
  }

  private initializeFromFilePath(path: string): void {
    if (!File.isExist(path)) throw new RuntimeError(`${path} file does not exist`);

    this.originalFilename ??= File.basename(path);
    const extension = File.extname(this.originalFilename);

    this.tempfile = Tempfile.new([File.basename(this.originalFilename, extension), extension]);
    this.tempfile.setEncoding(Encoding.BINARY);

    FileUtils.copyFile(path, this.tempfile.path!);
  }
}
