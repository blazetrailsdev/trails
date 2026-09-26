import { helper, type HelpersClassMethods } from "../../abstract-controller/helpers.js";
import { helpersPath, modulesForHelpers } from "../metal/helpers.js";

export interface HelpersPathControllerClass extends HelpersClassMethods {
  helpersPath?: string[];
  includeAllHelpers?: boolean;
}

const fired = new WeakSet<object>();

/** @noRailsEquivalent CONVERGEABLE port-action-controller-helpers-and-the-inherited-hook */
export function fireInherited(
  klass: HelpersPathControllerClass,
  base: HelpersPathControllerClass,
): void {
  const chain: HelpersPathControllerClass[] = [];
  for (
    let k: HelpersPathControllerClass | null = klass;
    k && k !== base;
    k = Object.getPrototypeOf(k) as HelpersPathControllerClass | null
  ) {
    chain.unshift(k);
  }

  for (const k of chain) {
    if (fired.has(k)) continue;
    fired.add(k);
    inherited(k, base);
    (k as unknown as { _writeLayoutMethod(): void })._writeLayoutMethod();
  }
}

export function inherited(
  klass: HelpersPathControllerClass,
  base: HelpersPathControllerClass,
): void {
  if (!("helpersPath" in klass)) return;

  klass.helpersPath = helpersPath();

  if (Object.getPrototypeOf(klass) === base && base.includeAllHelpers) {
    helper(klass, ...modulesForHelpers(["all"]));
  }
}
