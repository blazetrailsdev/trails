/* eslint-disable @typescript-eslint/no-namespace -- Ruby's `Psych` module is a
   namespace of module functions and classes; ESM syntax cannot spell `Psych.dump`. */
import type { ParsedNode } from "yaml";
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
import { rbModToS } from "./object.js";
import { RestrictedYAMLTree, YAMLTree } from "./psych/visitors/yaml-tree.js";

export { coderTag } from "./psych/coder.js";

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
  export const Visitors = {
    get ToRuby() {
      return ToRuby;
    },
    get NoAliasRuby() {
      return NoAliasRuby;
    },
    get YAMLTree() {
      return YAMLTree;
    },
    get RestrictedYAMLTree() {
      return RestrictedYAMLTree;
    },
  };

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
   * `Psych.safe_dump` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:578`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function safeDump(
    o: unknown,
    options: { permittedClasses?: unknown[]; permittedSymbols?: string[]; aliases?: boolean } = {},
  ): string {
    const visitor = RestrictedYAMLTree.create(options);
    visitor.push(o);
    return visitor.tree.toString({ directives: true });
  }

  /**
   * `Object#to_yaml` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/core_ext.rb:12-14`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function toYaml(o: unknown): string {
    return dump(o);
  }

  /**
   * `Psych.unsafe_load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:271`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function unsafeLoad(yamlString: string | Uint8Array): unknown {
    const result = parse(yamlString);
    return ToRuby.create().accept(result);
  }

  /**
   * `Psych.parse` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:398`): the first
   * document's root node. libyaml reads the source's bytes
   * (`yaml_parser_set_input_string`, `vendor/ruby/v3.3.11/ext/psych/psych_parser.c:271`),
   * so a source held as its bytes is decoded here.
   *
   * @noRailsEquivalent PERMANENT
   */
  export function parse(yamlString: string | Uint8Array): ParsedNode | null {
    if (yamlString instanceof Uint8Array) yamlString = new TextDecoder().decode(yamlString);
    return yaml.parseDocument(yamlString).contents;
  }

  /**
   * `Psych.safe_load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:322`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function safeLoad(
    yamlString: string | Uint8Array,
    {
      permittedClasses = [] as unknown[],
      permittedSymbols = [] as string[],
      aliases = false,
      fallback = null as unknown,
      symbolizeNames = false,
      freeze = false,
      strictInteger = false,
    } = {},
  ): unknown {
    const result = parse(yamlString);
    if (!result) return fallback;

    const classLoader = new PsychClassLoader.Restricted(
      permittedClasses.map((klass) => rbModToS(klass as new () => unknown)),
      permittedSymbols.map(String),
    );
    const scanner = new PsychScalarScanner(classLoader, { strictInteger });
    const visitor = aliases
      ? new ToRuby(scanner, classLoader, { symbolizeNames, freeze })
      : new NoAliasRuby(scanner, classLoader, { symbolizeNames, freeze });
    return visitor.accept(result);
  }
}
