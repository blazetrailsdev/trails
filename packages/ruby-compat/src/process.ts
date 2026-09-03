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
   * `vendor/ruby/process.c:8283` `rb_clock_gettime`. `unit` defaults to
   * `:float_second` (`process.c:8077`) and `:float_millisecond` is the other
   * one Rails asks for; both are Floats, so no rounding happens on either arm.
   *
   * `CLOCK_THREAD_CPUTIME_ID` has no JS reading — `performance.now()` is a wall
   * clock, not a per-thread CPU clock — so it answers the monotonic reading,
   * which is the closest a host without `clock_gettime(2)` can come.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Process.clock_gettime`
   * (`vendor/ruby/process.c:8283`).
   */
  static clockGettime(clockId: string, unit = ":float_second"): number {
    const milliseconds = performance.now();
    return unit === ":float_millisecond" ? milliseconds : milliseconds / 1000;
  }
}
