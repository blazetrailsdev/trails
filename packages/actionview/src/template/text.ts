import { toS } from "@blazetrails/ruby-compat";

export class Text {
  type: unknown;

  private readonly string: string | Uint8Array;

  constructor(string: unknown) {
    this.string = toS(string);
  }

  get identifier(): string {
    return "text template";
  }

  inspect(): string {
    return this.identifier;
  }

  toString(): string | Uint8Array {
    return this.string;
  }

  render(..._args: unknown[]): string | Uint8Array {
    return this.toString();
  }

  get format(): string {
    return ":text";
  }
}
