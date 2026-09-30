import { ArgumentError } from "./argument-error.js";
import { getChildProcessAsync } from "./child-process-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { env as processEnv } from "./process-adapter.js";

const POSIX_SH_CMDS = [
  "!",
  ".",
  ":",
  "break",
  "case",
  "continue",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "eval",
  "exec",
  "exit",
  "export",
  "fi",
  "for",
  "if",
  "in",
  "readonly",
  "return",
  "set",
  "shift",
  "then",
  "times",
  "trap",
  "unset",
  "until",
  "while",
];

/**
 * A resolved `struct rb_execarg` (`vendor/ruby/v3.3.11/internal/process.h:30`): the
 * program and argv to exec, and the child's whole environment.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `struct rb_execarg`.
 */
export interface ExecArg {
  commandName: string;
  argv: string[];
  env: Record<string, string | undefined>;
}

/**
 * `rb_execarg_new` (`vendor/ruby/v3.3.11/process.c:2767`) for the
 * `([env,] command_line)` form `Kernel#system` and `Open3.capture2e` take. A
 * leading Hash is the env (`rb_exec_getargs`, `process.c:2511`), checked by
 * `rb_check_exec_env` (`process.c:2429-2466`) and applied over `ENV` the way
 * `rb_execarg_parent_start1` builds the child's `envp` (`process.c:2893-2916`):
 * a `nil` value unsets the name.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_execarg_new`.
 */
export function rbExecargNew(...cmd: [Record<string, string | null>, string] | [string]): ExecArg {
  const [envModification, prog] = cmd.length === 2 ? cmd : [null, cmd[0]];
  const env: Record<string, string | undefined> = { ...processEnv };
  if (envModification !== null) {
    for (const [key, val] of Object.entries(envModification)) {
      if (key.includes("=")) {
        throw new ArgumentError(`environment name contains a equal : ${key}`);
      }
      if (val == null) delete env[key];
      else env[key] = val;
    }
  }
  return rbExecFillarg(prog, env);
}

/**
 * `rb_exec_fillarg` (`vendor/ruby/v3.3.11/process.c:2559-2698`), its POSIX arm for a
 * single command-line String. The line goes to `/bin/sh -c` when it holds a
 * shell meta character, starts with an assignment, or its first word is a
 * POSIX special built-in or reserved word (`process.c:2581-2666`); otherwise
 * it is split on spaces and tabs and exec'd directly (`process.c:2671-2689`),
 * so a missing program is an exec failure rather than the shell's exit 127.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_exec_fillarg`.
 */
function rbExecFillarg(prog: string, env: Record<string, string | undefined>): ExecArg {
  let firstStart = -1;
  let firstLen = 0;
  let hasMeta = false;
  let p = 0;
  for (; p < prog.length; p++) {
    const c = prog[p];
    if (c === " " || c === "\t") {
      if (firstStart !== -1 && !firstLen) firstLen = p - firstStart;
    } else {
      if (firstStart === -1) firstStart = p;
    }
    if (!hasMeta && "*?{}[]<>()~&|\\$;'`\"\n#".includes(c)) hasMeta = true;
    if (!firstLen) {
      if (c === "=") {
        hasMeta = true;
      } else if (c === "/") {
        firstLen = 0x100;
      }
    }
    if (hasMeta) break;
  }
  if (!hasMeta && firstStart !== -1) {
    if (!firstLen) firstLen = p - firstStart;
    if (POSIX_SH_CMDS.includes(prog.slice(firstStart, firstStart + firstLen))) hasMeta = true;
  }
  if (hasMeta) return { commandName: "/bin/sh", argv: ["-c", prog], env };
  const [commandName = "", ...argv] = prog.split(/[ \t]+/).filter((word) => word !== "");
  return { commandName, argv, env };
}

/**
 * `Kernel#system` (`vendor/ruby/v3.3.11/process.c:4841` `rb_f_system`) for
 * `system([env,] command_line)`: `true` when the child exits with
 * `EXIT_SUCCESS`, `false` for any other exit or a signal, and `nil` when it
 * could not be executed. Async, because the child can run for as long as a
 * `bundle install` and a synchronous wait would stall the event loop. `$?` is
 * not set; nothing in trails reads it. A host adapter without `system` raises
 * `rb_notimplement`'s `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498-3502`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#system`, which Thor calls
 * without defining.
 */
export async function rbKernelSystem(
  ...cmd: [Record<string, string | null>, string] | [string]
): Promise<boolean | null> {
  const execarg = rbExecargNew(...cmd);
  const adapter = await getChildProcessAsync();
  if (adapter.system === undefined) {
    throw new NotImplementedError("system() function is unimplemented on this machine");
  }
  const status = await adapter.system(execarg.commandName, execarg.argv, { env: execarg.env });
  if (status.error !== undefined) return null;
  if (status.status === 0) return true;
  return false;
}
