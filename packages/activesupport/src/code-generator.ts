import { NameError } from "./core-ext/name-error.js";
import { Module } from "@blazetrails/ruby-compat/include";

export type MethodSource = (mod: Record<string, unknown>) => void;

type Owner = Module | { prototype: object };

export class MethodSet {
  static toString(): string {
    return "ActiveSupport::CodeGenerator::MethodSet";
  }

  static METHOD_CACHES = new Map<string, Record<string, unknown>>();

  private cache: Record<string, unknown>;
  private sources: MethodSource[] = [];
  private methods = new Map<string, string>();
  private canonicalMethods = new Map<string, boolean>();

  constructor(namespace: string) {
    let cache = MethodSet.METHOD_CACHES.get(namespace);
    if (!cache) {
      cache = {};
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

    if (!Object.hasOwn(this.cache, canonicalName) && !this.canonicalMethods.get(canonicalName)) {
      block(this.sources);
    }
    this.canonicalMethods.set(canonicalName, true);
    this.methods.set(as, canonicalName);
    return canonicalName;
  }

  apply(owner: Owner, _path: string, _line: number): void {
    if (this.sources.length !== 0) {
      for (const source of this.sources) source(this.cache);
    }
    this.canonicalMethods.clear();

    for (const [as, canonicalName] of this.methods) {
      const instanceMethod = Object.getOwnPropertyDescriptor(this.cache, canonicalName);
      if (instanceMethod === undefined) {
        throw new NameError(`undefined method '${canonicalName}' for module`, canonicalName);
      }
      if (owner instanceof Module) {
        owner.moduleEval((mod) => Object.defineProperty(mod, as, instanceMethod));
      } else Object.defineProperty(owner.prototype, as, instanceMethod);
    }
  }
}

export class CodeGenerator {
  static toString(): string {
    return "ActiveSupport::CodeGenerator";
  }

  static batch<T>(
    owner: Owner | CodeGenerator,
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

  private owner: Owner;
  private path: string;
  private line: number;
  private namespaces = new Map<string, MethodSet>();
  private sources: MethodSource[] = [];

  constructor(owner: Owner, path: string, line: number) {
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
      if (this.owner instanceof Module) {
        this.owner.moduleEval((mod) => {
          for (const source of this.sources) source(mod);
        });
      } else {
        for (const source of this.sources) source(this.owner.prototype as Record<string, unknown>);
      }
    }
  }
}
