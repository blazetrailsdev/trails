/**
 * Mirrors: `Nokogiri::XML::SyntaxError` (nokogiri
 * `lib/nokogiri/xml/syntax_error.rb`) — the exception the parser collects into
 * `Nokogiri::XML::Document#errors` and that `raise doc.errors.first` raises.
 */
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
    this.name = "SyntaxError";
    this.level = level;
    this.line = line;
    this.column = column;
  }
}
