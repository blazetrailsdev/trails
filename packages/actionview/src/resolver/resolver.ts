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
