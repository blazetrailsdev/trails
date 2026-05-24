/**
 * ActionView::InMemoryResolver-style helper (test-oriented; not a Rails
 * class but lives in the same neighborhood as Rails' test resolvers).
 * Stores templates in memory — great for tests and embedded templates.
 */

import { Template } from "../template.js";
import { Resolver, type TemplateResolver } from "./resolver.js";

export class InMemoryResolver extends Resolver implements TemplateResolver {
  private templates = new Map<string, Template>();

  add(identifier: string, format: string, extension: string, source: string): void {
    const key = this.key(identifier, format);
    const isPartial = identifier.includes("/_") || identifier.startsWith("_");
    const make = (): Template =>
      new Template({
        source,
        extension,
        identifier,
        virtualPath: identifier,
        format,
        isPartial,
      });
    this.templates.set(key, make());
    const fallbackKey = `${identifier}:*`;
    if (!this.templates.has(fallbackKey)) {
      this.templates.set(fallbackKey, make());
    }
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

  find(name: string, prefix: string, format: string, extensions: string[]): Template | null {
    const identifier = prefix ? `${prefix}/${name}` : name;

    const formatKey = this.key(identifier, format);
    const formatMatch = this.templates.get(formatKey);
    if (formatMatch && extensions.includes(formatMatch.extension)) {
      return formatMatch;
    }

    const wildcardKey = `${identifier}:*`;
    const wildcardMatch = this.templates.get(wildcardKey);
    if (wildcardMatch && extensions.includes(wildcardMatch.extension)) {
      return wildcardMatch;
    }

    return null;
  }

  /** @internal */
  allTemplatePaths(): readonly string[] {
    const paths = new Set<string>();
    for (const key of this.templates.keys()) {
      if (!key.endsWith(":*")) {
        paths.add(key.slice(0, key.lastIndexOf(":")));
      }
    }
    return Array.from(paths);
  }

  clear(): void {
    this.templates.clear();
  }

  private key(identifier: string, format: string): string {
    return `${identifier}:${format}`;
  }
}
