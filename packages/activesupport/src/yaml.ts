// `yaml` is an optionalDependency of this package. Rails has no counterpart to
// this file at all: Psych is stdlib, so `require "yaml"` at the top of
// `active_record/coders/yaml_column.rb` (yaml_column.rb:3) cannot fail, and
// `active_record.rb:31` requires it unconditionally. In trails `yaml` is an npm
// package a consumer may omit, and a static `export … from "yaml"` here is an
// eager ESM link-time edge — it makes every module that merely *names* the YAML
// coders unimportable, taking the whole `@blazetrails/activerecord` and
// `@blazetrails/actionview` root imports down with it. Resolving the package
// once, here, and keeping the miss local moves the failure to the call site,
// which is where Ruby would raise from `YAML.dump` too.
const yaml = await import("yaml").catch(() => {
  const missing = (): never => {
    // Ruby's counterpart is the core `LoadError` that `require "yaml"` would
    // raise; there is no Rails error class to port here.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      "The `yaml` package is required to read or write YAML. Install it with `npm install yaml`.",
    );
  };
  return { parse: missing, stringify: missing } as unknown as typeof import("yaml");
});

export const { parse, stringify } = yaml;
