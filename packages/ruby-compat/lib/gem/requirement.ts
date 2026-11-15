import { ArgumentError } from "../argument-error.js";
import { rbInspect } from "../object.js";
import { Version } from "./version.js";

type Op = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~>";

const OPS: Readonly<Record<Op, (v: Version, r: Version) => boolean>> = Object.freeze({
  "=": (v, r) => v.compare(r) === 0,
  "!=": (v, r) => v.compare(r) !== 0,
  ">": (v, r) => v.compare(r)! > 0,
  "<": (v, r) => v.compare(r)! < 0,
  ">=": (v, r) => v.compare(r)! >= 0,
  "<=": (v, r) => v.compare(r)! <= 0,
  "~>": (v, r) => v.compare(r)! >= 0 && v.release().compare(r.bump())! < 0,
});

const quoted = Object.keys(OPS)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const PATTERN_RAW = `\\s*(${quoted})?\\s*(${Version.VERSION_PATTERN})\\s*`;

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/requirement.rb:9` — `Gem::Requirement`,
 * answering `new`, `parse`, `requirements` and `satisfied_by?`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Requirement`.
 */
export class Requirement {
  /** @noRailsEquivalent PERMANENT */
  static readonly OPS = OPS;

  /** @noRailsEquivalent PERMANENT */
  static readonly PATTERN = new RegExp(`^${PATTERN_RAW}$`);

  /** @noRailsEquivalent PERMANENT */
  static readonly DefaultRequirement: readonly [Op, Version] = Object.freeze([
    ">=",
    new Version(0),
  ]);

  /** @noRailsEquivalent PERMANENT */
  static readonly DefaultPrereleaseRequirement: readonly [Op, Version] = Object.freeze([
    ">=",
    new Version("0.a"),
  ]);

  /** @noRailsEquivalent PERMANENT */
  static readonly BadRequirementError = class BadRequirementError extends ArgumentError {};

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems/requirement.rb:103-117`.
   *
   * @noRailsEquivalent PERMANENT
   */
  static parse(obj: unknown): readonly [Op, Version] {
    if (obj instanceof Version) return ["=", obj];

    const m = Requirement.PATTERN.exec(String(obj));
    if (m === null) {
      throw new Requirement.BadRequirementError(`Illformed requirement [${rbInspect(obj)}]`);
    }

    if (m[1] === ">=" && m[2] === "0") {
      return Requirement.DefaultRequirement;
    } else if (m[1] === ">=" && m[2] === "0.a") {
      return Requirement.DefaultPrereleaseRequirement;
    } else {
      return [(m[1] ?? "=") as Op, new Version(m[2])];
    }
  }

  /** @noRailsEquivalent PERMANENT */
  readonly requirements: (readonly [Op, Version])[];

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems/requirement.rb:131-141`.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(...requirements: unknown[]) {
    requirements = [...new Set(requirements.flat(Infinity).filter((r) => r != null))];

    if (requirements.length === 0) {
      this.requirements = [Requirement.DefaultRequirement];
    } else {
      this.requirements = requirements.map((r) => Requirement.parse(r));
    }
  }

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems/requirement.rb:242-246`.
   *
   * @noRailsEquivalent PERMANENT
   */
  isSatisfiedBy(version: unknown): boolean {
    if (!(version instanceof Version)) {
      throw new ArgumentError(`Need a Gem::Version: ${rbInspect(version)}`);
    }
    return this.requirements.every(([op, rv]) => OPS[op](version, rv));
  }
}
