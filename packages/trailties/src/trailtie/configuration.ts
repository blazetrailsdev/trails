/**
 * Port of `Rails::Railtie::Configuration` from
 * `railties/lib/rails/railtie/configuration.rb`. Holds the shared config
 * accessed via `Trailtie.config`. Hook blocks (`beforeInitialize` etc.)
 * are stored on class-side arrays so any subclass can register them and
 * `Application` can replay them at boot.
 */
export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

const HOOKS = [
  "beforeConfiguration",
  "beforeInitialize",
  "beforeEagerLoad",
  "afterInitialize",
  "afterRoutesLoaded",
] as const;
type HookName = (typeof HOOKS)[number];

export class Configuration {
  /** @internal Rails `@@`-style shared state. */
  static readonly _eagerLoadNamespaces: unknown[] = [];
  /** @internal */
  static readonly _watchableFiles: string[] = [];
  /** @internal */
  static readonly _watchableDirs: Record<string, string[]> = {};
  /** @internal */
  static readonly _appMiddleware: unknown[] = [];
  /** @internal */
  static readonly _appGenerators: Record<string, unknown> = {};
  /** @internal */
  static readonly _toPrepareBlocks: ConfigurationBlock[] = [];
  /** @internal */
  static readonly _hooks: Record<HookName, ConfigurationBlock[]> = Object.fromEntries(
    HOOKS.map((h) => [h, [] as ConfigurationBlock[]]),
  ) as Record<HookName, ConfigurationBlock[]>;

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
  get appMiddleware(): unknown[] {
    return Configuration._appMiddleware;
  }
  get toPrepareBlocks(): ConfigurationBlock[] {
    return Configuration._toPrepareBlocks;
  }

  appGenerators(block?: (gen: Record<string, unknown>) => void): Record<string, unknown> {
    if (block) block(Configuration._appGenerators);
    return Configuration._appGenerators;
  }

  toPrepare(block?: ConfigurationBlock): void {
    if (block) Configuration._toPrepareBlocks.push(block);
  }

  beforeConfiguration = makeHook("beforeConfiguration");
  beforeInitialize = makeHook("beforeInitialize");
  beforeEagerLoad = makeHook("beforeEagerLoad");
  afterInitialize = makeHook("afterInitialize");
  afterRoutesLoaded = makeHook("afterRoutesLoaded");

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

function makeHook(name: HookName) {
  return (block: ConfigurationBlock): void => {
    Configuration._hooks[name].push(block);
  };
}
