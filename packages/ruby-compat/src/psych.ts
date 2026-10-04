/* eslint-disable @typescript-eslint/no-namespace -- Ruby's `Psych` module is a
   namespace of module functions and classes; ESM syntax cannot spell `Psych.dump`. */
import type { Node } from "yaml";
import { yaml } from "./psych-adapter.js";
import { Coder as PsychCoder } from "./psych/coder.js";
import { ClassLoader as PsychClassLoader } from "./psych/class-loader.js";
import {
  AliasesNotEnabled as PsychAliasesNotEnabled,
  AnchorNotDefined as PsychAnchorNotDefined,
  BadAlias as PsychBadAlias,
  DisallowedClass as PsychDisallowedClass,
  Exception as PsychException,
} from "./psych/exception.js";
import { ScalarScanner as PsychScalarScanner } from "./psych/scalar-scanner.js";
import { NoAliasRuby, ToRuby } from "./psych/visitors/to-ruby.js";
import { YAMLTree } from "./psych/visitors/yaml-tree.js";

/**
 * Ruby's stdlib `Psych` module (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:234`).
 *
 * @noRailsEquivalent PERMANENT
 */
export namespace Psych {
  /**
   * `Psych::Exception` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:3`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const Exception = PsychException;
  export type Exception = PsychException;

  /**
   * `Psych::BadAlias` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:6`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const BadAlias = PsychBadAlias;
  export type BadAlias = PsychBadAlias;

  /**
   * `Psych::AliasesNotEnabled` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:10`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const AliasesNotEnabled = PsychAliasesNotEnabled;
  export type AliasesNotEnabled = PsychAliasesNotEnabled;

  /**
   * `Psych::AnchorNotDefined` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:17`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const AnchorNotDefined = PsychAnchorNotDefined;
  export type AnchorNotDefined = PsychAnchorNotDefined;

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
   * `Psych::ClassLoader` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:6`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const ClassLoader = PsychClassLoader;
  export type ClassLoader = PsychClassLoader;

  /**
   * `Psych::ScalarScanner` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:7`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const ScalarScanner = PsychScalarScanner;
  export type ScalarScanner = PsychScalarScanner;

  /**
   * `Psych::Visitors` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:11`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const Visitors = { ToRuby, NoAliasRuby, YAMLTree };

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
    const visitor = YAMLTree.create();
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
    return ToRuby.create().accept(doc.contents as Node | null);
  }
}
