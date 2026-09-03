import { NameError } from "./core-ext/name-error.js";
import { Module } from "@blazetrails/ruby-compat/include";

export type MethodSource = (mod: Record<string, unknown>) => void;

export class MethodSet {
  static METHOD_CACHES = new Map<string, Module>();

  private cache: Module;
  private sources: MethodSource[] = [];
  private methods = new Map<string, string>();
  private canonicalMethods = new Map<string, boolean>();

  constructor(namespace: string) {
    let cache = MethodSet.METHOD_CACHES.get(namespace);
    if (!cache) {
      cache = new Module();
      MethodSet.METHOD_CACHES.set(namespace, cache);
    }
    this.cache = cache;
  }

  defineCachedMethod(
    canonicalName: string,
    { as }: { as?: string },
    block: (sources: MethodSource[]) => void,
  ): string {
    as = as ?? canonicalName;

    const already = this.methods.get(as);
    if (already !== undefined) return already;

    if (!this.cache.isMethodDefined(canonicalName) && !this.canonicalMethods.get(canonicalName)) {
      block(this.sources);
    }
    this.canonicalMethods.set(canonicalName, true);
    this.methods.set(as, canonicalName);
    return canonicalName;
  }

  apply(owner: Module, _path: string, _line: number): void {
    if (this.sources.length !== 0) {
      this.cache.moduleEval((mod) => {
        for (const source of this.sources) source(mod);
      });
    }
    this.canonicalMethods.clear();

    for (const [as, canonicalName] of this.methods) {
      const instanceMethod = this.cache.instanceMethod(canonicalName);
      if (instanceMethod === undefined) {
        throw new NameError(`undefined method '${canonicalName}' for module`, canonicalName);
      }
      owner.moduleEval((mod) => Object.defineProperty(mod, as, instanceMethod));
    }
  }
}

export class CodeGenerator {
  static batch<T>(
    owner: Module | CodeGenerator,
    path: string,
    line: number,
    block: (codeGenerator: CodeGenerator) => T,
  ): T {
    if (owner instanceof CodeGenerator) {
      return block(owner);
    } else {
      const instance = new CodeGenerator(owner, path, line);
      const result = block(instance);
      instance.execute();
      return result;
    }
  }

  private owner: Module;
  private path: string;
  private line: number;
  private namespaces = new Map<string, MethodSet>();
  private sources: MethodSource[] = [];

  constructor(owner: Module, path: string, line: number) {
    this.owner = owner;
    this.path = path;
    this.line = line;
  }

  classEval<T>(block: (sources: MethodSource[]) => T): T {
    return block(this.sources);
  }

  defineCachedMethod(
    canonicalName: string,
    { namespace, as }: { namespace: string; as?: string },
    block: (sources: MethodSource[]) => void,
  ): string {
    let methodSet = this.namespaces.get(namespace);
    if (!methodSet) {
      methodSet = new MethodSet(namespace);
      this.namespaces.set(namespace, methodSet);
    }
    return methodSet.defineCachedMethod(canonicalName, { as }, block);
  }

  execute(): void {
    for (const methodSet of this.namespaces.values()) {
      methodSet.apply(this.owner, this.path, this.line - 1);
    }

    if (this.sources.length !== 0) {
      this.owner.moduleEval((mod) => {
        for (const source of this.sources) source(mod);
      });
    }
  }
}
