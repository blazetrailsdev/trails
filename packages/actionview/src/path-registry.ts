/**
 * Process-wide registry of view-path resolvers. Only `allResolvers()` is
 * needed to unblock AP's `exception_wrapper.rb:257` annotated-source
 * path. Full impl (weak-ref cache, hooks, per-class view paths) lands in
 * Phase 1c.
 *
 * @internal stub - real impl in Phase 1c
 */

import type { TemplateResolver } from "./template-resolver.js";

export class PathRegistry {
  /** @internal stub - real impl in Phase 1c */
  static allResolvers(): TemplateResolver[] {
    return [];
  }
}
