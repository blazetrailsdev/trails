export class SyntaxError extends Error {
  readonly level: "warning" | "error" | "fatal";
  readonly line?: number;
  readonly column?: number;

  constructor(
    message: string,
    level: "warning" | "error" | "fatal",
    line?: number,
    column?: number,
  ) {
    super(message);
    this.name = "Nokogiri::XML::SyntaxError";
    this.level = level;
    this.line = line;
    this.column = column;
  }
}
