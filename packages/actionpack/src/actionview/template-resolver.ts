/**
 * ActionView::Resolver
 *
 * Resolvers find templates by controller, action, and format.
 * Multiple resolvers can be chained (e.g., app views + gem views).
 *
 * Built-in resolvers:
 * - FileSystemResolver: finds templates on disk
 * - InMemoryResolver: stores templates in memory (great for testing)
 *
 * Custom resolvers (e.g., database-backed):
 *
 *   class DatabaseResolver implements TemplateResolver {
 *     find(name, prefix, format, extensions) {
 *       const row = db.query("SELECT source, ext FROM templates WHERE ...");
 *       if (!row) return null;
 *       return { source: row.source, extension: row.ext, ... };
 *     }
 *   }
 */

import * as fs from "fs";
import * as path from "path";
import type { Template } from "./template.js";

/**
 * A resolver knows how to find templates.
 */
export interface TemplateResolver {
  /**
   * Find a template.
   *
   * @param name       Template name (e.g., "index", "_form")
   * @param prefix     Controller prefix (e.g., "posts", "admin/posts")
   * @param format     Response format (e.g., "html", "json")
   * @param extensions Handler extensions to search for (e.g., ["ejs", "tsx"])
   * @returns The resolved template, or null if not found
   */
  find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[]
  ): Template | null;

  /**
   * Find a layout template.
   * Default implementation delegates to find() with "layouts" prefix.
   */
  findLayout?(
    name: string,
    format: string,
    extensions: string[]
  ): Template | null;
}

/**
 * Finds templates on the filesystem.
 *
 * Searches for files matching the pattern:
 *   {basePath}/{prefix}/{name}.{format}.{extension}
 *
 * Falls back to:
 *   {basePath}/{prefix}/{name}.{extension}
 *
 * Examples:
 *   app/views/posts/index.html.ejs
 *   app/views/posts/index.ejs
 *   app/views/layouts/application.html.ejs
 */
export class FileSystemResolver implements TemplateResolver {
  constructor(private basePath: string) {}

  find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[]
  ): Template | null {
    const dir = path.join(this.basePath, prefix);

    for (const ext of extensions) {
      // Try format-specific first: index.html.ejs
      const formatPath = path.join(dir, `${name}.${format}.${ext}`);
      if (fs.existsSync(formatPath)) {
        return {
          source: fs.readFileSync(formatPath, "utf-8"),
          extension: ext,
          identifier: `${prefix}/${name}`,
          format,
          fullPath: formatPath,
          isPartial: name.startsWith("_"),
        };
      }

      // Fallback: index.ejs
      const plainPath = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(plainPath)) {
        return {
          source: fs.readFileSync(plainPath, "utf-8"),
          extension: ext,
          identifier: `${prefix}/${name}`,
          format,
          fullPath: plainPath,
          isPartial: name.startsWith("_"),
        };
      }
    }

    return null;
  }

  findLayout(
    name: string,
    format: string,
    extensions: string[]
  ): Template | null {
    const template = this.find(name, "layouts", format, extensions);
    if (template) {
      return { ...template, isLayout: true };
    }
    return null;
  }
}

/**
 * Stores templates in memory. Perfect for testing or embedded templates.
 *
 *   const resolver = new InMemoryResolver();
 *   resolver.add("posts/index", "html", "ejs", "<h1>Posts</h1>");
 *   resolver.addLayout("application", "html", "ejs", "<html><%= yield %></html>");
 */
export class InMemoryResolver implements TemplateResolver {
  private templates = new Map<string, Template>();

  /**
   * Add a template.
   *
   * @param identifier Logical path (e.g., "posts/index")
   * @param format     Response format (e.g., "html")
   * @param extension  Handler extension (e.g., "ejs")
   * @param source     Template source code
   */
  add(identifier: string, format: string, extension: string, source: string): void {
    const key = this.key(identifier, format);
    this.templates.set(key, {
      source,
      extension,
      identifier,
      format,
      isPartial: identifier.includes("/_") || identifier.startsWith("_"),
    });
    // Also store without format for fallback
    const fallbackKey = `${identifier}:*`;
    if (!this.templates.has(fallbackKey)) {
      this.templates.set(fallbackKey, {
        source,
        extension,
        identifier,
        format,
        isPartial: identifier.includes("/_") || identifier.startsWith("_"),
      });
    }
  }

  /**
   * Add a layout template.
   *
   * @param name      Layout name (e.g., "application")
   * @param format    Response format
   * @param extension Handler extension
   * @param source    Template source (use `yield` local for content)
   */
  addLayout(name: string, format: string, extension: string, source: string): void {
    this.add(`layouts/${name}`, format, extension, source);
  }

  /**
   * Add a partial template.
   *
   * @param identifier Logical path (e.g., "posts/form")
   * @param format     Response format
   * @param extension  Handler extension
   * @param source     Template source
   */
  addPartial(identifier: string, format: string, extension: string, source: string): void {
    // Partials are prefixed with underscore in their name
    const parts = identifier.split("/");
    const name = parts.pop()!;
    const prefix = parts.join("/");
    const partialIdentifier = prefix ? `${prefix}/_${name}` : `_${name}`;
    this.add(partialIdentifier, format, extension, source);
  }

  find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[]
  ): Template | null {
    const identifier = prefix ? `${prefix}/${name}` : name;

    // Try format-specific match
    const formatKey = this.key(identifier, format);
    const formatMatch = this.templates.get(formatKey);
    if (formatMatch && extensions.includes(formatMatch.extension)) {
      return formatMatch;
    }

    // Try wildcard
    const wildcardKey = `${identifier}:*`;
    const wildcardMatch = this.templates.get(wildcardKey);
    if (wildcardMatch && extensions.includes(wildcardMatch.extension)) {
      return wildcardMatch;
    }

    return null;
  }

  findLayout(
    name: string,
    format: string,
    extensions: string[]
  ): Template | null {
    const template = this.find(name, "layouts", format, extensions);
    if (template) {
      return { ...template, isLayout: true };
    }
    return null;
  }

  /** Remove all templates. */
  clear(): void {
    this.templates.clear();
  }

  private key(identifier: string, format: string): string {
    return `${identifier}:${format}`;
  }
}
