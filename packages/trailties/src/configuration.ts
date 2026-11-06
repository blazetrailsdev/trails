import type { MiddlewareStack } from "@blazetrails/actionpack";
import { deepDup, isPlainObject } from "@blazetrails/activesupport";
import { File, Hash, hashDelete, rbFSystem } from "@blazetrails/ruby-compat";
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

export type AfterGenerateCallback = (files: string[]) => void | Promise<void>;

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

  applyEslintAutocorrectAfterGenerateBang(): void {
    this.afterGenerate(async (files) => {
      const parsableFiles = files.filter(
        (file) => File.isExist(file) && /\.[cm]?[jt]s$/.test(file),
      );
      if (parsableFiles.length !== 0) {
        await rbFSystem("bin/eslint", "--fix", "--quiet", ...parsableFiles, { exception: true });
      }
    });
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    method = method.endsWith("=") ? method.slice(0, -1) : method;

    if (args.length === 0) {
      if (method === "trails") {
        return this.options.get(method);
      } else {
        return this.options.get("trails")![method];
      }
    }

    let namespace: unknown;
    let configuration: Record<string, unknown> | undefined;
    if (method === "trails" || isPlainObject(args[0])) {
      namespace = method;
      configuration = args.shift() as Record<string, unknown> | undefined;
    } else {
      namespace = args.shift();
      configuration = args.shift() as Record<string, unknown> | undefined;
      this.options.get("trails")![method] = namespace;
    }

    if (configuration != null) {
      const aliases = hashDelete(configuration, "aliases") as Record<string, unknown> | null;
      if (aliases != null) Object.assign(this.aliases.get(namespace)!, aliases);
      Object.assign(this.options.get(namespace)!, configuration);
    }
    return undefined;
  }
}

Object.setPrototypeOf(
  Generators.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(Generators.prototype) as object) as object, {
    get(target, name, receiver: Generators) {
      if (typeof name === "symbol" || name in target || receiver === Generators.prototype) {
        return Reflect.get(target, name, receiver);
      }
      if (PROTOCOL_PROBES.has(name)) return undefined;
      return (...args: unknown[]) => receiver.methodMissing(name, ...args);
    },
    set(target, name, value, receiver: Generators) {
      if (typeof name === "symbol" || name in target || receiver === Generators.prototype) {
        return Reflect.set(target, name, value, receiver);
      }
      receiver.methodMissing(`${name}=`, value);
      return true;
    },
  }),
);
