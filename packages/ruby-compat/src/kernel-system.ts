import { getChildProcess } from "./child-process-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { rbExecargNew } from "./process.js";

/**
 * `Kernel#system` (`vendor/ruby/v3.3.11/process.c:4841` `rb_f_system`), in its
 * `system([env, ] command_line)` and `system([env, ] cmd, *args [, out:])`
 * forms: `true` when the command exits with `EXIT_SUCCESS`, `false` when it
 * exits with anything else, and `nil` when it could not be executed.
 *
 * A command line always runs through `/bin/sh -c` (`proc_exec_sh`,
 * `process.c:1788`), a waited child that reports a spawn error answers `nil`
 * (`data->error != 0`, `process.c:4867-4875`), and the call is awaited where MRI blocks in
 * `rb_process_status_wait`. A host with no way to spawn raises
 * `rb_notimplement`'s `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#system`
 * (`vendor/ruby/v3.3.11/process.c:4841`).
 */
export async function rbFSystem(
  ...argv: (string | Record<string, string | null> | { out?: string })[]
): Promise<boolean | null> {
  const [prog, env, args, opthash] = rbExecargNew(argv);
  const adapter = getChildProcess();
  if (adapter.system === undefined) {
    throw new NotImplementedError("system() function is unimplemented on this machine");
  }

  const data = await adapter.system(prog, env, args, opthash);

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
