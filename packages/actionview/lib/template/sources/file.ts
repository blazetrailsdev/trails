import { File as RubyFile, loadedFileExports } from "@blazetrails/ruby-compat";

export class File {
  private readonly _filename: string;

  constructor(filename: string) {
    this._filename = filename;
  }

  toString(): string {
    const compiled = loadedFileExports(this._filename);
    // @inventedArm if — PERMANENT
    if (typeof compiled?.source === "string") return compiled.source;
    let source = "";
    for (const byte of RubyFile.binread(this._filename)) source += String.fromCharCode(byte);
    return source;
  }
}
