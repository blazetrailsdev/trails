/**
 * Port of `Rails::Railtie::Configuration` from
 * `railties/lib/rails/railtie/configuration.rb`. Holds the shared config
 * accessed via `Trailtie.config`.
 */
import { onLoad } from "../lazy-load-hooks.js";

export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

export class Configuration {
  /** @internal Rails `@@eager_load_namespaces` (`railtie/configuration.rb:17-20`). */
  static readonly _eagerLoadNamespaces: unknown[] = [];
  /** @internal */
  static readonly _watchableFiles: string[] = [];
  /** @internal */
  static readonly _watchableDirs: Record<string, string[]> = {};
  /** @internal */
  static readonly _toPrepareBlocks: ConfigurationBlock[] = [];
  /** @internal Rails `@@options` — one bag shared by every `Configuration`
   * instance (`railtie/configuration.rb:8-9`, `:96-108`), which is how a
   * framework railtie's `config.active_record = ...` is readable off the
   * application's own config. */
  private static readonly _options: Record<string, unknown> = {};

  /** Mirrors `Railtie::Configuration.eager_load_namespaces`
   * (`railties/lib/rails/railtie/configuration.rb:12-15`). */
  static eagerLoadNamespaces(): unknown[] {
    return Configuration._eagerLoadNamespaces;
  }

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
    onLoad("before_configuration", block);
  }
  beforeInitialize(block: ConfigurationBlock): void {
    onLoad("before_initialize", block);
  }
  beforeEagerLoad(block: ConfigurationBlock): void {
    onLoad("before_eager_load", block);
  }
  afterInitialize(block: ConfigurationBlock): void {
    onLoad("after_initialize", block);
  }
  afterRoutesLoaded(block: ConfigurationBlock): void {
    onLoad("after_routes_loaded", block);
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
    return Configuration._options[key];
  }
  set(key: string, value: unknown): void {
    Configuration._options[key] = value;
  }
  respondTo(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(Configuration._options, key);
  }
}
