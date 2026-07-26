/**
 * ActionView::Resolver
 *
 * Base class for template resolvers. Resolvers find templates by
 * controller, action, and format. Multiple resolvers chain together
 * (e.g., app views + gem views + database-backed views).
 */

import type { LookupDetails, PathSetResolver } from "../path-set.js";
import { TemplateHandlers } from "../template/handlers.js";
import type { TemplatePath } from "../template-path.js";
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

export abstract class Resolver implements TemplateResolver, PathSetResolver {
  abstract find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[],
  ): Template | null;

  findAll(
    path: TemplatePath | string,
    prefix: string,
    partial: boolean,
    details: LookupDetails,
    _detailsKey?: unknown,
    _locals: ReadonlyArray<string> = [],
  ): Template[] {
    const extensions = TemplateHandlers.extensions();
    if (extensions.length === 0) return [];

    const bare = typeof path === "string" ? path : path.name;
    const name = partial ? `_${bare}` : bare;

    for (const format of requestedFormats(details)) {
      const template = this.find(name, prefix, format, extensions);
      if (template) return [template];
    }
    return [];
  }

  /** @internal */
  findLayout(name: string, format: string, extensions: string[]): Template | null {
    const template = this.find(name, "layouts", format, extensions);
    return template ? template.asLayout() : null;
  }

  /** @internal Subclasses with internal caches override this. */
  clearCache(): void {}
}

function requestedFormats(details: LookupDetails): string[] {
  const formats = (details as { formats?: ReadonlyArray<string | symbol> }).formats ?? [];
  const named = formats.filter((f): f is string => typeof f === "string");
  return named.length > 0 ? named : ["*"];
}
