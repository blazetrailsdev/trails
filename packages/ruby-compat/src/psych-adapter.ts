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
 * libyaml reads the source's bytes (`yaml_parser_set_input_string`,
 * `vendor/ruby/v3.3.11/ext/psych/psych_parser.c:271`), so a source held as its
 * bytes is decoded here; malformed bytes raise `SyntaxError` (`Psych::SyntaxError`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const parse = ((src: string | Uint8Array, ...options: unknown[]) => {
  if (src instanceof Uint8Array) {
    try {
      src = new TextDecoder("utf-8", { fatal: true }).decode(src);
    } catch {
      throw new SyntaxError("invalid leading UTF-8 octet");
    }
  }
  return (yaml.parse as (...args: unknown[]) => unknown)(src, ...options);
}) as typeof import("yaml").parse;

/**
 * The backend's own emitter, behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const stringify: typeof import("yaml").stringify = yaml.stringify;
