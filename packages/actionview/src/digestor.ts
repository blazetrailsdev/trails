/**
 * Computes a stable digest of a template for cache keys (used by
 * `etag_with_template_digest`). This stub digests the resolved source
 * only; the transitive `render`-call dependency walk lands in Phase 6.
 *
 * @internal stub - real impl in Phase 6
 */

import type { LookupContext } from "./lookup-context.js";

export interface DigestorOptions {
  name: string;
  format?: string | null;
  finder: LookupContext;
  dependencies?: string[] | null;
}

export class Digestor {
  /** @internal stub - real impl in Phase 6 */
  static digest({ name, format, finder }: DigestorOptions): string {
    const slash = name.lastIndexOf("/");
    const prefix = slash >= 0 ? name.slice(0, slash) : "";
    const action = slash >= 0 ? name.slice(slash + 1) : name;
    const fmt = format ?? "html";
    const source = finder.findTemplate(action, prefix, fmt)?.source ?? "";
    return fnv1a64Hex(`${name}|${format ?? ""}|${source}`);
  }
}

function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash ^ BigInt(input.charCodeAt(i))) * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
