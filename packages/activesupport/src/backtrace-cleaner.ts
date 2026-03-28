type LineFilter = (line: string) => string;
type LineSilencer = (line: string) => boolean;

/**
 * BacktraceCleaner — filters and silences backtrace lines.
 * Mirrors Rails ActiveSupport::BacktraceCleaner.
 */
export class BacktraceCleaner {
  private _filters: LineFilter[] = [];
  private _silencers: LineSilencer[] = [];

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

  /** clean — applies all filters and silencers to a backtrace array. */
  clean(backtrace: string[]): string[] {
    return backtrace
      .map((line) => this._applyFilters(line))
      .filter((line) => !this._isSilenced(line));
  }

  private _applyFilters(line: string): string {
    return this._filters.reduce((l, filter) => filter(l), line);
  }

  private _isSilenced(line: string): boolean {
    return this._silencers.some((s) => s(line));
  }

  dup(): BacktraceCleaner {
    const copy = new BacktraceCleaner();
    copy._filters = [...this._filters];
    copy._silencers = [...this._silencers];
    return copy;
  }
}
