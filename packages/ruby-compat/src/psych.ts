/* eslint-disable @typescript-eslint/no-namespace -- Ruby's `Psych` module is a
   namespace of module functions and classes; ESM syntax cannot spell `Psych.dump`. */
import type * as Yaml from "yaml";
import { yaml as backend, type PsychIO, type PsychNode } from "./psych-adapter.js";
import { Coder as PsychCoder } from "./psych/coder.js";
import { ClassLoader as PsychClassLoader } from "./psych/class-loader.js";
import {
  AliasesNotEnabled as PsychAliasesNotEnabled,
  AnchorNotDefined as PsychAnchorNotDefined,
  BadAlias as PsychBadAlias,
  DisallowedClass as PsychDisallowedClass,
  Exception as PsychException,
} from "./psych/exception.js";
import { SyntaxError as PsychSyntaxError } from "./psych/syntax-error.js";
import { ScalarScanner as PsychScalarScanner } from "./psych/scalar-scanner.js";
import { NoAliasRuby, ToRuby } from "./psych/visitors/to-ruby.js";
import { Omap as PsychOmap } from "./psych/omap.js";
import { isPlainHash, rbModToS } from "./object.js";
import { File } from "./file.js";
import { IO } from "./io.js";
import { registerConstant } from "./variable.js";
import { Emitter as VisitorsEmitter } from "./psych/visitors/emitter.js";
import { RestrictedYAMLTree, YAMLTree, type YAMLTreeOptions } from "./psych/visitors/yaml-tree.js";

