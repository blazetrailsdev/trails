/**
 * Mirrors: ActiveSupport::CodeGenerator (code_generator.rb)
 *
 * Rails batches the method definitions a `define_attribute_methods` run
 * produces, compiles them once as Ruby source, and copies the compiled methods
 * onto the owner module. TypeScript has no `module_eval`, so a "source" here is
 * the definition itself — a function handed the module's method table, which is
 * what `Module#moduleEval` already yields. Everything else (the per-namespace
 * method cache, the canonical-name dedup, the `batch` re-entrancy that lets a
 * nested batch join the enclosing one, and the deferred `apply`) ports
 * directly, and it is that batching the callers thread as `code_generator`.
 */
import { NameError } from "./core-ext/name-error.js";
import { Module } from "@blazetrails/ruby-compat/include";

/**
 * One entry of Rails' `@sources` array. Rails pushes Ruby source lines that
 * `module_eval` later compiles into the cache module; the TS port pushes the
 * definition that `moduleEval` later applies to it.
 */
export type MethodSource = (mod: Record<string, unknown>) => void;

/** Mirrors: ActiveSupport::CodeGenerator::MethodSet */
export class MethodSet {
  /** Mirrors: METHOD_CACHES = Hash.new { |h, k| h[k] = Module.new } */
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

  /** Mirrors: MethodSet#define_cached_method */
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

  /**
   * Mirrors: MethodSet#apply — `owner.define_method(as,
   * @cache.instance_method(canonical_name))` (code_generator.rb:35) reinstalls
   * the property descriptor rather than a bare function, so a generated reader
   * that is an accessor pair survives the copy. A canonical name the sources
   * loop did not define raises, as Ruby's `Module#instance_method` does.
   */
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
  /** Mirrors: CodeGenerator.batch */
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

  /** Mirrors: CodeGenerator#class_eval */
  classEval<T>(block: (sources: MethodSource[]) => T): T {
    return block(this.sources);
  }

  /** Mirrors: CodeGenerator#define_cached_method */
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

  /** Mirrors: CodeGenerator#execute */
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
