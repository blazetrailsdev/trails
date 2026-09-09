import { h, type SafeBuffer } from "@blazetrails/activesupport";

export class HTML {
  readonly type: unknown;

  private readonly string: string;

  constructor(string: unknown, type: unknown) {
    this.string = string == null ? "" : String(string);
    this.type = type;
  }

  identifier(): string {
    return "html template";
  }

  inspect(): string {
    return this.identifier();
  }

  toString(): SafeBuffer {
    return h(this.string);
  }

  render(..._args: unknown[]): SafeBuffer {
    return this.toString();
  }

  format(): unknown {
    return this.type;
  }
}
