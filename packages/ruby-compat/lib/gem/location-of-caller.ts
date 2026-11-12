import { Location } from "../backtrace-location.js";

/**
 * `vendor/ruby/v3.3.11/lib/rubygems.rb:626-632` — `Gem.location_of_caller`:
 * the `[file, lineno]` of `caller[depth]`, counted from the method that
 * calls it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem.location_of_caller`.
 */
export function locationOfCaller(depth = 1): [string, number] {
  const location = new Location(new Error().stack?.split("\n")[2 + depth] ?? "");
  return [location.path, location.lineno];
}
