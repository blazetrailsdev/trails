import { onLoad } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { MiddlewareStackProxy } from "../configuration.js";

export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

export class Configuration {
  /** @internal */
  static readonly _eagerLoadNamespaces: unknown[] = [];
  /** @internal */
  static readonly _watchableFiles: string[] = [];
  /** @internal */
  static readonly _watchableDirs: Record<string, string[]> = {};
  /** @internal */
  static readonly _toPrepareBlocks: ConfigurationBlock[] = [];
  /** @internal */
  static readonly _options: Record<string, unknown> = {};

  /** @internal */
  static _appMiddleware?: MiddlewareStackProxy;

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

  beforeEagerLoad(block: ConfigurationBlock): void {
    onLoad("before_eager_load", block);
  }

  beforeInitialize(block: ConfigurationBlock): void {
    onLoad("before_initialize", block);
  }

  afterInitialize(block: ConfigurationBlock): void {
    onLoad("after_initialize", block);
  }

  afterRoutesLoaded(block: ConfigurationBlock): void {
    onLoad("after_routes_loaded", block);
  }

  appMiddleware(): MiddlewareStackProxy {
    return (Configuration._appMiddleware ??= new MiddlewareStackProxy());
  }
  appGenerators(): undefined {
    return undefined;
  }

  get(key: string): unknown {
    return Configuration._options[key];
  }

  set(key: string, value: unknown): void {
    if (this._actualMethod(key)) {
      throw new NoMethodError(`Cannot assign to \`${key}\`, it is a configuration method`);
    }
    Configuration._options[key] = value;
  }

  respondTo(key: string): boolean {
    if (!key.startsWith("_")) {
      for (let proto = Object.getPrototypeOf(this); proto; proto = Object.getPrototypeOf(proto)) {
        if (Object.prototype.hasOwnProperty.call(proto, key)) return true;
      }
    }
    return Object.prototype.hasOwnProperty.call(Configuration._options, key);
  }

  private _actualMethod(key: string): boolean {
    return (
      !Object.prototype.hasOwnProperty.call(Configuration._options, key) && this.respondTo(key)
    );
  }
}
