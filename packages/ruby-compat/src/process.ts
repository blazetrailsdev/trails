import { ArgumentError } from "./argument-error.js";
import { isPlainHash } from "./object.js";
import { env as processEnv, getProcessAdapter } from "./process-adapter.js";
import type { WaitStatus } from "./child-process-adapter.js";

interface SystemCallError extends Error {
  code?: string;
}

/**
 * `rb_execarg_new` (`vendor/ruby/v3.3.11/process.c:2767`): `rb_exec_getargs`
 * (`process.c:2511-2538`) takes a trailing Hash as the options and a leading
 * Hash as the environment, laid over `ENV` with a `nil` value unsetting the
 * name. One remaining argument is a command line and `args` is `null`; more
 * are a program and its argv.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_execarg_new`
 * (`vendor/ruby/v3.3.11/process.c:2767`).
 */
export function rbExecargNew(
  argv: readonly unknown[],
): [
  prog: string,
  env: Record<string, string | undefined>,
  args: string[] | null,
  opthash: { out?: string },
] {
  const rest = [...argv];
  let opthash: { out?: string } = {};
  if (rest.length > 0 && isPlainHash(rest[rest.length - 1])) {
    opthash = rest.pop() as { out?: string };
  }
  const env: Record<string, string | undefined> = { ...processEnv };
  if (rest.length > 0 && isPlainHash(rest[0])) {
    for (const [name, value] of Object.entries(rest.shift() as Record<string, string | null>)) {
      if (value == null) delete env[name];
      else env[name] = value;
    }
  }
  const [prog, ...args] = rest as string[];
  return [prog, env, args.length === 0 ? null : args, opthash];
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
