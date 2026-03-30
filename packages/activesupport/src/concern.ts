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

export namespace Concern {
  export function define(definition: ConcernDefinition): ConcernMixin {
    return { __concern: true, definition };
  }

  export function include(klass: any, mixin: ConcernMixin): void {
    if (!Object.prototype.hasOwnProperty.call(klass, INCLUDED_CONCERNS)) {
      const inherited: Set<ConcernMixin> | undefined = klass[INCLUDED_CONCERNS];
      klass[INCLUDED_CONCERNS] = inherited ? new Set(inherited) : new Set<ConcernMixin>();
    }
    const included: Set<ConcernMixin> = klass[INCLUDED_CONCERNS];

    if (included.has(mixin)) return;
    included.add(mixin);

    const def = mixin.definition;

    if (def.dependencies) {
      for (const dep of def.dependencies) {
        include(klass, dep);
      }
    }

    if (def.instanceMethods) {
      for (const [name, fn] of Object.entries(def.instanceMethods)) {
        if (def.prepend && klass.prototype[name]) {
          const original = klass.prototype[name];
          klass.prototype[`_super_${name}`] = original;
        }
        klass.prototype[name] = fn;
      }
    }

    if (def.classMethods) {
      for (const [name, fn] of Object.entries(def.classMethods)) {
        klass[name] = fn;
      }
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
    const included: Set<ConcernMixin> | undefined = klass[INCLUDED_CONCERNS];
    return included?.has(mixin) ?? false;
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
