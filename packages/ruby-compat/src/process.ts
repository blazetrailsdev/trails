import { ArgumentError } from "./argument-error.js";
import type { IO } from "./io.js";
import { IOError } from "./io-error.js";
import { isPlainHash, rbBuiltinClassName } from "./object.js";
import { env as processEnv, getProcessAdapter } from "./process-adapter.js";
import type { WaitStatus } from "./child-process-adapter.js";

interface SystemCallError extends Error {
  code?: string;
}

/**
 * `rb_execarg_new` (`vendor/ruby/v3.3.11/process.c:2767`): `rb_exec_getargs`
 * (`process.c:2511-2538`) takes a trailing Hash as the options and a leading
 * Hash as the env, laid over `ENV` with `nil` unsetting a name. One remaining
 * String is a command line; more are a program and its argv. A command line
 * runs through `/bin/sh -c` (`args` is `null`) only where `rb_exec_fillarg`
 * (`process.c:2575-2690`) finds a shell metacharacter, a leading assignment or
 * a reserved word or special built-in as its first word; any other is split on
 * spaces and tabs and exec'd directly.
 * `unsetenv_others: true` (`process.c:2195-2200`) starts the env empty rather
 * than from `ENV`, as `rb_execarg_parent_start1` does (`process.c:2887-2892`).
 *
 * @inventedArm throw — CONVERGEABLE rb-exec-getargs-ports-rb-check-argv
 * @noRailsEquivalent PERMANENT — Ruby core `rb_execarg_new`
 * (`vendor/ruby/v3.3.11/process.c:2767`).
 */
export function rbExecargNew(
  argv: readonly unknown[],
): [
  prog: string,
  env: Record<string, string | undefined>,
  args: string[] | null,
  opthash: { out?: string | IO; err?: string | IO; unsetenvOthers?: unknown },
] {
  const rest = [...argv];
  let opthash: { out?: string | IO; err?: string | IO; unsetenvOthers?: unknown } = {};
  if (rest.length > 0 && isPlainHash(rest[rest.length - 1])) {
    opthash = rest.pop() as { out?: string | IO; err?: string | IO; unsetenvOthers?: unknown };
    for (const key of Object.keys(opthash)) {
      if (EXEC_OPTIONS.has(key) || key.startsWith("rlimit_") || /^\d+$/.test(key)) continue;
      throw new ArgumentError(`wrong exec option symbol: ${key}`);
    }
  }
  for (const redirect of [opthash.out, opthash.err]) {
    if (typeof redirect === "object" && redirect?.isClosed()) {
      throw new IOError("closed stream");
    }
  }
  const unsetenvOthers = opthash.unsetenvOthers != null && opthash.unsetenvOthers !== false;
  const env: Record<string, string | undefined> = unsetenvOthers ? {} : { ...processEnv };
  if (rest.length > 0 && isPlainHash(rest[0])) {
    for (const [name, value] of Object.entries(rest.shift() as Record<string, string | null>)) {
      if (value == null) delete env[name];
      else env[name] = value;
    }
  }
  for (const arg of rest) {
    if (typeof arg === "string") continue;
    throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(arg)} into String`);
  }
  const [prog, ...args] = rest as string[];
  if (args.length === 0) {
    const argvBuf = rbExecFillarg(prog);
    if (argvBuf !== null) return [argvBuf[0], env, argvBuf.slice(1), opthash];
  }
  return [prog, env, args.length === 0 ? null : args, opthash];
}

/** The option names `rb_execarg_addopt` (`vendor/ruby/v3.3.11/process.c:2145-2290`) accepts, camelCased. */
const EXEC_OPTIONS = new Set(
  "pgroup newPgroup unsetenvOthers chdir umask closeOthers in out err uid gid exception".split(" "),
);

const POSIX_SH_CMDS = new Set([
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
]);

/**
 * `rb_exec_fillarg`'s `use_shell` scan (`vendor/ruby/v3.3.11/process.c:2582-2690`):
 * the command line's words when it can be exec'd with no shell, else `null`.
 */
function rbExecFillarg(prog: string): string[] | null {
  let first: string | null = null;
  let hasMeta = false;
  let start = -1;
  let firstDone = false;
  for (let p = 0; p < prog.length; p++) {
    const c = prog[p];
    if (c === " " || c === "\t") {
      if (start >= 0 && !firstDone) {
        first = prog.slice(start, p);
        firstDone = true;
      }
    } else if (start < 0) {
      start = p;
    }
    if ("*?{}[]<>()~&|\\$;'`\"\n#".includes(c)) hasMeta = true;
    if (!firstDone) {
      if (c === "=") hasMeta = true;
      else if (c === "/") firstDone = true;
    }
    if (hasMeta) break;
  }
  if (!hasMeta && start >= 0) {
    if (!firstDone) first = prog.slice(start);
    if (first !== null && POSIX_SH_CMDS.has(first)) hasMeta = true;
  }
  if (hasMeta) return null;
  const words = prog.split(/[ \t]+/).filter((w) => w !== "");
  return words.length === 0 ? null : words;
}

