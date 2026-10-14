import { getChildProcess } from "./child-process-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { Process, rbExecargNew } from "./process.js";

/**
 * `Open3` (`vendor/ruby/v3.3.11/lib/open3.rb:81`), the sliver of it trails
 * calls.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Open3`
 * (`vendor/ruby/v3.3.11/lib/open3.rb:81`).
 */
export class Open3 {
  /**
   * `Open3.capture2e` (`vendor/ruby/v3.3.11/lib/open3.rb:902`) for the
   * `capture2e([env, ] command_line)` form `Thor::Actions#run` calls under
   * `capture: true` (`vendor/thor/v1.3.2/lib/thor/actions.rb:265`): the
   * command's stdout and stderr merged into one String, and its
   * `Process::Status`. The child reads an empty stdin, as it does once
   * `capture2e` has closed `i` with no `stdin_data` (`open3.rb:928`).
   *
   * A command that cannot be spawned raises what the spawn failed with, as
   * `Process.spawn` raises `Errno::ENOENT` (`open3.rb:892`).
   *
   * A host with no way to spawn raises `rb_notimplement`'s
   * `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498`), as
   * `Process.spawn` does there.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Open3.capture2e`
   * (`vendor/ruby/v3.3.11/lib/open3.rb:902`).
   */
  static async capture2e(
    ...cmd: [command: string] | [env: Record<string, string | null>, command: string]
  ): Promise<[string, InstanceType<typeof Process.Status>]> {
    const [command, env] = rbExecargNew(cmd);
    const adapter = getChildProcess();
    if (adapter.capture2e === undefined) {
      throw new NotImplementedError("spawn() function is unimplemented on this machine");
    }

    const [outerr, status] = await adapter.capture2e(command, env);
    if (status.error !== undefined) throw status.error;
    return [outerr, new Process.Status(status)];
  }
}
