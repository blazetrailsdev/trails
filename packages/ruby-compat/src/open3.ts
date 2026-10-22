import { getChildProcess } from "./child-process-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { isPlainHash } from "./object.js";
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

  /**
   * `Open3.capture3` (`vendor/ruby/v3.3.11/lib/open3.rb:648-681`): the
   * command's stdout and stderr as two Strings, and its `Process::Status`.
   * `stdin_data` (default `""`, `open3.rb:655`) is written to the child's
   * stdin, which is then closed (`open3.rb:670-675`); it is a String only,
   * as the `readpartial` / `IO.copy_stream` arm (`open3.rb:667-668`) is not
   * ported. `binmode` is taken out of the options (`open3.rb:656`) and has no
   * effect, since every stream is read as a String. The remaining options go
   * to `spawn`, so `unsetenv_others: true` gives the child `env` alone. Several
   * command Strings are a program and its argv, spawned with no shell.
   *
   * A command that cannot be spawned raises what the spawn failed with, as
   * `Process.spawn` raises `Errno::ENOENT`, and a host with no way to spawn
   * raises `NotImplementedError`, as {@link Open3.capture2e} does.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Open3.capture3`
   * (`vendor/ruby/v3.3.11/lib/open3.rb:648`).
   */
  static async capture3(
    ...cmd: unknown[]
  ): Promise<[string, string, InstanceType<typeof Process.Status>]> {
    let opts: { stdinData?: string | null; binmode?: unknown; unsetenvOthers?: unknown };
    if (cmd.length > 0 && isPlainHash(cmd[cmd.length - 1])) {
      opts = { ...(cmd.pop() as typeof opts) };
    } else {
      opts = {};
    }

    const stdinData = opts.stdinData || "";
    delete opts.stdinData;
    delete opts.binmode;

    const [command, env, args] = rbExecargNew([...cmd, opts]);
    const adapter = getChildProcess();
    if (adapter.capture3 === undefined) {
      throw new NotImplementedError("spawn() function is unimplemented on this machine");
    }

    const [stdout, stderr, status] = await adapter.capture3(command, env, args, stdinData);
    if (status.error !== undefined) throw status.error;
    return [stdout, stderr, new Process.Status(status)];
  }
}
