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

  /** clean — applies filters then silencer selection per `kind`. */
  clean(backtrace: string[], kind: CleanKind = "silent"): string[] {
    const filtered = backtrace.map((line) => this._applyFilters(line));
    if (kind === "all") return filtered;
    if (kind === "noise") return filtered.filter((line) => this._isSilenced(line));
    return filtered.filter((line) => !this._isSilenced(line));
  }

  /** cleanFrame — clean a single frame; returns undefined when excluded by the selected kind. */
  cleanFrame(frame: string, kind: CleanKind = "silent"): string | undefined {
    const filtered = this._applyFilters(frame);
    if (kind === "all") return filtered;
    const silenced = this._isSilenced(filtered);
    if (kind === "noise") return silenced ? filtered : undefined;
    return silenced ? undefined : filtered;
  }

  protected _applyFilters(line: string): string {
    return this._filters.reduce((l, filter) => filter(l), line);
  }

  protected _isSilenced(line: string): boolean {
    return this._silencers.some((s) => s(line));
  }

  dup(): this {
    const Ctor = this.constructor as new () => this;
    const copy = new Ctor();
    copy._filters = [...this._filters];
    copy._silencers = [...this._silencers];
    return copy;
  }
}
