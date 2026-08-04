/**
 * `yaml` is an optionalDependency of this package, taken in the shape
 * `packages/activesupport/src/yaml.ts` settled on. Rails has no counterpart to
 * this file: Psych is stdlib, so `require 'yaml'`
 * (i18n/lib/i18n/backend/base.rb:3) cannot fail and `load_yml` (base.rb:261)
 * simply hands the file to it. In trails `yaml` is an npm package a consumer
 * may omit, and a static `export … from "yaml"` here is an eager ESM link-time
 * edge — it would make every module that merely names `loadYml` unimportable,
 * taking the whole `@blazetrails/i18n` root import down with it. Resolving the
 * package once, here, keeps the miss local to `load_yml`, which is where Ruby
 * would raise its `LoadError` from too.
 */
const yaml = await import("yaml").catch(() => {
  const missing = (): never => {
    throw new Error(
      "The `yaml` package is required to read YAML locale files. Install it with `npm install yaml`.",
    );
  };
  return { parse: missing } as unknown as typeof import("yaml");
});

export const { parse } = yaml;
