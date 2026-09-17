import { Module, extend, extended, include } from "@blazetrails/ruby-compat";
import { isModuleIncluded, prepend } from "@blazetrails/ruby-compat/include";

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

type AnyClass = new (...args: never[]) => unknown;

interface ConcernHost extends Module {
  _dependencies?: ConcernHost[];
  _includedBlock?: (this: any) => void;
  _prependedBlock?: (this: any) => void;
  ClassMethods?: Record<string, unknown>;
}

const blockLocations = new WeakMap<object, string>();

function sourceLocation(block: object): string {
  let location = blockLocations.get(block);
  if (location === undefined) {
    location = new Error().stack?.split("\n")[3]?.trim() ?? "";
    blockLocations.set(block, location);
  }
  return location;
}

export const Concern = {
  [extended](base: ConcernHost): void {
    base._dependencies = [];
  },

  appendFeatures(this: ConcernHost, base: AnyClass | ConcernHost): boolean | void {
    if (Object.prototype.hasOwnProperty.call(base, "_dependencies")) {
      (base as ConcernHost)._dependencies!.push(this);
      return false;
    } else {
      if (isModuleIncluded(base as AnyClass, this)) return false;
      for (const dep of this._dependencies!) include(base as AnyClass, dep);
      Module.prototype.appendFeatures.call(this, base as AnyClass);
      if (Object.prototype.hasOwnProperty.call(this, "ClassMethods")) {
        extend(base as AnyClass, this.ClassMethods!);
      }
      if (Object.prototype.hasOwnProperty.call(this, "_includedBlock")) {
        this._includedBlock!.call(base);
      }
    }
  },

  prependFeatures(this: ConcernHost, base: AnyClass | ConcernHost): boolean | void {
    if (Object.prototype.hasOwnProperty.call(base, "_dependencies")) {
      (base as ConcernHost)._dependencies!.unshift(this);
      return false;
    } else {
      if (isModuleIncluded(base as AnyClass, this)) return false;
      for (const dep of this._dependencies!) prepend(base as AnyClass, dep);
      Module.prototype.prependFeatures.call(this, base as AnyClass);
      if (Object.prototype.hasOwnProperty.call(this, "ClassMethods")) {
        prepend({ prototype: base } as unknown as AnyClass, this.ClassMethods!);
      }
      if (Object.prototype.hasOwnProperty.call(this, "_prependedBlock")) {
        this._prependedBlock!.call(base);
      }
    }
  },

  included(this: ConcernHost, base: unknown = null, block?: (this: any) => void): void {
    if (base == null) {
      if (Object.prototype.hasOwnProperty.call(this, "_includedBlock")) {
        if (sourceLocation(this._includedBlock!) !== sourceLocation(block!)) {
          throw new MultipleIncludedBlocks();
        }
      } else {
        sourceLocation(block!);
        this._includedBlock = block;
      }
    }
  },

  prepended(this: ConcernHost, base: unknown = null, block?: (this: any) => void): void {
    if (base == null) {
      if (Object.prototype.hasOwnProperty.call(this, "_prependedBlock")) {
        if (sourceLocation(this._prependedBlock!) !== sourceLocation(block!)) {
          throw new MultiplePrependBlocks();
        }
      } else {
        sourceLocation(block!);
        this._prependedBlock = block;
      }
    }
  },

  classMethods(
    this: ConcernHost,
    classMethodsModuleDefinition: (mod: Record<string, unknown>) => void,
  ): void {
    const mod = Object.prototype.hasOwnProperty.call(this, "ClassMethods")
      ? this.ClassMethods!
      : (this.ClassMethods = {});
    classMethodsModuleDefinition(mod);
  },
};
