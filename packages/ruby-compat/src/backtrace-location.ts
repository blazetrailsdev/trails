/**
 * Ruby's `Thread::Backtrace::Location` (`vendor/ruby/v3.3.11/vm_backtrace.c:1345`),
 * one frame of `Exception#backtrace_locations`.
 *
 * MRI builds each one from the VM's frame record when the exception is raised.
 * V8 exposes structured `CallSite`s only to `Error.prepareStackTrace`, a
 * process-wide hook that runs at capture time. A reader holding the error
 * later cannot ask for them. So a `Location` is parsed back out of the one
 * `Error#stack` line `Exception#backtrace` answers for the same frame, and
 * `toS` returns that line, as MRI's `location_to_str` formats the frame it
 * came from (`vm_backtrace.c:405`).
 *
 * A frame with no position answers `lineno` 0, as MRI's `location_lineno`
 * does for a C frame (`vm_backtrace.c:187`). `column` has no MRI reader. It is the V8 column, which trails' template
 * source maps read where Ruby's `ErrorHighlight.spot` reads the frame's node.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Location {
  /** @noRailsEquivalent PERMANENT */
  readonly lineno: number;
  /** @noRailsEquivalent PERMANENT */
  readonly column: number;
  /** @noRailsEquivalent PERMANENT */
  readonly label: string | null;
  private readonly _frame: string;

  /** @noRailsEquivalent PERMANENT */
  constructor(frame: string) {
    this._frame = frame.trim();

    const label = /^at\s+(?:async\s+)?([^\s(]+)\s*\(/.exec(this._frame);
    this.label = label ? label[1].slice(label[1].lastIndexOf(".") + 1) : null;

    const position = /:(\d+):(\d+)\)?$/.exec(this._frame);
    this.lineno = position ? Number(position[1]) : 0;
    this.column = position ? Number(position[2]) : 0;
  }

  /**
   * `Thread::Backtrace::Location#to_s` (`vendor/ruby/v3.3.11/vm_backtrace.c:439`).
   *
   * @noRailsEquivalent PERMANENT
   */
  toS(): string {
    return this._frame;
  }
}

/**
 * `Exception#backtrace_locations` (`vendor/ruby/v3.3.11/error.c:1789`): nil for an
 * exception that was never raised, else one `Location` per frame.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excBacktraceLocations(exc: Error): Location[] | null {
  const stack = exc.stack;
  if (stack == null) return null;
  return stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .map((line) => new Location(line));
}
