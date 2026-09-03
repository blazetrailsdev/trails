import { hasKey } from "@blazetrails/ruby-compat";
import type { DurationParts } from "../duration.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { isEmpty } from "@blazetrails/ruby-compat";

/**
 * Ruby's `strscan` has no JS counterpart, so the slice of `StringScanner`
 * this parser uses is ported here at its Ruby names, as
 * `core-ext/tse/util.ts:134` does for the slice `ERB::Util.tokenize` uses.
 * `scanner[n]` is a group of the last match, spelled `group(n)` because TS has
 * no index operator to overload.
 */
class StringScanner {
  matched: string | null = null;
  private groups: (string | undefined)[] = [];
  private pos = 0;

  constructor(readonly string: string) {}

  /** Ruby: `StringScanner#eos?` */
  isEos(): boolean {
    return this.pos >= this.string.length;
  }

  /**
   * Ruby: `StringScanner#scan` — match anchored at `pos`, advancing on a hit.
   *
   * @internal
   */
  scan(pattern: RegExp): string | null {
    const re = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}y`);
    re.lastIndex = this.pos;
    const m = re.exec(this.string);
    this.matched = m === null ? null : m[0];
    this.groups = m === null ? [] : Array.from(m);
    if (m !== null) this.pos = m.index + m[0].length;
    return this.matched;
  }

  /** Ruby: `StringScanner#[]` */
  group(n: number): string | undefined {
    return this.groups[n];
  }
}

/**
 * Mirrors: ActiveSupport::Duration::ISO8601Parser::ParsingError
 * (duration/iso8601_parser.rb:13). Ruby's parent is `::ArgumentError`, and the
 * Rails class name lives on `name`.
 *
 * The TS base is `Error` rather than `hash-utils.ts`'s
 * `ArgumentError` port, for two independent reasons. (1) `::ArgumentError` is
 * a Ruby hierarchy ROOT, and `blazetrails/rails-error-parity`
 * (`eslint/rails-error-parity.mjs:50,157-165`) requires the TS mirror of a
 * root-based Rails error to extend a global `Error` constructor — extending
 * the port is a lint error, not a choice. (2) `hash-utils.ts` imports
 * `xml-mini.ts` (`hash-utils.ts:6`), which imports `duration.ts`
 * (`xml-mini.ts:7`), which imports this module: importing the port closes that
 * cycle and evaluates this `extends` clause with its base still in TDZ
 * (`Class extends value undefined`, measured on this branch). Ruby has neither
 * constraint — Zeitwerk resolves `::ArgumentError` at raise time.
 */
export class ParsingError extends Error {
  override name = "ParsingError";
}

const PERIOD_OR_COMMA = /\.|,/;
const PERIOD = ".";
const COMMA = ",";

const SIGN_MARKER = /-|\+|/;
const DATE_MARKER = /P/;
const TIME_MARKER = /T/;
const DATE_COMPONENT = /(-?\d+(?:[.,]\d+)?)(Y|M|D|W)/;
const TIME_COMPONENT = /(-?\d+(?:[.,]\d+)?)(H|M|S)/;

const DATE_TO_PART: Record<string, keyof DurationParts> = {
  Y: "years",
  M: "months",
  W: "weeks",
  D: "days",
};
const TIME_TO_PART: Record<string, keyof DurationParts> = {
  H: "hours",
  M: "minutes",
  S: "seconds",
};

const DATE_COMPONENTS: (keyof DurationParts)[] = ["years", "months", "days"];
const TIME_COMPONENTS: (keyof DurationParts)[] = ["hours", "minutes", "seconds"];

/**
 * Parses a string formatted according to ISO 8601 Duration into the hash.
 *
 * See {ISO 8601}[https://en.wikipedia.org/wiki/ISO_8601#Durations] for more
 * information.
 *
 * This parser allows negative parts to be present in pattern.
 *
 * Mirrors: ActiveSupport::Duration::ISO8601Parser
 * (duration/iso8601_parser.rb:12-113).
 */
