import { ArgumentError } from "./argument-error.js";
import { warn } from "./kernel-warn.js";
import { getOs } from "./os-adapter.js";

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/deprecate.rb:73` — `Gem::Deprecate`,
 * answering only `skip` (`:74-76`), which `Gem::Version` reads.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Deprecate`.
 */
const Deprecate = { skip: false };

const VERSION_PATTERN = "[0-9]+(?:\\.[0-9a-zA-Z]+)*(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?";

const all = new Map<string | number | null, Version>();

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/version.rb:155` — `Gem::Version`,
 * answering only what trails' ports call: `new`, `correct?` and `version` /
 * `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Version`.
 */
class Version {
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

/**
 * `vendor/ruby/v3.3.11/lib/rubygems.rb:11` — `Gem`, answering only the keys trails'
 * ports read: where installed packages live. A Node package is installed under the
 * project's `node_modules`, which is RubyGems' `GEM_HOME`. A runtime with no
 * OS adapter has no working directory, so the directory stays relative to it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem`.
 */
export const Gem = {
  Deprecate,
  Version,

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems/defaults.rb:37` — `Gem.default_dir`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem.default_dir`.
   */
  get defaultDir(): string {
    try {
      return `${getOs().cwd()}/node_modules`;
    } catch {
      return "node_modules";
    }
  },

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems.rb:391` — `Gem.path`, the directories searched
   * for installed packages.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem.path`.
   */
  get path(): string[] {
    return [Gem.defaultDir];
  },
};
