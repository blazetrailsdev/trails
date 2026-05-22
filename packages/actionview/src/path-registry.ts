/**
 * Process-wide registry of view-path resolvers. Only `allResolvers()` is
 * needed to unblock AP's `exception_wrapper.rb:257` annotated-source
 * path. Full impl (weak-ref-backed registry populated by Resolver's
 * constructor, hooks, per-class view paths) is a follow-up to the Phase
 * 1c restructure — tracked in `docs/actionview-100-percent.md`.
 *
 * @internal stub - real impl is a Phase 1c follow-up PR
 */

import type { TemplateResolver } from "./resolver/resolver.js";

export class PathRegistry {
  /** @internal stub - real impl in Phase 1c */
  static allResolvers(): TemplateResolver[] {
    return [];
  }
}