const yaml = backend as unknown as typeof Yaml;

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
   * `Psych::SyntaxError` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/syntax_error.rb:5`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const SyntaxError = PsychSyntaxError;
  export type SyntaxError = PsychSyntaxError;

  /**
   * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const Coder = PsychCoder;
  export type Coder = PsychCoder;

  /**
   * `Psych::Omap` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/omap.rb:3`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export const Omap = PsychOmap;
  export type Omap<K = unknown, V = unknown> = PsychOmap<K, V>;

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
    get Emitter() {
      return VisitorsEmitter;
    },
  };

  /* eslint-disable prefer-const */
  /**
   * `Psych.load_tags` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:736,741`): a tag to
   * the name of the class it loads as. Ruby's `attr_accessor`, so `Psych.loadTags = {}`
   * replaces it.
   *
   * @noRailsEquivalent PERMANENT
   */
  export let loadTags: Record<string, string> = Object.create(null) as Record<string, string>;

  /**
   * `Psych.dump_tags` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:737,742`): a class to
   * the tag it dumps under.
   *
   * @noRailsEquivalent PERMANENT
   */
  export let dumpTags = new Map<object, string>();

  /**
   * `Psych.domain_types` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:738,743`): a tag
   * key to `[key, block]`, the block called with the key and the loaded value.
   *
   * @noRailsEquivalent PERMANENT
   */
  export let domainTypes: Record<string, [string, (typeTag: string, value: unknown) => unknown]> =
    Object.create(null) as Record<string, never>;

  /* eslint-enable prefer-const */

  /**
   * `Psych.add_builtin_type` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:682-686`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function addBuiltinType(
    typeTag: string,
    block: (typeTag: string, value: unknown) => unknown,
  ): void {
    const domain = "yaml.org,2002";
    const key = ["tag", domain, typeTag].join(":");
    domainTypes[key] = [key, block];
  }

  /**
   * `Psych.dump` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:505-514`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function dump(o: unknown, io?: YAMLTreeOptions | null, options?: YAMLTreeOptions): string;
  export function dump<T extends PsychIO>(o: unknown, io: T, options?: YAMLTreeOptions): T;
  export function dump(
    o: unknown,
    io: PsychIO | YAMLTreeOptions | null = null,
    options: YAMLTreeOptions = {},
  ): string | PsychIO {
    if (isPlainHash(io)) {
      options = io as YAMLTreeOptions;
      io = null;
    }

    const visitor = YAMLTree.create(options);
    visitor.push(o);
    return visitor.tree.yaml(io as PsychIO | null, options);
  }

  /**
   * `Psych.safe_dump` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:578-587`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function safeDump(
    o: unknown,
    io?: YAMLTreeOptions | null,
    options?: YAMLTreeOptions,
  ): string;
  export function safeDump<T extends PsychIO>(o: unknown, io: T, options?: YAMLTreeOptions): T;
  export function safeDump(
    o: unknown,
    io: PsychIO | YAMLTreeOptions | null = null,
    options: YAMLTreeOptions = {},
  ): string | PsychIO {
    if (isPlainHash(io)) {
      options = io as YAMLTreeOptions;
      io = null;
    }

    const visitor = RestrictedYAMLTree.create(options);
    visitor.push(o);
    return visitor.tree.yaml(io as PsychIO | null, options);
  }

  /**
   * `Psych.unsafe_load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:271`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function unsafeLoad(
    yamlString: string | Uint8Array | IO,
    {
      filename = null as string | null,
      fallback = false as unknown,
      symbolizeNames = false,
      freeze = false,
      strictInteger = false,
    } = {},
  ): unknown {
    const result = parse(yamlString, { filename });
    if (!result) return fallback;
    return ToRuby.create({ symbolizeNames, freeze, strictInteger }).accept(result);
  }

  /**
   * `Psych.parse` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:398`): the first
   * document's root node. libyaml reads the source's bytes
   * (`yaml_parser_set_input_string`, `vendor/ruby/v3.3.11/ext/psych/psych_parser.c:271`),
   * so a source held as its bytes is decoded here. A malformed document raises
   * `Psych::SyntaxError` as `make_exception` does (`psych_parser.c:80-100`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function parse(
    yamlString: string | Uint8Array | IO,
    { filename = null as string | null } = {},
  ): PsychNode | false {
    if (yamlString instanceof IO) yamlString = yamlString.read();
    if (yamlString instanceof Uint8Array) yamlString = new TextDecoder().decode(yamlString);
    const doc = yaml.parseDocument(yamlString);
    const root = doc.contents;
    const end = root?.range?.[1] ?? 0;
    const closed =
      root != null && yaml.isCollection(root) && root.flow
        ? "}]".includes(yamlString[end - 1] ?? "")
        : yaml.isScalar(root) && (root.type === "QUOTE_SINGLE" || root.type === "QUOTE_DOUBLE");
    const errors = closed ? doc.errors.filter((e) => e.pos[0] < end) : doc.errors;
    if (errors.length > 0) {
      const [error] = errors;
      const mark = error.linePos?.[0] ?? { line: 0, col: 0 };
      throw new PsychSyntaxError(
        filename,
        mark.line,
        mark.col,
        error.pos[0],
        error.message.split(" at line ")[0],
        null,
      );
    }
    return doc.contents ?? false;
  }

  /**
   * `Psych.safe_load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:322`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function safeLoad(
    yamlString: string | Uint8Array | IO,
    {
      permittedClasses = [] as unknown[],
      permittedSymbols = [] as string[],
      aliases = false,
      filename = null as string | null,
      fallback = null as unknown,
      symbolizeNames = false,
      freeze = false,
      strictInteger = false,
    } = {},
  ): unknown {
    const result = parse(yamlString, { filename });
    if (!result) return fallback;

    const classLoader = new PsychClassLoader.Restricted(
      permittedClasses.map((klass) =>
        typeof klass === "string" ? klass : rbModToS(klass as new () => unknown),
      ),
      permittedSymbols.map(String),
    );
    const scanner = new PsychScalarScanner(classLoader, { strictInteger });
    const visitor = aliases
      ? new ToRuby(scanner, classLoader, { symbolizeNames, freeze })
      : new NoAliasRuby(scanner, classLoader, { symbolizeNames, freeze });
    return visitor.accept(result);
  }

  /**
   * `Psych.load` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:368-377`). trails has no
   * `Symbol` class, so `permitted_classes: [Symbol]` names it, which
   * `permitted_classes.map(&:to_s)` (`:326`) reads the same.
   *
   * @noRailsEquivalent PERMANENT
   */
  export function load(
    yamlString: string | Uint8Array | IO,
    {
      permittedClasses = ["Symbol"] as unknown[],
      permittedSymbols = [] as string[],
      aliases = false,
      filename = null as string | null,
      fallback = null as unknown,
      symbolizeNames = false,
      freeze = false,
      strictInteger = false,
    } = {},
  ): unknown {
    return safeLoad(yamlString, {
      permittedClasses,
      permittedSymbols,
      aliases,
      filename,
      fallback,
      symbolizeNames,
      freeze,
      strictInteger,
    });
  }

  /**
   * `Psych.unsafe_load_file` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:647-651`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function unsafeLoadFile(
    filename: string,
    kwargs: Omit<NonNullable<Parameters<typeof unsafeLoad>[1]>, "filename"> = {},
  ): unknown {
    return File.open(filename, "r:bom|utf-8", (f) => unsafeLoad(f, { filename, ...kwargs }));
  }

  /**
   * `Psych.load_file` (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:669-673`).
   *
   * @noRailsEquivalent PERMANENT
   */
  export function loadFile(
    filename: string,
    kwargs: Omit<NonNullable<Parameters<typeof load>[1]>, "filename"> = {},
  ): unknown {
    return File.open(filename, "r:bom|utf-8", (f) => load(f, { filename, ...kwargs }));
  }
}

registerConstant("Psych", Psych);
