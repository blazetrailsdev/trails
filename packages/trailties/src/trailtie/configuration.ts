/**
 * Port of `Rails::Railtie::Configuration` from
 * `railties/lib/rails/railtie/configuration.rb`. Holds the shared config
 * accessed via `Trailtie.config`. Lifecycle hooks are stored on a
 * class-side registry — Rails routes them through `ActiveSupport.on_load`
 * with `yield: true`; a direct class-side array matches the observable
 * behavior without coupling to a hook surface that doesn't expose that
 * semantic yet.
 */
export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

const LIFECYCLE_HOOKS = [
  "beforeConfiguration",
  "beforeInitialize",
  "beforeEagerLoad",
  "afterInitialize",
  "afterRoutesLoaded",
] as const;
export type LifecycleHook = (typeof LIFECYCLE_HOOKS)[number];

export class Configuration {
  /** @internal Rails `@@`-style shared state. */
  static readonly _eagerLoadNamespaces: unknown[] = [];
  /** @internal */
  static readonly _watchableFiles: string[] = [];
  /** @internal */
  static readonly _watchableDirs: Record<string, string[]> = {};
  /** @internal */
  static readonly _toPrepareBlocks: ConfigurationBlock[] = [];
  /** @internal Per-hook block registries shared across subclasses. */
  static readonly _lifecycleBlocks: Record<LifecycleHook, ConfigurationBlock[]> = {
    beforeConfiguration: [],
    beforeInitialize: [],
    beforeEagerLoad: [],
    afterInitialize: [],
    afterRoutesLoaded: [],
  };

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

  beforeConfiguration(block: ConfigurationBlock): void {
    Configuration._lifecycleBlocks.beforeConfiguration.push(block);
  }
  beforeInitialize(block: ConfigurationBlock): void {
    Configuration._lifecycleBlocks.beforeInitialize.push(block);
  }
  beforeEagerLoad(block: ConfigurationBlock): void {
    Configuration._lifecycleBlocks.beforeEagerLoad.push(block);
  }
  afterInitialize(block: ConfigurationBlock): void {
    Configuration._lifecycleBlocks.afterInitialize.push(block);
  }
  afterRoutesLoaded(block: ConfigurationBlock): void {
    Configuration._lifecycleBlocks.afterRoutesLoaded.push(block);
  }

  /**
   * @internal Run every block registered for `hook` with `args`.
   *
   * @noRailsEquivalent CONVERGEABLE — Rails has no dispatcher: each hook
   * registers through `ActiveSupport.on_load(..., yield: true)` and
   * `run_load_hooks` fires it (railtie/configuration.rb:54-77). trails stores
   * the blocks class-side while that hook surface is unported, and `runHook`
   * retires with it.
   */
  static runHook(hook: LifecycleHook, ...args: unknown[]): void {
    for (const block of Configuration._lifecycleBlocks[hook]) block(...args);
  }

  /**
   * @internal All lifecycle hook names, in Rails' documented order.
   *
   * @noRailsEquivalent CONVERGEABLE — Rails needs no such list: each hook is
   * its own method on `Railtie::Configuration` (railtie/configuration.rb:54-77)
   * and `run_load_hooks` enumerates nothing. It exists only to drive `runHook`
   * above and retires with it.
   */
  static lifecycleHooks(): readonly LifecycleHook[] {
    return LIFECYCLE_HOOKS;
  }

  /** Stubs for `Configuration#appMiddleware` / `appGenerators` — wired
   * when actionpack ships `MiddlewareStackProxy` and the generators
   * config surface lands. Returning `undefined` keeps the gap loud. */
  appMiddleware(): undefined {
    return undefined;
  }
  appGenerators(): undefined {
    return undefined;
  }

  /** Free-form option bag (mirrors Ruby `method_missing` get/set). */
  get(key: string): unknown {
    return this._options[key];
  }
  set(key: string, value: unknown): void {
    this._options[key] = value;
  }
  respondTo(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._options, key);
  }
}