/**
 * `Process::Status` (`vendor/ruby/v3.3.11/process.c:9169` `rb_cProcessStatus`),
 * built from what the child was waited with (`rb_process_status_new`,
 * `process.c:645`).
 */
class Status {
  readonly pid: number | null;
  readonly #status: number | null;

  constructor(status: WaitStatus) {
    this.pid = status.pid;
    this.#status = status.error === undefined ? status.status : null;
  }

  /** `Process::Status#exitstatus` (`pst_wexitstatus`, `vendor/ruby/v3.3.11/process.c:1084-1091`). */
  exitstatus(): number | null {
    return this.#status;
  }

  isSuccess(): boolean | null {
    if (this.#status === null) return null;
    return this.#status === 0;
  }
}

/**
 * `Process` (`vendor/ruby/v3.3.11/process.c:9129` `rb_mProcess`), the sliver of it
 * trails calls.
 *
 * Every elapsed-time measurement in Rails is
 * `Process.clock_gettime(Process::CLOCK_MONOTONIC)` — 28 call sites, from
 * `ConnectionPool::Queue#internal_poll`
 * (`vendor/rails/v8.0.2/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb:114`)
 * to `Notifications::Instrumenter#monotonic_now`
 * (`vendor/rails/v8.0.2/activesupport/lib/active_support/notifications/instrumenter.rb:204`)
 * — so trails measures elapsed time through a module of the same name rather
 * than through a bare `performance.now()` that reads as neither.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Process`
 * (`vendor/ruby/v3.3.11/process.c:9129`), which Rails calls without defining, so no
 * Rails or gem file declares the module this file's export lives in.
 */
export class Process {
  /**
   * `vendor/ruby/v3.3.11/process.c:9169` — what `Open3.capture2e` answers as
   * its second value, which `Thor::Actions#run` asks `success?`
   * (`vendor/thor/v1.3.2/lib/thor/actions.rb:265-266`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process::Status`
   * (`vendor/ruby/v3.3.11/process.c:9169`).
   */
  static readonly Status = Status;

  /**
   * `Process.last_status` (`proc_s_last_status`,
   * `vendor/ruby/v3.3.11/process.c:638-642`), the `$?` a waited child leaves
   * behind. Ruby keeps it per thread (`rb_last_status_set`, `process.c:681-685`);
   * trails keeps it per async context, falling back to one process-wide seat
   * outside any.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.last_status`
   * (`vendor/ruby/v3.3.11/process.c:639`).
   */
  static get lastStatus(): Status | null {
    return lastStatus;
  }

  /**
   * `vendor/ruby/v3.3.11/process.c:9404` — the clock that cannot go backwards, which is
   * every Rails elapsed-time measurement's clock id.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process::CLOCK_MONOTONIC`
   * (`vendor/ruby/v3.3.11/process.c:9404`).
   */
  static readonly CLOCK_MONOTONIC = ":CLOCK_MONOTONIC";

  /**
   * `vendor/ruby/v3.3.11/process.c:9422` — the calling thread's CPU time, which
   * `Instrumenter#cpu_time` reads (`instrumenter.rb:208`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core
   * `Process::CLOCK_THREAD_CPUTIME_ID` (`vendor/ruby/v3.3.11/process.c:9422`).
   */
  static readonly CLOCK_THREAD_CPUTIME_ID = ":CLOCK_THREAD_CPUTIME_ID";

