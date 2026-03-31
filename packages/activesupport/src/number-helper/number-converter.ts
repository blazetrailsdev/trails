export abstract class NumberConverter<TOptions = Record<string, unknown>> {
  protected number: unknown;
  protected opts: TOptions;

  static convert(number: unknown, options?: any): string {
    return new (this as any)(number, options ?? {}).execute();
  }

  constructor(number: unknown, options: TOptions = {} as TOptions) {
    this.number = number;
    this.opts = options;
  }

  execute(): string {
    if (this.number === null || this.number === undefined) return String(this.number);
    if (this.validateFloat && !this.isValidFloat()) return String(this.number);
    return this.convert();
  }

  protected abstract convert(): string;

  protected get validateFloat(): boolean {
    return false;
  }

  protected isValidFloat(): boolean {
    const n = Number(this.number);
    return !isNaN(n) && isFinite(n);
  }

  protected numberAsFloat(): number {
    return Number(this.number);
  }
}
