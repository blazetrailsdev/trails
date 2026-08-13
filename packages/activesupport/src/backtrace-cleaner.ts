type LineFilter = (line: string) => string;
type LineSilencer = (line: string) => boolean;

export type CleanKind = "silent" | "noise" | "all";

/**
 * BacktraceCleaner — filters and silences backtrace lines.
 * Mirrors Rails ActiveSupport::BacktraceCleaner.
 */
export class BacktraceCleaner {
  protected _filters: LineFilter[] = [];
  protected _silencers: LineSilencer[] = [];

  /** addFilter — adds a filter that transforms backtrace lines. */
  addFilter(filter: LineFilter): this {
    this._filters.push(filter);
    return this;
  }

  /** addSilencer — adds a silencer that removes matching lines. */
  addSilencer(silencer: LineSilencer): this {
    this._silencers.push(silencer);
    return this;
  }

  /** removeFilters — removes all filters. */
  removeFilters(): this {
    this._filters = [];
    return this;
  }

  /** removeSilencers — removes all silencers. */
  removeSilencers(): this {
    this._silencers = [];
    return this;
  }

  /** clean — applies filters then silencer selection per `kind` (backtrace_cleaner.rb:45-56). */
  clean(backtrace: string[], kind: CleanKind = "silent"): string[] {
    const filtered = this.filterBacktrace(backtrace);

    switch (kind) {
      case "silent":
        return this.silence(filtered);
      case "noise":
        return this.noise(filtered);
      default:
        return filtered;
    }
  }

  /** cleanFrame — clean a single frame; returns undefined when excluded by the selected kind. */
  cleanFrame(frame: string, kind: CleanKind = "silent"): string | undefined {
    for (const f of this._filters) frame = f(frame);

    switch (kind) {
      case "silent":
        return this._silencers.some((s) => s(frame)) ? undefined : frame;
      case "noise":
        return this._silencers.some((s) => s(frame)) ? frame : undefined;
      default:
        return frame;
    }
  }

  /** backtrace_cleaner.rb:139-145 */
  protected filterBacktrace(backtrace: string[]): string[] {
    for (const f of this._filters) backtrace = backtrace.map((line) => f(line));

    return backtrace;
  }

  /** backtrace_cleaner.rb:147-153 */
  protected silence(backtrace: string[]): string[] {
    for (const s of this._silencers) backtrace = backtrace.filter((line) => !s(line));

    return backtrace;
  }

  /** backtrace_cleaner.rb:155-161 */
  protected noise(backtrace: string[]): string[] {
    return backtrace.filter((line) => this._silencers.some((s) => s(line)));
  }

  dup(): this {
    const Ctor = this.constructor as new () => this;
    const copy = new Ctor();
    copy._filters = [...this._filters];
    copy._silencers = [...this._silencers];
    return copy;
  }
}
