import { extend as extendModule } from "./include.js";

export class MultipleIncludedBlocks extends Error {
  constructor() {
    super("Cannot define multiple 'included' blocks for a Concern");
    this.name = "MultipleIncludedBlocks";
  }
}

export class MultiplePrependBlocks extends Error {
  constructor() {
    super("Cannot define multiple 'prepended' blocks for a Concern");
    this.name = "MultiplePrependBlocks";
  }
}

export interface ConcernDefinition {
  dependencies?: ConcernMixin[];
  included?: (base: any) => void;
  prepended?: (base: any) => void;
  classMethods?: Record<string, Function>;
  instanceMethods?: Record<string, Function>;
  prepend?: boolean;
}

export interface ConcernMixin {
  __concern: true;
  definition: ConcernDefinition;
}

const INCLUDED_CONCERNS = Symbol("includedConcerns");
const INCLUDED_BLOCK = Symbol("includedBlock");
const PREPENDED_BLOCK = Symbol("prependedBlock");

/**
 * Prepend instance methods onto klass.prototype, saving originals as
 * _super_<name> so the prepending method can call through.
 * This is the one path Concern handles directly — Ruby's prepend
 * semantics have no equivalent in the plain include() helper.
 */
function prependMethods(klass: any, methods: Record<string, Function>): void {
  const descriptor = {
    value: undefined as any,
    writable: true,
    configurable: true,
    enumerable: false,
  };
  for (const [name, fn] of Object.entries(methods)) {
    const existing = klass.prototype[name];
    if (existing) {
      descriptor.value = existing;
      Object.defineProperty(klass.prototype, `_super_${name}`, descriptor);
    }
    descriptor.value = fn;
    Object.defineProperty(klass.prototype, name, descriptor);
  }
}

export namespace Concern {
  export function define(definition: ConcernDefinition): ConcernMixin {
    return { __concern: true, definition };
  }

  export function include(klass: any, mixin: ConcernMixin): void {
    if (!Object.prototype.hasOwnProperty.call(klass, INCLUDED_CONCERNS)) {
      const inherited: Set<ConcernMixin> | undefined = klass[INCLUDED_CONCERNS];
      klass[INCLUDED_CONCERNS] = inherited ? new Set(inherited) : new Set<ConcernMixin>();
    }
    const includedSet: Set<ConcernMixin> = klass[INCLUDED_CONCERNS];

    if (includedSet.has(mixin)) return;
    includedSet.add(mixin);

    const def = mixin.definition;

    if (def.dependencies) {
      for (const dep of def.dependencies) {
        include(klass, dep);
      }
    }

    if (def.instanceMethods) {
      if (def.prepend) {
        prependMethods(klass, def.instanceMethods);
      } else {
        // Concerns overwrite existing methods (TS has no MRO, so this is the
        // only way to simulate Ruby's ancestor chain insertion). Use
        // extendModule on the prototype — extend() always overwrites and
        // fires the extended hook, matching the "methods added" semantic.
        extendModule(klass.prototype, def.instanceMethods);
      }
    }

    if (def.classMethods) {
      extendModule(klass, def.classMethods);
    }

    const includedBlock = def.included ?? (mixin as any)[INCLUDED_BLOCK];
    if (includedBlock) {
      includedBlock(klass);
    }

    if (def.prepend) {
      const prependedBlock = def.prepended ?? (mixin as any)[PREPENDED_BLOCK];
      if (prependedBlock) {
        prependedBlock(klass);
      }
    }
  }

  export function hasConcern(klass: any, mixin: ConcernMixin): boolean {
    const includedSet: Set<ConcernMixin> | undefined = klass[INCLUDED_CONCERNS];
    return includedSet?.has(mixin) ?? false;
  }

  export function setIncludedBlock(target: any, block: (base: any) => void): void {
    if (Object.prototype.hasOwnProperty.call(target, INCLUDED_BLOCK)) {
      throw new MultipleIncludedBlocks();
    }
    target[INCLUDED_BLOCK] = block;
  }

  export function setPrependedBlock(target: any, block: (base: any) => void): void {
    if (Object.prototype.hasOwnProperty.call(target, PREPENDED_BLOCK)) {
      throw new MultiplePrependBlocks();
    }
    target[PREPENDED_BLOCK] = block;
  }
}

export function concern(definition: ConcernDefinition): ConcernMixin {
  return Concern.define(definition);
}

export function includeConcern(klass: any, mixin: ConcernMixin): void {
  Concern.include(klass, mixin);
}

export function hasConcern(klass: any, mixin: ConcernMixin): boolean {
  return Concern.hasConcern(klass, mixin);
}
