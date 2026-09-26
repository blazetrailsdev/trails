import { h, SafeBuffer } from "@blazetrails/activesupport";

export class HTML {
  readonly type: unknown;

  private readonly string: string | SafeBuffer;

  constructor(string: unknown, type: unknown) {
    this.string = string == null ? "" : string instanceof SafeBuffer ? string : String(string);
    this.type = type;
  }

  get identifier(): string {
    return "html template";
  }

  inspect(): string {
    return this.identifier;
  }

  toString(): SafeBuffer {
    return h(this.string);
  }

  render(..._args: unknown[]): SafeBuffer {
    return this.toString();
  }

  get format(): unknown {
    return this.type;
  }
}
