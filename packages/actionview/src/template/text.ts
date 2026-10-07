import { toS } from "@blazetrails/ruby-compat";

export class Text {
  type: unknown;

  private readonly string: string;

  constructor(string: unknown) {
    this.string = toS(string);
  }

  get identifier(): string {
    return "text template";
  }

  inspect(): string {
    return this.identifier;
  }

  toString(): string {
    return this.string;
  }

  render(..._args: unknown[]): string {
    return this.toString();
  }

  get format(): string {
    return ":text";
  }
}
