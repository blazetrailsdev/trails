import { ArgumentError } from "./argument-error.js";

interface SystemCallError extends Error {
  code?: string;
}

/**
 * `Process` (`vendor/ruby/process.c:9129` `rb_mProcess`), the sliver of it
 * trails calls.
 *
 * Every elapsed-time measurement in Rails is
 * `Process.clock_gettime(Process::CLOCK_MONOTONIC)` — 28 call sites, from
 * `ConnectionPool::Queue#internal_poll`
 * (`vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb:114`)
 * to `Notifications::Instrumenter#monotonic_now`
 * (`vendor/rails/activesupport/lib/active_support/notifications/instrumenter.rb:204`)
 * — so trails measures elapsed time through a module of the same name rather
 * than through a bare `performance.now()` that reads as neither.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Process`
 * (`vendor/ruby/process.c:9129`), which Rails calls without defining, so no
 * Rails or gem file declares the module this file's export lives in.
 */
export class Process {
  /**
   * `vendor/ruby/process.c:9404` — the clock that cannot go backwards, which is
   * every Rails elapsed-time measurement's clock id.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process::CLOCK_MONOTONIC`
   * (`vendor/ruby/process.c:9404`).
   */
  static readonly CLOCK_MONOTONIC = ":CLOCK_MONOTONIC";

  /**
   * `vendor/ruby/process.c:9422` — the calling thread's CPU time, which
   * `Instrumenter#cpu_time` reads (`instrumenter.rb:208`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core
   * `Process::CLOCK_THREAD_CPUTIME_ID` (`vendor/ruby/process.c:9422`).
   */
  static readonly CLOCK_THREAD_CPUTIME_ID = ":CLOCK_THREAD_CPUTIME_ID";

  /**
   * `vendor/ruby/process.c:8283` `rb_clock_gettime`, which reads the tick for
   * `clockId` and then hands it to `make_clock_result` for `unit`.
   *
   * `CLOCK_THREAD_CPUTIME_ID` reads the monotonic tick — `performance.now()` is
   * a wall clock, not a per-thread CPU clock, and a host without
   * `clock_gettime(2)` has nothing closer. Every other clock id is the
   * `Errno::EINVAL` MRI answers for one the host does not implement.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.clock_gettime`
   * (`vendor/ruby/process.c:8283`).
   */
  static clockGettime(clockId: string, unit = ":float_second"): number {
    if (clockId !== Process.CLOCK_MONOTONIC && clockId !== Process.CLOCK_THREAD_CPUTIME_ID) {
      const error: SystemCallError = new Error(
        `Invalid argument - clock_gettime(${clockId})`,
      );
      error.code = "EINVAL";
      throw error;
    }
    return makeClockResult(performance.now(), unit);
  }
}

/**
 * `make_clock_result` (`vendor/ruby/process.c:8048-8080`) — seven unit arms and
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
