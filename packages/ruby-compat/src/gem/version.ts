import { ArgumentError } from "../argument-error.js";
import { warn } from "../kernel-warn.js";
import { rbObjAsString } from "../object.js";
import { rbEqual } from "../rb-equal.js";
import { Deprecate } from "./deprecate.js";

const VERSION_PATTERN = "[0-9]+(?:\\.[0-9a-zA-Z]+)*(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?";

const all = new Map<string | number | null, Version>();

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/version.rb:155` — `Gem::Version`,
 * answering only what trails' ports call: `new`, `correct?`, `version` /
 * `to_s`, and `<=>` (`version.rb:361-389`, spelled `compare`) with its
 * `prerelease?` and `canonical_segments` (`:311-316`, `:392-401`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Version`.
 */
export class Version {
  /** @noRailsEquivalent PERMANENT */
  static readonly VERSION_PATTERN = VERSION_PATTERN;

  /** @noRailsEquivalent PERMANENT */
  static readonly ANCHORED_VERSION_PATTERN = new RegExp(`^\\s*(${VERSION_PATTERN})?\\s*$`);

  #version!: string;
  #prerelease?: boolean;
  #canonicalSegments?: (number | string)[];

  /** @noRailsEquivalent PERMANENT */
  get version(): string {
    return this.#version;
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    return this.version;
  }

  /** @noRailsEquivalent PERMANENT */
  isPrerelease(): boolean {
    this.#prerelease ??= /[a-zA-Z]/.test(this.version);
    return this.#prerelease;
  }

  /** @noRailsEquivalent PERMANENT */
  compare(other: unknown): number | null {
    if (typeof other === "string" && (this.constructor as typeof Version).isCorrect(other)) {
      return this.compare(new (this.constructor as typeof Version)(other));
    }

    if (!(other instanceof Version)) return null;
    if (this.#version === other.version || rbEqual(this.canonicalSegments, other.canonicalSegments))
      return 0;

    const lhsegments = this.canonicalSegments;
    const rhsegments = other.canonicalSegments;

    const lhsize = lhsegments.length;
    const rhsize = rhsegments.length;
    const limit = (lhsize > rhsize ? lhsize : rhsize) - 1;

    let i = 0;

    while (i <= limit) {
      const lhs = lhsegments[i] ?? 0;
      const rhs = rhsegments[i] ?? 0;
      i += 1;

      if (lhs === rhs) continue;
      if (typeof lhs === "string" && typeof rhs === "number") return -1;
      if (typeof lhs === "number" && typeof rhs === "string") return 1;

      return lhs < rhs ? -1 : 1;
    }

    return 0;
  }

  /** @noRailsEquivalent PERMANENT */
  get canonicalSegments(): (number | string)[] {
    if (this.#canonicalSegments === undefined) {
      let canonicalVersion = this.#version.replace(/(?<=[a-zA-Z.])[.0]+$/, "");
      if (this.isPrerelease()) {
        canonicalVersion = canonicalVersion.replace(/(?<=\.|^)[0.]+(?=[a-zA-Z])/, "");
      }
      this.#canonicalSegments = this.partitionSegments(canonicalVersion);
    }
    return this.#canonicalSegments;
  }

  private partitionSegments(ver: string): (number | string)[] {
    return (ver.match(/\d+|[a-z]+/gi) ?? []).map((s) => (/^\d/.test(s) ? parseInt(s, 10) : s));
  }

  /** @noRailsEquivalent PERMANENT */
  static isCorrect(version: string | number | null): boolean {
    if (version == null) Version.nilVersionsAreDiscouragedBang();

    return Version.ANCHORED_VERSION_PATTERN.test(rbObjAsString(version));
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

    this.#version = rbObjAsString(version);

    if (!Number.isInteger(version)) {
      this.#version = this.#version.trim();
      this.#version = this.#version.replaceAll("-", ".pre.");
    }
    if (new.target === Version) all.set(version, this);
  }
}
