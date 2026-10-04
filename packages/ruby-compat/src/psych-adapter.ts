import { LoadError } from "./load-error.js";

export type { CollectionTag, YAMLMap } from "yaml";

/**
 * The libyaml binding `psych.so` is in MRI (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`): the npm `yaml` package, an optional dependency. A
 * miss raises the `LoadError` `vendor/ruby/v3.3.11/lib/yaml.rb:3-18` re-raises.
 *
 * @noRailsEquivalent PERMANENT
 */
export const yaml: typeof import("yaml") = await import("yaml").catch(() => {
  const missing = (): never => {
    throw new LoadError("cannot load such file -- yaml");
  };
  return { parse: missing, stringify: missing } as unknown as typeof import("yaml");
});

/**
 * The backend's own value parser, behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`. Not `Psych.parse` (`:398`), which answers a node tree.
 *
 * @noRailsEquivalent PERMANENT
 */
export const parse: typeof import("yaml").parse = yaml.parse;

/**
 * The backend's own emitter, behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const stringify: typeof import("yaml").stringify = yaml.stringify;
