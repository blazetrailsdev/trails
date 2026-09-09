export class Text {
  type: unknown;

  private readonly string: string;

  constructor(string: unknown) {
    this.string = string == null ? "" : String(string);
  }

  identifier(): string {
    return "text template";
  }

  inspect(): string {
    return this.identifier();
  }

  toString(): string {
    return this.string;
  }

  render(..._args: unknown[]): string {
    return this.toString();
  }

  format(): string {
    return "text";
  }
}
