import { Deprecate } from "./gem/deprecate.js";
import { Version } from "./gem/version.js";
import { getOs } from "./os-adapter.js";
import { RbConfig } from "./rb-config.js";

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

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems.rb:121` — `Gem::WIN_PATTERNS`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::WIN_PATTERNS`.
   */
  WIN_PATTERNS: [/bccwin/i, /cygwin/i, /djgpp/i, /mingw/i, /mswin/i, /wince/i],

  /**
   * `vendor/ruby/v3.3.11/lib/rubygems.rb:1000` — `Gem.win_platform?`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem.win_platform?`.
   */
  isWinPlatform(): boolean {
    const rubyPlatform = RbConfig.CONFIG["host_os"];
    return Gem.WIN_PATTERNS.find((r) => r.test(rubyPlatform)) !== undefined;
  },
};
