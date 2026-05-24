/**
 * ActionView::Resolver
 *
 * Base class for template resolvers. Resolvers find templates by
 * controller, action, and format. Multiple resolvers chain together
 * (e.g., app views + gem views + database-backed views).
 */

import type { Template } from "../template.js";

export interface TemplateResolver {
  find(name: string, prefix: string, format: string, extensions: string[]): Template | null;

  /** @internal */
  findLayout?(name: string, format: string, extensions: string[]): Template | null;

  /** @internal */
  clearCache?(): void;

  /**
   * Returns all known template paths exposed by this resolver, used by
   * `MissingTemplate#corrections` to suggest close matches.
   * Each entry is a slash-separated string like `"posts/index"` or
   * `"posts/_form"` (partials start with `_` in the basename).
   * Resolvers that cannot enumerate their paths may omit this method.
   * @internal
   */
  allTemplatePaths?(): readonly string[];
}

export abstract class Resolver implements TemplateResolver {
  abstract find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[],
  ): Template | null;

  /** @internal */
  findLayout(name: string, format: string, extensions: string[]): Template | null {
    const template = this.find(name, "layouts", format, extensions);
    return template ? template.asLayout() : null;
  }

  /** @internal Subclasses with internal caches override this. */
  clearCache(): void {}
}
