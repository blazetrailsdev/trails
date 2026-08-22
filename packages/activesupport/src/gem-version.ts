/** Mirrors: `ActiveSupport::VERSION` (gem_version.rb:9-16). */
export const VERSION = {
  MAJOR: 8,
  MINOR: 0,
  TINY: 2,
  PRE: null as string | null,
  get STRING(): string {
    return [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]
      .filter((p) => p != null)
      .join(".");
  },
};

/**
 * Returns the currently loaded version of Active Support as a +Gem::Version+.
 *
 * Mirrors: `ActiveSupport.gem_version` (gem_version.rb:5-7).
 *
 * @missingRailsCall new — PERMANENT: `Gem::Version.new VERSION::STRING` (gem_version.rb:6)
 *   wraps the version in RubyGems' comparable Version object. `Gem` is the
 *   RubyGems stdlib, not Rails, and trails ports no `Gem::Version`, so
 *   `gemVersion` answers `VERSION.STRING` itself — the same value, unwrapped —
 *   exactly as every other package's `gemVersion` does.
 */
export function gemVersion(): string {
  return VERSION.STRING;
}
