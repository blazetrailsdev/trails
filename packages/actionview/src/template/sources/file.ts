import { File as RubyFile } from "@blazetrails/ruby-compat";

export class File {
  private readonly _filename: string;

  constructor(filename: string) {
    this._filename = filename;
  }

  toString(): string {
    let source = "";
    for (const byte of RubyFile.binread(this._filename)) source += String.fromCharCode(byte);
    return source;
  }
}