  /**
   * `vendor/ruby/v3.3.11/process.c:9195`, where `rb_mProcess` registers
   * `proc_get_pid` (`process.c:530`) as `Process.pid` — `getpid(2)`, which
   * `Dir::Tmpname.create` stamps into a candidate name as `$$`
   * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:154`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.pid`
   * (`vendor/ruby/v3.3.11/process.c:530`).
   */
  static get pid(): number {
    return getProcessAdapter().pid();
  }

  /**
   * `proc_get_ppid` (`vendor/ruby/v3.3.11/process.c:559`), `getppid(2)`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.ppid`
   * (`vendor/ruby/v3.3.11/process.c:559`).
   */
  static get ppid(): number {
    return getProcessAdapter().ppid!();
  }

  /**
   * `rb_f_kill` (`vendor/ruby/v3.3.11/signal.c:431`): a signal name, with or
   * without `SIG` and as a String or Symbol, is read as `signm2signo` does,
   * a negative signal signals each pid's process group (`killpg`, which MRI
   * defines as `kill(-(pg), sig)`), and each pid is signalled in turn, raising
   * the failing call's `Errno` (`rb_sys_fail`). Answers the number of pids
   * signalled. Signal `0` only checks that the process may be signalled.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.kill`
   * (`vendor/ruby/v3.3.11/process.c:9155`).
   */
  static kill(signal: number | string, ...pids: number[]): number {
    let sig = typeof signal === "number" ? signal : signal.replace(/^:/, "");
    if (typeof sig === "string") {
      if (sig.startsWith("-")) sig = `-${sig.slice(1).replace(/^(SIG)?/, "SIG")}`;
      else sig = sig.replace(/^(SIG)?/, "SIG");
    }

    if (typeof sig === "number" ? sig < 0 : sig.startsWith("-")) {
      const positive = typeof sig === "number" ? -sig : sig.slice(1);
      for (const pid of pids) getProcessAdapter().kill!(-pid, positive);
    } else {
      for (const pid of pids) getProcessAdapter().kill!(pid, sig);
    }
    return pids.length;
  }

  /**
   * `vendor/ruby/v3.3.11/process.c:8283` `rb_clock_gettime`, which reads the tick for
   * `clockId` and then hands it to `make_clock_result` for `unit`.
   *
   * `CLOCK_THREAD_CPUTIME_ID` reads the monotonic tick — `performance.now()` is
   * a wall clock, not a per-thread CPU clock, and a host without
   * `clock_gettime(2)` has nothing closer. Every other clock id is the
   * `Errno::EINVAL` MRI answers for one the host does not implement.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.clock_gettime`
   * (`vendor/ruby/v3.3.11/process.c:8283`).
   */
  static clockGettime(clockId: string, unit = ":float_second"): number {
    if (clockId !== Process.CLOCK_MONOTONIC && clockId !== Process.CLOCK_THREAD_CPUTIME_ID) {
      const error: SystemCallError = new Error(`Invalid argument - clock_gettime(${clockId})`);
      error.code = "EINVAL";
      throw error;
    }
    return makeClockResult(performance.now(), unit);
  }
}

/**
 * `make_clock_result` (`vendor/ruby/v3.3.11/process.c:8048-8080`) — seven unit arms and
 * a raise, over a tick trails already holds as float milliseconds. The four
 * Integer arms go through `timetick2integer` (`process.c:8000`), whose `/` is
 * Ruby's integer division, and the three Float arms through `timetick2dblnum`.
 */
function makeClockResult(milliseconds: number, unit: string): number {
  if (unit === ":nanosecond") {
    return Math.floor(milliseconds * 1000000);
  } else if (unit === ":microsecond") {
    return Math.floor(milliseconds * 1000);
  } else if (unit === ":millisecond") {
    return Math.floor(milliseconds);
  } else if (unit === ":second") {
    return Math.floor(milliseconds / 1000);
  } else if (unit === ":float_microsecond") {
    return milliseconds * 1000;
  } else if (unit === ":float_millisecond") {
    return milliseconds;
  } else if (unit == null || unit === ":float_second") {
    return milliseconds / 1000;
  } else {
    throw new ArgumentError(`unexpected unit: ${unit.slice(1)}`);
  }
}

let lastStatus: Status | null = null;

/**
 * `rb_last_status_set` (`vendor/ruby/v3.3.11/process.c:681-685`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_last_status_set`
 * (`vendor/ruby/v3.3.11/process.c:681`).
 */
export function rbLastStatusSet(status: Status): void {
  lastStatus = status;
}
