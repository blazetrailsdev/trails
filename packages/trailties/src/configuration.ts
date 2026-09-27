import type { MiddlewareStack } from "@blazetrails/actionpack";
import { deepDup, isPlainObject } from "@blazetrails/activesupport";
import { Hash, hashDelete } from "@blazetrails/ruby-compat";
import { PROTOCOL_PROBES } from "@blazetrails/ruby-compat/method-missing-proxy";

type MiddlewareOperation = (middleware: any) => void;

export class MiddlewareStackProxy {
  private _operations: MiddlewareOperation[];
  private _deleteOperations: MiddlewareOperation[];

  constructor(
    operations: MiddlewareOperation[] = [],
    deleteOperations: MiddlewareOperation[] = [],
  ) {
    this._operations = operations;
    this._deleteOperations = deleteOperations;
  }

  insertBefore(...args: any[]): void {
    this._operations.push((middleware) => middleware.insertBefore(...args));
  }

  insert(...args: any[]): void {
    this.insertBefore(...args);
  }

  insertAfter(...args: any[]): void {
    this._operations.push((middleware) => middleware.insertAfter(...args));
  }

  swap(...args: any[]): void {
    this._operations.push((middleware) => middleware.swap(...args));
  }

  use(...args: any[]): void {
    this._operations.push((middleware) => middleware.use(...args));
  }

  delete(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.delete(...args));
  }

  moveBefore(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.moveBefore(...args));
  }

  move(...args: any[]): void {
    this.moveBefore(...args);
  }

  moveAfter(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.moveAfter(...args));
  }

  unshift(...args: any[]): void {
    this._operations.push((middleware) => middleware.unshift(...args));
  }

  mergeInto(other: MiddlewareStack): MiddlewareStack {
    for (const operation of [...this._operations, ...this._deleteOperations]) {
      operation(other);
    }

    return other;
  }

  plus(other: MiddlewareStackProxy): MiddlewareStackProxy {
    return new MiddlewareStackProxy(
      [...this._operations, ...other.operations],
      [...this._deleteOperations, ...other.deleteOperations],
    );
  }

  protected get operations(): MiddlewareOperation[] {
    return this._operations;
  }

  protected get deleteOperations(): MiddlewareOperation[] {
    return this._deleteOperations;
  }
}

export type GeneratorsConfigHash = Hash<unknown, Record<string, unknown>>;

export type AfterGenerateCallback = (files: string[]) => void;

function namespaceHash(): GeneratorsConfigHash {
  return new Hash<unknown, Record<string, unknown>>((h, k) => {
    const value: Record<string, unknown> = {};
    h.set(k, value);
    return value;
  });
}

export class Generators {
  aliases: GeneratorsConfigHash;
  options: GeneratorsConfigHash;
  templates: string[];
  fallbacks: Record<string, unknown>;
  colorizeLogging: boolean;
  apiOnly: boolean;
  private _hiddenNamespaces: string[];
  private _afterGenerateCallbacks: AfterGenerateCallback[];

  get hiddenNamespaces(): string[] {
    return this._hiddenNamespaces;
  }

  get afterGenerateCallbacks(): AfterGenerateCallback[] {
    return this._afterGenerateCallbacks;
  }

  constructor() {
    this.aliases = namespaceHash();
    this.options = namespaceHash();
    this.fallbacks = {};
    this.templates = [];
    this.colorizeLogging = true;
    this.apiOnly = false;
    this._hiddenNamespaces = [];
    this._afterGenerateCallbacks = [];

    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || name in target) return Reflect.get(target, name, receiver);
        if (PROTOCOL_PROBES.has(name)) return undefined;
        return (...args: unknown[]) => target.methodMissing(name, ...args);
      },
      set(target, name, value, receiver) {
        if (typeof name === "symbol" || name in target) {
          return Reflect.set(target, name, value, receiver);
        }
        target.methodMissing(`${name}=`, value);
        return true;
      },
    });
  }

  initializeCopy(_source: Generators): this {
    this.aliases = deepDup(this.aliases);
    this.options = deepDup(this.options);
    this.fallbacks = deepDup(this.fallbacks);
    this.templates = [...this.templates];
    return this;
  }

  dup(): Generators {
    const copy = Object.assign(new Generators(), this);
    return copy.initializeCopy(this);
  }

  hideNamespace(namespace: string): void {
    this._hiddenNamespaces.push(namespace);
  }

  afterGenerate(block: AfterGenerateCallback): void {
    this._afterGenerateCallbacks.push(block);
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    method = method.endsWith("=") ? method.slice(0, -1) : method;

    if (args.length === 0) {
      if (method === "rails") {
        return this.options.get(method);
      } else {
        return this.options.get("rails")![method];
      }
    }

    let namespace: unknown;
    let configuration: Record<string, unknown> | undefined;
    if (method === "rails" || isPlainObject(args[0])) {
      namespace = method;
      configuration = args.shift() as Record<string, unknown> | undefined;
    } else {
      namespace = args.shift();
      configuration = args.shift() as Record<string, unknown> | undefined;
      this.options.get("rails")![method] = namespace;
    }

    if (configuration != null) {
      const aliases = hashDelete(configuration, "aliases") as Record<string, unknown> | null;
      if (aliases != null) Object.assign(this.aliases.get(namespace)!, aliases);
      Object.assign(this.options.get(namespace)!, configuration);
    }
    return undefined;
  }
}
