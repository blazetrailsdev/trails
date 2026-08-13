/**
 * ActionView::FileSystemResolver
 *
 * Finds templates on the filesystem under a base path.
 * Searches `{basePath}/{prefix}/{name}.{format}.{extension}`,
 * falling back to `{basePath}/{prefix}/{name}.{extension}`.
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import { Template } from "../template.js";
import { ANY_VARIANT, Resolver, type TemplateResolver } from "./resolver.js";

export class FileSystemResolver extends Resolver implements TemplateResolver {
  constructor(protected basePath: string) {
    super();
  }

  /** @internal */
  path(): string {
    return this.basePath;
  }

  find(
    name: string,
    prefix: string,
    format: string,
    extensions: string[],
    variants: ReadonlyArray<string> = [],
  ): Template | null {
    const dir = getPath().join(this.basePath, prefix);

    for (const ext of extensions) {
      // Rails orders a variant match ahead of the plain format match:
      // `show.html+phone.erb` beats `show.html.erb` when `:phone` is active.
      for (const variant of variants) {
        if (variant === ANY_VARIANT) {
          const match = this.findAnyVariant(dir, name, format, ext);
          if (match) return this.buildTemplate(match, name, prefix, format, ext);
          continue;
        }
        const variantPath = getPath().join(dir, `${name}.${format}+${variant}.${ext}`);
        if (getFs().existsSync(variantPath)) {
          return this.buildTemplate(variantPath, name, prefix, format, ext);
        }
      }
      const formatPath = getPath().join(dir, `${name}.${format}.${ext}`);
      if (getFs().existsSync(formatPath)) {
        return this.buildTemplate(formatPath, name, prefix, format, ext);
      }
      const plainPath = getPath().join(dir, `${name}.${ext}`);
      if (getFs().existsSync(plainPath)) {
        return this.buildTemplate(plainPath, name, prefix, format, ext);
      }
    }

    return null;
  }

  /**
   * First template on disk named `<name>.<format>+<any variant>.<ext>`.
   * Backs Rails' `variants: :any`, which asks whether a template exists at
   * all rather than whether a specific variant does.
   *
   * @internal
   */
  protected findAnyVariant(dir: string, name: string, format: string, ext: string): string | null {
    let entries: string[];
    try {
      entries = getFs().readdirSync(dir);
    } catch {
      return null;
    }
    const prefix = `${name}.${format}+`;
    const suffix = `.${ext}`;
    const hit = entries.find((e) => e.startsWith(prefix) && e.endsWith(suffix));
    return hit ? getPath().join(dir, hit) : null;
  }

  /** @internal */
  protected buildTemplate(
    fullPath: string,
    name: string,
    prefix: string,
    format: string,
    extension: string,
  ): Template {
    return new Template({
      source: getFs().readFileSync(fullPath, "utf-8"),
      extension,
      identifier: `${prefix}/${name}`,
      virtualPath: `${prefix}/${name}`,
      format,
      fullPath,
      isPartial: name.startsWith("_"),
    });
  }
}
