export interface SilencerOptions {
  only?: RegExp | RegExp[] | null;
  ignore?: RegExp | RegExp[] | null;
  ignoreBang?: RegExp | RegExp[] | null;
}

export class Silencer {
  static readonly DEFAULT_IGNORED_FILES =
    /^(?:\.git|\.svn|\.hg|\.rbx|\.bundle|bundle|vendor\/bundle|log|tmp|vendor\/ruby|#.+#|\.#.+)(\/|$)/;

  static readonly DEFAULT_IGNORED_EXTENSIONS =
    /(?:\..*\d+\.new|\.kate-swp|\.goutputstream-.{6}|___jb_bak___|___jb_old___|\.sw[px]|\.swpx|^4913|(?:^sed(?:[a-zA-Z0-9]{0}[A-Z]{1}[a-zA-Z0-9]{5}|[a-zA-Z0-9]{1}[A-Z]{1}[a-zA-Z0-9]{4}|[a-zA-Z0-9]{2}[A-Z]{1}[a-zA-Z0-9]{3}|[a-zA-Z0-9]{3}[A-Z]{1}[a-zA-Z0-9]{2}|[a-zA-Z0-9]{4}[A-Z]{1}[a-zA-Z0-9]{1}|[a-zA-Z0-9]{5}[A-Z]{1}[a-zA-Z0-9]{0}))|\.mutagen-temporary.*|\.DS_Store|\.tmp|~)$/;

  onlyPatterns!: RegExp[] | null;
  ignorePatterns!: RegExp[];

  constructor(options: SilencerOptions = {}) {
    this.configure(options);
  }

  configure(options: SilencerOptions): void {
    this.onlyPatterns = options.only ? [options.only].flat() : null;
    this.ignorePatterns = this._initIgnores(options.ignore, options.ignoreBang);
  }

  isSilenced(relativePath: { toString(): string }, type: string): boolean {
    const path = relativePath.toString();

    return (
      this._isIgnore(path) || (this.onlyPatterns != null && type === "file" && !this._isOnly(path))
    );
  }

  private _isIgnore(path: string): boolean {
    return this.ignorePatterns.some((pattern) => pattern.test(path));
  }

  private _isOnly(path: string): boolean {
    return this.onlyPatterns!.some((pattern) => pattern.test(path));
  }

  private _initIgnores(
    ignores: RegExp | RegExp[] | null | undefined,
    overrides: RegExp | RegExp[] | null | undefined,
  ): RegExp[] {
    const patterns: (RegExp | RegExp[] | null | undefined)[] = [];
    if (!overrides) {
      patterns.push(Silencer.DEFAULT_IGNORED_FILES);
      patterns.push(Silencer.DEFAULT_IGNORED_EXTENSIONS);
    }

    patterns.push(ignores);
    patterns.push(overrides);

    return patterns.filter((x) => x != null).flat();
  }
}
