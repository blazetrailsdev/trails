import { File } from "@blazetrails/ruby-compat";

import { Template } from "../template.js";

export class RawFile {
  type: ReturnType<(typeof Template.Types)["get"]>;

  format: string;

  private readonly filename: string;

  constructor(filename: unknown) {
    this.filename = filename == null ? "" : String(filename);
    const extname = File.extname(this.filename).replaceAll(".", "");
    this.type = Template.Types.get(extname) ?? Template.Types.get(":text");
    this.format = this.type!.symbol!;
  }

  get identifier(): string {
    return this.filename;
  }

  render(..._args: unknown[]): string {
    return File.read(this.filename);
  }
}
