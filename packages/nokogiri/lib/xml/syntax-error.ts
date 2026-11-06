export class SyntaxError extends Error {
  readonly level: number;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, level: number, line?: number, column?: number) {
    super(message);
    this.name = "Nokogiri::XML::SyntaxError";
    this.level = level;
    this.line = line;
    this.column = column;
  }

  isNone(): boolean {
    return this.level === 0;
  }

  isWarning(): boolean {
    return this.level === 1;
  }

  isError(): boolean {
    return this.level === 2;
  }

  isFatal(): boolean {
    return this.level === 3;
  }
}
