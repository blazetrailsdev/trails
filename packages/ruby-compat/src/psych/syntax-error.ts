import { Exception } from "./exception.js";

/**
 * `Psych::SyntaxError` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/syntax_error.rb:5-21`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class SyntaxError extends Exception {
  /** @noRailsEquivalent PERMANENT */
  readonly file: string | null;
  /** @noRailsEquivalent PERMANENT */
  readonly line: number;
  /** @noRailsEquivalent PERMANENT */
  readonly column: number;
  /** @noRailsEquivalent PERMANENT */
  readonly offset: number;
  /** @noRailsEquivalent PERMANENT */
  readonly problem: string | null;
  /** @noRailsEquivalent PERMANENT */
  readonly context: string | null;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    file: string | null,
    line: number,
    col: number,
    offset: number,
    problem: string | null,
    context: string | null,
  ) {
    const err = [problem, context].filter((part) => part != null).join(" ");
    const filename = file ?? "<unknown>";
    const message = `(${filename}): ${err} at line ${line} column ${col}`;

    super(message);
    this.file = file;
    this.line = line;
    this.column = col;
    this.offset = offset;
    this.problem = problem;
    this.context = context;
  }
}

SyntaxError.prototype.name = "Psych::SyntaxError";
