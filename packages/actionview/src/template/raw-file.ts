import { File } from "@blazetrails/ruby-compat";

import { Types } from "./types.js";

export class RawFile {
  type: Types;

  format: string;

  private readonly filename: string;

  constructor(filename: unknown) {
    this.filename = filename == null ? "" : String(filename);
    const extname = File.extname(this.filename).replaceAll(".", "");
    this.type = Types.get(extname) ?? Types.get("text");
    this.format = this.type.symbol;
  }

  get identifier(): string {
    return this.filename;
  }

  render(..._args: unknown[]): string {
    return File.read(this.filename);
  }
}
