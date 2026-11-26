import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { Trailtie } from "../trailtie.js";
import type { Configuration } from "./configuration.js";
import { ownState, readOwnState } from "./per-class-state.js";

const SEALED_KEY = "_sealedFromInheritance";

export function sealAgainstInheritance(klass: typeof Trailtie): void {
  ownState(klass, SEALED_KEY, () => true);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function assertNotSealed(subclass: typeof Trailtie): void {
  let parent = Object.getPrototypeOf(subclass) as typeof Trailtie | null;
  while (parent && parent !== Function.prototype && parent !== Object.prototype) {
    if (readOwnState<boolean>(parent, SEALED_KEY) === true) {
      const superclass = Object.getPrototypeOf(parent) as typeof Trailtie;
      throw new RuntimeError(`You cannot inherit from a ${superclass.name} child`);
    }
    parent = Object.getPrototypeOf(parent) as typeof Trailtie | null;
  }
}

export const ClassMethods = {
  get config(): Configuration {
    return (this as unknown as typeof Trailtie).instance().config;
  },

  instance(this: typeof Trailtie): Trailtie {
    return ownState(this, "_instance", () => new (this as unknown as new () => Trailtie)());
  },

  configure(this: typeof Trailtie, block: (this: typeof Trailtie) => void): void {
    block.call(this);
  },
};

export const Configurable = { ClassMethods, sealAgainstInheritance, assertNotSealed };
