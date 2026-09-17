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

type AnyClass = abstract new (...args: any[]) => any;

interface ConcernHost extends Module {
  _dependencies?: ConcernHost[];
  _includedBlock?: (this: any) => void;
  _prependedBlock?: (this: any) => void;
  ClassMethods?: Record<string, unknown>;
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

  included(this: ConcernHost, block: (this: any) => void): void {
    if (Object.prototype.hasOwnProperty.call(this, "_includedBlock")) {
      if (this._includedBlock!.toString() !== block.toString()) {
        throw new MultipleIncludedBlocks();
      }
    } else {
      this._includedBlock = block;
    }
  },

  prepended(this: ConcernHost, block: (this: any) => void): void {
    if (Object.prototype.hasOwnProperty.call(this, "_prependedBlock")) {
      if (this._prependedBlock!.toString() !== block.toString()) {
        throw new MultiplePrependBlocks();
      }
    } else {
      this._prependedBlock = block;
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
