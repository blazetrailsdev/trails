import { Gem, RbConfig, rbObjAsString, regexpEscape } from "@blazetrails/ruby-compat";

type LineFilter = (line: string) => string;
type LineSilencer = (line: string) => boolean;

export type CleanKind = "silent" | "noise" | "all";

export class BacktraceCleaner {
  protected _filters: LineFilter[] = [];
  protected _silencers: LineSilencer[] = [];

  constructor() {
    this.addCoreSilencer();
    this.addGemFilter();
    this.addGemSilencer();
    this.addStdlibSilencer();
  }

  addFilter(filter: LineFilter): this {
    this._filters.push(filter);
    return this;
  }

  addSilencer(silencer: LineSilencer): this {
    this._silencers.push(silencer);
    return this;
  }

  removeFilters(): this {
    this._filters = [];
    return this;
  }

  removeSilencers(): this {
    this._silencers = [];
    return this;
  }

  clean<T>(backtrace: T[], kind: CleanKind = "silent"): Array<T | string> {
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

  filter<T>(backtrace: T[], kind: CleanKind = "silent"): Array<T | string> {
    return this.clean(backtrace, kind);
  }

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

  static readonly FORMATTED_GEMS_PATTERN = /^[^/]+ \([\w.]+\) /;

  dup(): this {
    const Ctor = this.constructor as new () => this;
    const copy = new Ctor();
    copy._filters = [...this._filters];
    copy._silencers = [...this._silencers];
    return copy;
  }

  /** @internal */
  private addGemFilter(): void {
    const gemsPaths = [...new Set([...Gem.path, Gem.defaultDir])].map((p) => regexpEscape(p));
    if (gemsPaths.length === 0) return;

    const gemsRegexp = new RegExp(
      `^(${gemsPaths.join("|")})/(bundler/)?gems/([^/]+)-([\\w.]+)/(.*)`,
    );
    const gemsResult = "$3 ($4) $5";
    this.addFilter((line) => line.replace(gemsRegexp, gemsResult));
  }

  /** @internal */
  private addCoreSilencer(): void {
    this.addSilencer((line) => line.includes("<internal:"));
  }

  /** @internal */
  private addGemSilencer(): void {
    this.addSilencer((line) => BacktraceCleaner.FORMATTED_GEMS_PATTERN.test(line));
  }

  /** @internal */
  private addStdlibSilencer(): void {
    this.addSilencer((line) => line.startsWith(RbConfig.CONFIG["rubylibdir"]));
  }

  protected filterBacktrace<T>(backtrace: Array<T | string>): Array<T | string> {
    for (const f of this._filters) backtrace = backtrace.map((line) => f(rbObjAsString(line)));

    return backtrace;
  }

  protected silence<T>(backtrace: Array<T | string>): Array<T | string> {
    for (const s of this._silencers) {
      backtrace = backtrace.filter((line) => !s(rbObjAsString(line)));
    }

    return backtrace;
  }

  protected noise<T>(backtrace: Array<T | string>): Array<T | string> {
    return backtrace.filter((line) => this._silencers.some((s) => s(rbObjAsString(line))));
  }
}
