import { XML } from "../namespaces.js";
export class SyntaxError extends Error {
  static aggregate(errors: SyntaxError[]): SyntaxError | null {
    if (errors.length === 0) return null;
    if (errors.length === 1) return errors[0];

    const messages = ["Multiple errors encountered:"];
    for (const error of errors) {
      messages.push(error.message);
    }
    return new this(messages.join("\n"));
  }

  readonly level: number;
  readonly line?: number;
  readonly column?: number;
  readonly file?: string | null;

  constructor(
    message: string,
    level = 0,
    line?: number,
    column?: number,
    file: string | null = null,
  ) {
    super(message);
    this.name = "Nokogiri::XML::SyntaxError";
    this.level = level;
    this.line = line;
    this.column = column;
    this.file = file;
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

XML.SyntaxError = SyntaxError;
