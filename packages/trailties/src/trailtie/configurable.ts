import { RuntimeError } from "@blazetrails/ruby-compat";
import { Trailtie } from "../trailtie.js";
import { ownState, readOwnState } from "./per-class-state.js";

const SEALED_KEY = "_sealedFromInheritance";

export function sealAgainstInheritance(klass: typeof Trailtie): void {
  ownState(klass, SEALED_KEY, () => true);
}

/**
 * @internal Throws if any ancestor of `subclass` is sealed. Walks every
 * prototype-chain step (no early termination on anonymous classes — an
 * anonymous intermediate must not let a sealed grandparent slip past).
 *
 * @noRailsEquivalent CONVERGEABLE — Rails raises inline in
 * `Railtie::Configurable::ClassMethods#inherited`
 * (railtie/configurable.rb:13-15). JS has no `inherited` hook (CLAUDE.md,
 * "Module mixins"), so the check is a function the registration path calls; it
 * folds back in whenever the `inherited` deferral is settled.
 */
export function assertNotSealed(subclass: typeof Trailtie): void {
  let parent = Object.getPrototypeOf(subclass) as typeof Trailtie | null;
  while (parent && parent !== Function.prototype && parent !== Object.prototype) {
    if (readOwnState<boolean>(parent, SEALED_KEY) === true) {
      throw new RuntimeError(`You cannot inherit from a ${parent.name} child`);
    }
    parent = Object.getPrototypeOf(parent) as typeof Trailtie | null;
  }
}
