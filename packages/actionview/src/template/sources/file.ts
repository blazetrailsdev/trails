import { File as RubyFile } from "@blazetrails/ruby-compat";

export class File {
  private readonly _filename: string;

  constructor(filename: string) {
    this._filename = filename;
  }

  toString(): string {
    return RubyFile.binread(this._filename);
  }
}
