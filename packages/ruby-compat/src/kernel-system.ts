import { getChildProcess } from "./child-process-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { rbExecargNew } from "./process.js";

/**
 * `Kernel#system` (`vendor/ruby/v3.3.11/process.c:4841` `rb_f_system`) for the
 * `system([env, ] command_line)` form `Thor::Actions#run` calls
 * (`vendor/thor/v1.3.2/lib/thor/actions.rb:268`): `true` when the command
 * exits with `EXIT_SUCCESS`, `false` when it exits with anything else, and
 * `nil` when it could not be executed.
 *
 * The command line always runs through `/bin/sh -c` (`proc_exec_sh`,
 * `process.c:1788`), and the call is awaited where MRI blocks in
 * `rb_process_status_wait`. A host with no way to spawn raises
 * `rb_notimplement`'s `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#system`
 * (`vendor/ruby/v3.3.11/process.c:4841`).
 */
export async function rbFSystem(
  ...argv: [command: string] | [env: Record<string, string | null>, command: string]
): Promise<boolean | null> {
  const [command, env] = rbExecargNew(argv);
  const adapter = getChildProcess();
  if (adapter.system === undefined) {
    throw new NotImplementedError("system() function is unimplemented on this machine");
  }

  const data = await adapter.system(command, env);

  if (data.pid != null && data.pid > 0) {
    if (data.status === 0) {
      return true;
    }

    if (data.error !== undefined) {
      return null;
    } else {
      return false;
    }
  }

  return null;
}
