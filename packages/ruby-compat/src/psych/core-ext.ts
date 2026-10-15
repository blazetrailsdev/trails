import { Psych } from "../psych.js";
import type { YAMLTreeOptions } from "./visitors/yaml-tree.js";

/**
 * `Object#to_yaml` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/core_ext.rb:12-14`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function toYaml(o: unknown, options: YAMLTreeOptions = {}): string {
  return Psych.dump(o, options);
}
