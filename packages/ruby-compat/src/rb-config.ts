import { File } from "./file.js";
import { getOs } from "./os-adapter.js";
import { getProcessAdapter } from "./process-adapter.js";

/**
 * `vendor/ruby/v3.3.11/tool/mkconfig.rb:21` — `RbConfig::CONFIG`, the build configuration hash Ruby's `rbconfig.rb`
 * defines. Only the keys trails' ports read are answered; `EXEEXT` is the
 * executable suffix a DOSISH build appends and the empty string everywhere
 * else, which is what `ActiveRecord::ConnectionAdapters::AbstractAdapter
 * .find_cmd_and_exec` (`abstract_adapter.rb:95`) tests for emptiness.
 * `rubylibdir` is where the standard library's frames come from, which in
 * Node is the `node:` scheme. `bindir` and `ruby_install_name` locate the
 * running interpreter, which here is the JS runtime's executable: its
 * directory, and its file name less `EXEEXT`, so that
 * `File.join(bindir, ruby_install_name) + EXEEXT` is the executable's path, as
 * `Thor::Util.ruby_command` (`vendor/thor/v1.3.2/lib/thor/util.rb:223-225`)
 * builds it. Both are read from the process adapter on access, and are empty
 * where the host names no executable.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `RbConfig`.
 */
export const RbConfig = {
  /**
   * `vendor/ruby/v3.3.11/tool/mkconfig.rb:394` — the config hash itself, read as
   * `RbConfig::CONFIG["EXEEXT"]` and `RbConfig::CONFIG["host_os"]`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `RbConfig::CONFIG`.
   */
  get CONFIG(): Readonly<Record<string, string>> {
    const platform = getOs().platform();
    const EXEEXT = platform === "win32" ? ".exe" : "";
    const execPath = () => getProcessAdapter().execPath?.() ?? "";
    return {
      EXEEXT,
      host_os: platform === "win32" ? "mingw32" : platform,
      rubylibdir: "node:",
      get bindir() {
        return execPath() === "" ? "" : File.dirname(execPath());
      },
      get ruby_install_name() {
        return File.basename(execPath(), EXEEXT);
      },
    };
  },
};
