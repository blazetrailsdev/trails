import { Application, ProjectReflection } from "typedoc";

/**
 * TypeDoc 0.28 keeps a symbol id registered after `excludeInternal` removes
 * its reflection, so a subclass inheriting an `@internal` member (actionpack's
 * `DebugView` from ActionView `Base`'s `buildTagValues`) resolves to
 * `undefined` and ImplementsPlugin crashes on `.kindOf`. Drop the removed
 * reflections from the lookup. Written against TypeDoc 0.28.18 (pinned in
 * package.json); any other version fails loudly so the patch is re-checked.
 */
export function load() {
  if (Application.VERSION !== "0.28.18") {
    throw new Error(
      `typedoc-dangling-symbol-ids was written for TypeDoc 0.28.18, found ${Application.VERSION}`,
    );
  }
  const original = ProjectReflection.prototype.getReflectionsFromSymbolId;
  ProjectReflection.prototype.getReflectionsFromSymbolId = function (symbolId) {
    return original.call(this, symbolId).filter((reflection) => reflection != null);
  };
}
