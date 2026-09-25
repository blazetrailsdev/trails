import { onLoad } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { MiddlewareStackProxy } from "../configuration.js";

export type ConfigurationBlock = (this: unknown, ...args: unknown[]) => void;

function hasWriter(target: object, name: string): boolean {
  for (let proto = Object.getPrototypeOf(target); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor) return descriptor.set !== undefined;
  }
  return false;
}

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

  constructor() {
    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || name in target) return Reflect.get(target, name, receiver);
        if (!Object.prototype.hasOwnProperty.call(Configuration._options, name)) return undefined;
        return target.methodMissing(name);
      },
      set(target, name, value, receiver) {
        if (
          typeof name === "symbol" ||
          Object.prototype.hasOwnProperty.call(target, name) ||
          hasWriter(target, name)
        ) {
          return Reflect.set(target, name, value, receiver);
        }
        target.methodMissing(`${name}=`, value);
        return true;
      },
      has(target, name) {
        return (
          Reflect.has(target, name) ||
          Object.prototype.hasOwnProperty.call(Configuration._options, name)
        );
      },
    });
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
    onLoad("before_configuration", { yield: true }, block);
  }

  beforeEagerLoad(block: ConfigurationBlock): void {
    onLoad("before_eager_load", { yield: true }, block);
  }

  beforeInitialize(block: ConfigurationBlock): void {
    onLoad("before_initialize", { yield: true }, block);
  }

  afterInitialize(block: ConfigurationBlock): void {
    onLoad("after_initialize", { yield: true }, block);
  }

  afterRoutesLoaded(block: ConfigurationBlock): void {
    onLoad("after_routes_loaded", { yield: true }, block);
  }

  appMiddleware(): MiddlewareStackProxy {
    return (Configuration._appMiddleware ??= new MiddlewareStackProxy());
  }
  appGenerators(): undefined {
    return undefined;
  }

  get(key: string): unknown {
    return this.methodMissing(key);
  }

  set(key: string, value: unknown): void {
    this.methodMissing(`${key}=`, value);
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

  methodMissing(name: string, ...args: unknown[]): unknown {
    if (name.endsWith("=")) {
      const key = name.slice(0, -1);
      if (this._actualMethod(key)) {
        throw new NoMethodError(`Cannot assign to \`${key}\`, it is a configuration method`);
      }
      return (Configuration._options[key] = args[0]);
    } else if (Object.prototype.hasOwnProperty.call(Configuration._options, name)) {
      return Configuration._options[name];
    } else {
      throw new NoMethodError(
        `undefined method '${name}' for an instance of ${this.constructor.name}`,
      );
    }
  }
}