export class ISO8601Parser {
  readonly parts: Partial<DurationParts> = {};
  readonly scanner: StringScanner;
  mode: string;
  sign: number;

  constructor(string: string) {
    this.scanner = new StringScanner(string);
    this.mode = "start";
    this.sign = 1;
  }

  /**
   * Mirrors: `parse!` (iso8601_parser.rb:43-79). `SIGN_MARKER` has an empty
   * alternative, so a miss is `null` while a hit can be `""` — truthy in Ruby
   * and falsy in JS, hence each arm tests `!= null` rather than truthiness.
   */
  parseBang(): Partial<DurationParts> {
    while (!this.isFinished()) {
      switch (this.mode) {
        case "start":
          if (this.scan(SIGN_MARKER) != null) {
            this.sign = this.scanner.matched === "-" ? -1 : 1;
            this.mode = "sign";
          } else {
            this.raiseParsingError();
          }
          break;

        case "sign":
          if (this.scan(DATE_MARKER) != null) {
            this.mode = "date";
          } else {
            this.raiseParsingError();
          }
          break;

        case "date":
          if (this.scan(TIME_MARKER) != null) {
            this.mode = "time";
          } else if (this.scan(DATE_COMPONENT) != null) {
            this.parts[DATE_TO_PART[this.scanner.group(2) as string]] = this.number() * this.sign;
          } else {
            this.raiseParsingError();
          }
          break;

        case "time":
          if (this.scan(TIME_COMPONENT) != null) {
            this.parts[TIME_TO_PART[this.scanner.group(2) as string]] = this.number() * this.sign;
          } else {
            this.raiseParsingError();
          }
          break;
      }
    }

    this.validateBang();
    return this.parts;
  }

  private isFinished(): boolean {
    return this.scanner.isEos();
  }

  /** Parses number which can be a float with either comma or period. */
  private number(): number {
    const captured = this.scanner.group(1) as string;
    return PERIOD_OR_COMMA.test(captured)
      ? parseFloat(captured.split(COMMA).join(PERIOD))
      : parseInt(captured, 10);
  }

  private scan(pattern: RegExp): string | null {
    return this.scanner.scan(pattern);
  }

  /**
   * @missingRailsArgs inspect — PERMANENT: Ruby's `String#inspect`
   * (iso8601_parser.rb:97) is a zero-arg receiver call; trails' `inspect` is
   * the free function `rbInspect` (`@blazetrails/ruby-compat`), so the receiver is
   * spelled as its argument.
   */
  private raiseParsingError(reason: string | null = null): never {
    throw new ParsingError(
      `Invalid ISO 8601 duration: ${inspect(this.scanner.string)} ${reason ?? ""}`.trim(),
    );
  }

  /**
   * Checks for various semantic errors as stated in ISO 8601 standard.
   *
   * @missingRailsCall last — PERMANENT: Ruby's `Array#last`
   * (iso8601_parser.rb:108) is core; a JS array reads its final element as
   * `at(-1)`, a property-shaped call the extractor sees no name for.
   */
  private validateBang(): boolean {
    if (isEmpty(this.parts)) this.raiseParsingError("is empty duration");

    // Mixing any of Y, M, D with W is invalid.
    if (
      hasKey(this.parts, "weeks") &&
      DATE_COMPONENTS.some((component) => component in this.parts)
    ) {
      this.raiseParsingError("mixing weeks with other date parts not allowed");
    }

    // Specifying an empty T part is invalid.
    if (this.mode === "time" && !TIME_COMPONENTS.some((component) => component in this.parts)) {
      this.raiseParsingError("time part marker is present but time part is empty");
    }

    const nonZero = Object.values(this.parts).filter((value) => value !== 0);
    const fractions = nonZero.filter((a) => a % 1 !== 0);
    if (!(isEmpty(fractions) || (fractions.length === 1 && fractions.at(-1) === nonZero.at(-1)))) {
      this.raiseParsingError("(only last part can be fractional)");
    }

    return true;
  }
}
