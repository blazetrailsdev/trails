import { ArgumentError } from "../argument-error.js";
import { warn } from "../kernel-warn.js";
import { Deprecate } from "./deprecate.js";

const VERSION_PATTERN = "[0-9]+(?:\\.[0-9a-zA-Z]+)*(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?";

const all = new Map<string | number | null, Version>();

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/version.rb:155` — `Gem::Version`,
 * answering only what trails' ports call: `new`, `correct?` and `version` /
 * `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Version`.
 */
export class Version {
  /** @noRailsEquivalent PERMANENT */
  static readonly VERSION_PATTERN = VERSION_PATTERN;

  /** @noRailsEquivalent PERMANENT */
  static readonly ANCHORED_VERSION_PATTERN = new RegExp(`^\\s*(${VERSION_PATTERN})?\\s*$`);

  #version!: string;

  /** @noRailsEquivalent PERMANENT */
  get version(): string {
    return this.#version;
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    return this.version;
  }

  /** @noRailsEquivalent PERMANENT */
  static isCorrect(version: string | number | null): boolean {
    if (version == null) Version.nilVersionsAreDiscouragedBang();

    return Version.ANCHORED_VERSION_PATTERN.test(version == null ? "" : String(version));
  }

  private static nilVersionsAreDiscouragedBang(): void {
    if (!Deprecate.skip) {
      warn("nil versions are discouraged and will be deprecated in Rubygems 4");
    }
  }

  /** @noRailsEquivalent PERMANENT */
  constructor(version: string | number | null) {
    const memo = new.target === Version ? all.get(version) : undefined;
    if (memo) return memo;

    if (!(this.constructor as typeof Version).isCorrect(version)) {
      throw new ArgumentError(`Malformed version number string ${version ?? ""}`);
    }

    if (typeof version === "string" && /^\s*$/.test(version)) version = 0;

    this.#version = version == null ? "" : String(version);

    if (typeof version !== "number") {
      this.#version = this.#version.trim();
      this.#version = this.#version.replaceAll("-", ".pre.");
    }
    if (new.target === Version) all.set(version, this);
  }
}
