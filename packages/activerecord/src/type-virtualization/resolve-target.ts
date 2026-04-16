// Shared helper for resolving the target class name of an association
// call. Used by both `synthesize.ts` (to emit `declare` types) and
// `tsc-wrapper/auto-import.ts` (to decide which `import type` lines to
// inject). Keeping the logic in one place ensures the emitted declares
// and the auto-imports can't drift.

import { classify } from "@blazetrails/activesupport";
import type { AssociationCall } from "./walker.js";

export function resolveAssociationTarget(call: AssociationCall): string {
  const explicit = call.options["className"];
  if (explicit) return stripQuotes(explicit);
  return classify(call.name);
}

export function stripQuotes(source: string): string {
  const first = source.charAt(0);
  if ((first === '"' || first === "'" || first === "`") && source.endsWith(first)) {
    return source.slice(1, -1);
  }
  return source;
}
