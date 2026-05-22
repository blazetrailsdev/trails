/**
 * Port of `Rails::Railtie::Configurable` from
 * `railties/lib/rails/railtie/configurable.rb`. The Rails module's other
 * roles (delegating `config`, caching `instance`, `method_missing`) are
 * already provided by `Trailtie` itself; what remains is the
 * `inherited`-raises sealed-class guard, used by `Application`.
 */
import { Trailtie } from "../trailtie.js";
import { ownState, readOwnState } from "./per-class-state.js";

const SEALED_KEY = "_sealedFromInheritance";

/** Seal `klass` against being a superclass of any future registration. */
export function sealAgainstInheritance(klass: typeof Trailtie): void {
  ownState(klass, SEALED_KEY, () => true);
}

/** @internal Throws if any ancestor of `subclass` is sealed. Walks every
 * prototype-chain step (no early termination on anonymous classes — an
 * anonymous intermediate must not let a sealed grandparent slip past). */
export function assertNotSealed(subclass: typeof Trailtie): void {
  let parent = Object.getPrototypeOf(subclass) as typeof Trailtie | null;
  while (parent && parent !== Function.prototype && parent !== Object.prototype) {
    if (readOwnState<boolean>(parent, SEALED_KEY) === true) {
      throw new Error(`You cannot inherit from a ${parent.name} child`);
    }
    parent = Object.getPrototypeOf(parent) as typeof Trailtie | null;
  }
}
