import { getOs } from "./os-adapter.js";

/**
 * `vendor/ruby/lib/rubygems.rb:11` — `Gem`, answering only the keys trails'
 * ports read: where installed packages live. A Node package is installed under the
 * project's `node_modules`, which is RubyGems' `GEM_HOME`. A runtime with no
 * OS adapter has no working directory, so the directory stays relative to it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem`.
 */
export const Gem = {
  /**
   * `vendor/ruby/lib/rubygems/defaults.rb:37` — `Gem.default_dir`.
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
   * `vendor/ruby/lib/rubygems.rb:391` — `Gem.path`, the directories searched
   * for installed packages.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem.path`.
   */
  get path(): string[] {
    return [Gem.defaultDir];
  },
};
