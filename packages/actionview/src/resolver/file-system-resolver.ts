/**
 * ActionView::FileSystemResolver
 *
 * Finds templates on the filesystem under a base path.
 * Searches `{basePath}/{prefix}/{name}.{format}.{extension}`,
 * falling back to `{basePath}/{prefix}/{name}.{extension}`.
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import { Template } from "../template.js";
import { Resolver, type TemplateResolver } from "./resolver.js";

export class FileSystemResolver extends Resolver implements TemplateResolver {
  constructor(protected basePath: string) {
    super();
  }

  /** @internal */
  path(): string {
    return this.basePath;
  }

  find(name: string, prefix: string, format: string, extensions: string[]): Template | null {
    const dir = getPath().join(this.basePath, prefix);

    for (const ext of extensions) {
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
