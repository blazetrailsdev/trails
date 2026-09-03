import { hasKey } from "@blazetrails/ruby-compat";
import type { DurationParts } from "../duration.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { isEmpty } from "@blazetrails/ruby-compat";

class StringScanner {
  matched: string | null = null;
  private groups: (string | undefined)[] = [];
  private pos = 0;

  constructor(readonly string: string) {}

  isEos(): boolean {
    return this.pos >= this.string.length;
  }

  /** @internal */
  scan(pattern: RegExp): string | null {
    const re = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}y`);
    re.lastIndex = this.pos;
    const m = re.exec(this.string);
    this.matched = m === null ? null : m[0];
    this.groups = m === null ? [] : Array.from(m);
    if (m !== null) this.pos = m.index + m[0].length;
    return this.matched;
  }

  group(n: number): string | undefined {
    return this.groups[n];
  }
}

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

  private number(): number {
    const captured = this.scanner.group(1) as string;
    return PERIOD_OR_COMMA.test(captured)
      ? parseFloat(captured.split(COMMA).join(PERIOD))
      : parseInt(captured, 10);
  }

  private scan(pattern: RegExp): string | null {
    return this.scanner.scan(pattern);
  }

  /** @missingRailsArgs inspect — PERMANENT */
  private raiseParsingError(reason: string | null = null): never {
    throw new ParsingError(
      `Invalid ISO 8601 duration: ${inspect(this.scanner.string)} ${reason ?? ""}`.trim(),
    );
  }

  /** @missingRailsCall last — PERMANENT */
  private validateBang(): boolean {
    if (isEmpty(this.parts)) this.raiseParsingError("is empty duration");

    if (
      hasKey(this.parts, "weeks") &&
      DATE_COMPONENTS.some((component) => component in this.parts)
    ) {
      this.raiseParsingError("mixing weeks with other date parts not allowed");
    }

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
