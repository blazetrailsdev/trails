/**
 * Port of `Rails::Railtie::Configuration` from
 * `railties/lib/rails/railtie/configuration.rb`. Holds the shared config
 * accessed via `Trailtie.config`. This PR ships the base state and the
 * `toPrepare` block list; lifecycle hooks (`beforeConfiguration` etc.)
 * land alongside `Configurable` in the follow-up.
 */
export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

export class Configuration {
  /** @internal Rails `@@`-style shared state. */
  static readonly _eagerLoadNamespaces: unknown[] = [];
  /** @internal */
  static readonly _watchableFiles: string[] = [];
  /** @internal */
  static readonly _watchableDirs: Record<string, string[]> = {};
  /** @internal */
  static readonly _toPrepareBlocks: ConfigurationBlock[] = [];

  private readonly _options: Record<string, unknown> = {};

  get eagerLoadNamespaces(): unknown[] {
    return Configuration._eagerLoadNamespaces;
  }
  get watchableFiles(): string[] {
    return Configuration._watchableFiles;
  }
  get watchableDirs(): Record<string, string[]> {
    return Configuration._watchableDirs;
  }
  get toPrepareBlocks(): ConfigurationBlock[] {
    return Configuration._toPrepareBlocks;
  }

  toPrepare(block?: ConfigurationBlock): void {
    if (block) Configuration._toPrepareBlocks.push(block);
  }

  /** Read the free-form option bag (mirrors Ruby `method_missing` getter). */
  get(key: string): unknown {
    return this._options[key];
  }
  /** Write the free-form option bag (mirrors Ruby `method_missing` setter). */
  set(key: string, value: unknown): void {
    this._options[key] = value;
  }
  respondTo(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._options, key);
  }
}
