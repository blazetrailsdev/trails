/* eslint-disable @typescript-eslint/no-namespace -- Ruby's `Psych` module is a
   namespace of module functions and classes; ESM syntax cannot spell `Psych.dump`. */
import type { Node } from "yaml";
import { yaml } from "./psych-adapter.js";
import { Coder as PsychCoder } from "./psych/coder.js";
import { DisallowedClass as PsychDisallowedClass } from "./psych/exception.js";
import { ToRuby } from "./psych/visitors/to-ruby.js";
import { YAMLTree } from "./psych/visitors/yaml-tree.js";

/**
 * Ruby's stdlib `Psych` module (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:234`).
 *
 * @noRailsEquivalent PERMANENT
 */
export namespace Psych {
  /**
   * `Psych::DisallowedClass` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:23`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const DisallowedClass = PsychDisallowedClass;
  export type DisallowedClass = PsychDisallowedClass;

  /**
   * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const Coder = PsychCoder;
  export type Coder = PsychCoder;

  /**
   * `Psych.load_tags` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:741`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const loadTags: Record<string, string> = Object.create(null) as Record<string, string>;

  /**
   * `Psych.dump_tags` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:742`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const dumpTags = new Map<object, string>();

  /**
   * `Psych.dump` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:505`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function dump(o: unknown): string {
    const visitor = new YAMLTree();
    visitor.push(o);
    return visitor.tree.toString({ directives: true });
  }

  /**
   * `Psych.unsafe_load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:271`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function unsafeLoad(yamlString: string): unknown {
    const doc = yaml.parseDocument(yamlString);
    return new ToRuby().accept(doc.contents as Node | null);
  }
}
