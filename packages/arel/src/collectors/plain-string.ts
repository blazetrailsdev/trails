export class PlainString {
  private str = "";

  get value(): string {
    return this.str;
  }

  append(str: string): this {
    this.str += str;
    return this;
  }
}
