import { getChildProcessAsync } from "./child-process-adapter.js";
import { Errno } from "./errno.js";
import { rbExecargNew } from "./kernel-system.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { Process } from "./process.js";

/**
 * `Open3` (`vendor/ruby/v3.3.11/lib/open3.rb:81`), the member Thor's
 * `Actions#run` calls.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Open3`, which Thor requires
 * without defining.
 */
export const Open3 = {
  /**
   * `Open3.capture2e` (`vendor/ruby/v3.3.11/lib/open3.rb:902-929`) for
   * `capture2e([env,] command_line)`: runs the command through `popen2e`
   * (`open3.rb:508-525`) with stdin closed and stdout and stderr on one pipe,
   * and answers the combined output with the child's `Process::Status`. A
   * program that cannot be spawned raises from `popen_run`'s `spawn`
   * (`open3.rb:534`), `Errno::ENOENT` for a missing one. A host adapter without
   * `capture2e` raises `rb_notimplement`'s `NotImplementedError`
   * (`vendor/ruby/v3.3.11/error.c:3498-3502`), naming `spawn`, the C function it
   * reaches.
   *
   * `popen2e` hands the child one pipe as both `:out` and `:err`
   * (`open3.rb:519-520`). Node's `spawn` has no way to create a pipe before the
   * child exists, so the two streams arrive on separate pipes and are joined
   * in arrival order; output the child interleaves across them within one
   * read may land in a different order than Ruby's.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Open3.capture2e`.
   */
  async capture2e(
    ...cmd: [Record<string, string | null>, string] | [string]
  ): Promise<[string, InstanceType<typeof Process.Status>]> {
    const execarg = rbExecargNew(...cmd);
    const adapter = await getChildProcessAsync();
    if (adapter.capture2e === undefined) {
      throw new NotImplementedError("spawn() function is unimplemented on this machine");
    }
    const result = await adapter.capture2e(execarg.commandName, execarg.argv, {
      env: execarg.env,
    });
    if (result.error !== undefined) {
      if (result.error.code === "ENOENT") throw new Errno.ENOENT(execarg.commandName);
      throw result.error;
    }
    return [result.output, new Process.Status(result.status)];
  },
};
