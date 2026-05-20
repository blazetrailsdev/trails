/**
 * Stub for `Rails::Railtie::Configurable` from
 * `railties/lib/rails/railtie/configurable.rb`. The mixin's main job in
 * Rails is to seal `Application`/`Engine` against further subclassing.
 * Trails won't need that until those classes land (PR 2.2 / PR 2.5);
 * the symbol exists now so dependent PRs have something to import.
 */
import type { Trailtie } from "../trailtie.js";

/** @internal */
const SEALED = new WeakSet<typeof Trailtie>();

/** Seal `klass` so subclassing it raises. */
export function makeConfigurable(klass: typeof Trailtie): void {
  SEALED.add(klass);
}

/** Throw if `klass`'s parent has been sealed. Mirrors `Configurable.inherited`. */
export function assertConfigurableInheritance(klass: typeof Trailtie): void {
  const parent = Object.getPrototypeOf(klass) as typeof Trailtie;
  if (SEALED.has(parent)) throw new Error(`You cannot inherit from a ${parent.name} child`);
}
