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
  /**
   * `variants` mirrors Rails' `variants:` detail: a template named
   * `show.html+phone.tse` wins over `show.html.tse` when `:phone` is active.
   * Optional so resolvers that predate variant support stay compatible.
   */
  find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[],
    variants?: ReadonlyArray<string>,
  ): Template | null;

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

/**
 * Stands in for Rails' `variants: :any`. A resolver seeing this matches a
 * template with any variant suffix, not one named `*`.
 */
export const ANY_VARIANT = "*";

export abstract class Resolver implements TemplateResolver, PathSetResolver {
  abstract find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[],
    variants?: ReadonlyArray<string>,
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

    // `detail_args_for_any` sets `variants: :any` (lookup_context.rb:188-198);
    // trails carries that sentinel on the Requested key rather than in the
    // details hash, so read it from there and widen to the glob.
    const anyVariant =
      (_detailsKey as { variantsIdx?: unknown } | undefined)?.variantsIdx === "any";
    const variants = anyVariant ? [ANY_VARIANT] : requestedVariants(details);
    for (const format of requestedFormats(details)) {
      const template = this.find(name, prefix, format, extensions, variants);
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

/**
 * The requested variants, as `LookupContext#detail_args_for` supplies them.
 * Rails filters filesystem matches against the whole `TemplateDetails::Requested`
 * — variants included — before returning
 * (`actionview/lib/action_view/template/resolver.rb:131`).
 */
function requestedVariants(details: LookupDetails): string[] {
  const variants = (details as { variants?: ReadonlyArray<string | symbol> }).variants ?? [];
  return variants.filter((v): v is string => typeof v === "string");
}

function requestedFormats(details: LookupDetails): string[] {
  const formats = (details as { formats?: ReadonlyArray<string | symbol> }).formats ?? [];
  const named = formats.filter((f): f is string => typeof f === "string");
  return named.length > 0 ? named : ["*"];
}
