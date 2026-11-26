import { getChildProcess } from "./child-process-adapter.js";
import { Errno, SystemCallError } from "./errno.js";
import { STDERR, type IO } from "./io.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { getProcessAdapter } from "./process-adapter.js";
import { Process, rbExecargNew, rbLastStatusSet } from "./process.js";
import { RuntimeError } from "./runtime-error.js";

/**
 * `Kernel#system` (`vendor/ruby/v3.3.11/process.c:4841` `rb_f_system`), in its
 * `system([env, ] command_line)` and `system([env, ] cmd, *args [, out:, err:])`
 * forms: `true` when the command exits with `EXIT_SUCCESS`, `false` when it
 * exits with anything else, and `nil` when it could not be executed.
 *
 * A command line always runs through `/bin/sh -c` (`proc_exec_sh`,
 * `process.c:1788`), a waited child that reports a spawn error answers `nil`
 * (`data->error != 0`, `process.c:4867-4875`), and the call is awaited where MRI blocks in
 * `rb_process_status_wait`. A host with no way to spawn raises
 * `rb_notimplement`'s `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498`).
 *
 * `exception: true` raises each of those answers (`process.c:4868-4896`). Node
 * reports no core-dump flag, so the failure message has no `(core dumped)`.
 * A host whose process adapter has no `signo` spawns no child, so it never
 * reaches the signal arm.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#system`
 * (`vendor/ruby/v3.3.11/process.c:4841`).
 */
export async function rbFSystem(
  ...argv: (
    | string
    | [program: string, argv0: string]
    | Record<string, string | null>
    | { out?: string | IO; err?: string | IO; exception?: boolean }
  )[]
): Promise<boolean | null> {
  const [prog, env, args, opthash, argv0] = rbExecargNew(argv, true);
  const adapter = getChildProcess();
  if (adapter.system === undefined) {
    throw new NotImplementedError("system() function is unimplemented on this machine");
  }

  const data = await adapter.system(prog, env, args, opthash, argv0);
  rbLastStatusSet(new Process.Status(data));

  if (data.pid != null && data.pid > 0) {
    if (data.status === 0) {
      return true;
    }

    if (data.error !== undefined) {
      if (opthash.exception) {
        rbSyserrFailStr(data.error, prog);
      } else {
        return null;
      }
    } else if (opthash.exception) {
      const message =
        data.signal != null
          ? `${data.signal} (signal ${getProcessAdapter().signo!(data.signal)})`
          : `exit ${data.status}`;
      throw new RuntimeError(`Command failed with ${message}: ${prog}`);
    } else {
      return false;
    }
  }

  if (opthash.exception) {
    rbSyserrFailStr(data.error, prog);
  } else {
    return null;
  }
}

/**
 * `rb_syserr_fail_str` (`vendor/ruby/v3.3.11/error.c:3573`): the `Errno` class
 * `set_syserr` defined for the spawn error's errno, with `strerror` and the
 * command as its message, or `SystemCallError`'s `Unknown error` for an errno
 * with no class (`syserr_initialize`, `error.c:2786-2800`).
 */
function rbSyserrFailStr(e: unknown, mesg: string): never {
  const { code, errno } = (e ?? {}) as { code?: string; errno?: number };
  const klass = Errno[code as keyof typeof Errno];
  if (klass !== undefined) throw new klass(mesg);
  throw new SystemCallError(`Unknown error ${Math.abs(errno ?? 0)} - ${mesg}`);
}

/**
 * ``Kernel#` `` (`vendor/ruby/v3.3.11/io.c:10585` `rb_f_backquote`): the
 * command's standard output, with `$?` set, awaited where MRI blocks. A command
 * line with no shell metacharacter is exec'd directly (`rb_exec_fillarg`,
 * `vendor/ruby/v3.3.11/process.c:2640-2672`), so a missing command raises `Errno::ENOENT`;
 * any other runs through `/bin/sh -c`. Only stdout is piped; the child inherits
 * fd 2 (`pipe_open`, `vendor/ruby/v3.3.11/io.c:7513`), so its stderr reaches
 * the current `$stderr`.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFBackquote(str: string): Promise<string> {
  const adapter = getChildProcess();
  if (adapter.capture3 === undefined) {
    throw new NotImplementedError("spawn() function is unimplemented on this machine");
  }

  const [prog, env, args] = rbExecargNew([str]);
  const [stdout, stderr, data] = await adapter.capture3(prog, env, args, "");
  if (data.error !== undefined) throw data.error;
  if (stderr !== "") STDERR.write(stderr);
  rbLastStatusSet(new Process.Status(data));

  return stdout as string;
}
