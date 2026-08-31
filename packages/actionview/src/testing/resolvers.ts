/**
 * ActionView::InMemoryResolver-style helper (test-oriented; not a Rails
 * class but lives in the same neighborhood as Rails' test resolvers).
 * Stores templates in memory — great for tests and embedded templates.
 *
 * It answers the same `findAll` protocol as `FileSystemResolver`, so the
 * details cascade (locale, format, variant, handler) is applied once, in
 * `Resolver#filterAndSortByDetails`.
 */

import type { LookupDetails } from "../path-set.js";
import { Template } from "../template.js";
import { TemplateDetails } from "../template-details.js";
import { TemplatePath } from "../template-path.js";
import { Resolver, type TemplateWithDetails } from "../template/resolver.js";

export class InMemoryResolver extends Resolver {
  private templates = new Map<string, TemplateWithDetails[]>();

  add(identifier: string, format: string, extension: string, source: string): void {
    const path = TemplatePath.parse(identifier);
    const template = new Template({
      source,
      extension,
      identifier,
      virtualPath: identifier,
      format,
      isPartial: path.partial,
    });
    const details = new TemplateDetails(null, extension, format, null);
    const existing = this.templates.get(identifier);
    if (existing) existing.push({ template, details });
    else this.templates.set(identifier, [{ template, details }]);
  }

  addLayout(name: string, format: string, extension: string, source: string): void {
    this.add(`layouts/${name}`, format, extension, source);
  }

  addPartial(identifier: string, format: string, extension: string, source: string): void {
    const parts = identifier.split("/");
    const name = parts.pop()!;
    const prefix = parts.join("/");
    const partialIdentifier = prefix ? `${prefix}/_${name}` : `_${name}`;
    this.add(partialIdentifier, format, extension, source);
  }

  /** @internal */
  override allTemplatePaths(): readonly string[] {
    return Array.from(this.templates.keys());
  }

  clear(): void {
    this.templates.clear();
  }

  /** @internal */
  protected override _findAll(
    name: string,
    prefix: string,
    partial: boolean,
    details: LookupDetails,
    key: unknown,
    _locals: ReadonlyArray<string>,
  ): Template[] {
    const requestedDetails = this.requestedDetailsFor(details, key);
    const virtual = TemplatePath.virtual(name, prefix, partial);
    return this.filterAndSortByDetails(this.templates.get(virtual) ?? [], requestedDetails);
  }
}
