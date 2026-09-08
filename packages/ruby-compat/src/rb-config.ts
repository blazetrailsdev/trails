import { getOs } from "./os-adapter.js";

/**
 * `vendor/ruby/tool/mkconfig.rb:21` — `RbConfig::CONFIG`, the build configuration hash Ruby's `rbconfig.rb`
 * defines. Only the keys trails' ports read are answered; `EXEEXT` is the
 * executable suffix a DOSISH build appends and the empty string everywhere
 * else, which is what `ActiveRecord::ConnectionAdapters::AbstractAdapter
 * .find_cmd_and_exec` (`abstract_adapter.rb:95`) tests for emptiness.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `RbConfig`.
 */
export const RbConfig = {
  /**
   * `vendor/ruby/tool/mkconfig.rb:394` — the config hash itself, read as
   * `RbConfig::CONFIG["EXEEXT"]`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `RbConfig::CONFIG`.
   */
  get CONFIG(): Readonly<Record<string, string>> {
    return { EXEEXT: getOs().platform() === "win32" ? ".exe" : "" };
  },
};
