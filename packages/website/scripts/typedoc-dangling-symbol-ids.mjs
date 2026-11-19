import { ProjectReflection } from "typedoc";

/**
 * TypeDoc 0.28 keeps a symbol id registered after `excludeInternal` removes
 * its reflection, so a subclass inheriting an `@internal` member (actionpack's
 * `DebugView` from ActionView `Base`'s `buildTagValues`) resolves to
 * `undefined` and ImplementsPlugin crashes on `.kindOf`. Drop the removed
 * reflections from the lookup.
 */
export function load() {
  const original = ProjectReflection.prototype.getReflectionsFromSymbolId;
  ProjectReflection.prototype.getReflectionsFromSymbolId = function (symbolId) {
    return original.call(this, symbolId).filter((reflection) => reflection != null);
  };
}
