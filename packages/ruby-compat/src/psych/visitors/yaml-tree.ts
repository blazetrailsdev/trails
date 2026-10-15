import { Hash } from "../../hash.js";
import {
  rbCDate,
  rbCFalseClass,
  rbCFloat,
  rbCInteger,
  rbCNilClass,
  rbCString,
  rbCTime,
  rbCTrueClass,
  rbInspect,
  rbModName,
  rbObjClass,
  rbModToS,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjRespondTo,
} from "../../object.js";
import { Range } from "../../range.js";
import { type StructInstance, isStruct } from "../../struct.js";
import { temporalTag } from "../../temporal-tag.js";
import { TypeError } from "../../type-error.js";
import { registeredConstant } from "../../variable.js";
import type { Node, Scalar, YAMLMap } from "yaml";
import { Psych } from "../../psych.js";
import type * as Yaml from "yaml";
import { yaml as backend, type PsychDocument, type PsychNode } from "../../psych-adapter.js";
import { Coder, coderSeq, coderTag, coderType } from "../coder.js";
import { ClassLoader } from "../class-loader.js";
import { BadAlias, DisallowedClass } from "../exception.js";
import { ScalarScanner } from "../scalar-scanner.js";
import { NotImplementedError } from "../../not-implemented-error.js";
import { ArgumentError } from "../../argument-error.js";
import { Omap } from "../omap.js";

const yaml = backend as unknown as typeof Yaml;

const BREAK = /[\r\n\u0085\u2028\u2029]/;
const blankz = (c: string | undefined) =>
  c === undefined || c === " " || c === "\t" || BREAK.test(c);
const PRINTABLE = /^[\n\x20-\x7e\x85\xa0-\ud7ff\ue000-\ufefe\uff00-\ufffd\u{10000}-\u{10ffff}]$/u;

function analyzeScalar(value: string): {
  blockPlainAllowed: boolean;
  singleQuotedAllowed: boolean;
  blockAllowed: boolean;
} {
  if (value.length === 0) {
    return { blockPlainAllowed: true, singleQuotedAllowed: true, blockAllowed: false };
  }
  const chars = Array.from(value);
  let blockIndicators = false;
  let leadingSpace = false;
  let leadingBreak = false;
  let trailingSpace = false;
  let trailingBreak = false;
  let breakSpace = false;
  let spaceBreak = false;
  let previousSpace = false;
  let previousBreak = false;
  let lineBreaks = false;
  let specialCharacters = false;

  if ((value.startsWith("---") || value.startsWith("...")) && blankz(chars[3])) {
    blockIndicators = true;
  }
  let precededByWhitespace = true;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const followedByWhitespace = blankz(chars[i + 1]);
    if (i === 0) {
      if ("#,[]{}&*!|>'\"%@`".includes(c)) blockIndicators = true;
      if ((c === "?" || c === ":" || c === "-") && followedByWhitespace) blockIndicators = true;
    } else {
      if (c === ":" && followedByWhitespace) blockIndicators = true;
      if (c === "#" && precededByWhitespace) blockIndicators = true;
    }
    if (!PRINTABLE.test(c) || c === "\ufeff") specialCharacters = true;
    if (BREAK.test(c)) lineBreaks = true;
    if (c === " ") {
      if (i === 0) leadingSpace = true;
      if (i === chars.length - 1) trailingSpace = true;
      if (previousBreak) breakSpace = true;
      previousSpace = true;
      previousBreak = false;
    } else if (BREAK.test(c)) {
      if (i === 0) leadingBreak = true;
      if (i === chars.length - 1) trailingBreak = true;
      if (previousSpace) spaceBreak = true;
      previousBreak = true;
      previousSpace = false;
    } else {
      previousSpace = false;
      previousBreak = false;
    }
    precededByWhitespace = blankz(c);
  }

  let blockPlainAllowed = true;
  let singleQuotedAllowed = true;
  let blockAllowed = true;
  if (leadingSpace || leadingBreak || trailingSpace || trailingBreak) blockPlainAllowed = false;
  if (trailingSpace) blockAllowed = false;
  if (breakSpace) {
    blockPlainAllowed = false;
    singleQuotedAllowed = false;
  }
  if (spaceBreak || specialCharacters) {
    blockPlainAllowed = singleQuotedAllowed = blockAllowed = false;
  }
  if (lineBreaks) blockPlainAllowed = false;
  if (blockIndicators) blockPlainAllowed = false;
  return { blockPlainAllowed, singleQuotedAllowed, blockAllowed };
}

function writeSingleQuoted(
  stringify: NonNullable<Yaml.ScalarTag["stringify"]>,
): NonNullable<Yaml.ScalarTag["stringify"]> {
  return (item, ctx, onComment, onChompKeep) => {
    const { value, type } = item as Scalar<string>;
    if (type !== yaml.Scalar.QUOTE_SINGLE || typeof value !== "string") {
      return stringify(item, ctx, onComment, onChompKeep);
    }
    const lineWidth = ctx.options.lineWidth;
    const bestWidth = lineWidth > 0 ? lineWidth : Infinity;
    const allowBreaks = !ctx.implicitKey;
    const chars = Array.from(value);
    let out = "'";
    let column =
      (ctx.indentAtStart === undefined
        ? ctx.indent === ""
          ? "--- ".length
          : ctx.indent.length
        : ctx.indent.length - ctx.indentStep.length + ctx.indentAtStart) + 1;
    let spaces = false;
    let breaks = false;
    const writeIndent = () => {
      if (!out.endsWith("\n")) out += "\n";
      out += ctx.indent;
      column = ctx.indent.length;
    };
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === " ") {
        if (
          allowBreaks &&
          !spaces &&
          column > bestWidth &&
          i !== 0 &&
          i !== chars.length - 1 &&
          chars[i + 1] !== " "
        ) {
          writeIndent();
        } else {
          out += c;
          column++;
        }
        spaces = true;
      } else if (BREAK.test(c)) {
        if (!breaks && c === "\n") out += "\n";
        out += "\n";
        column = 0;
        breaks = true;
      } else {
        if (breaks) writeIndent();
        out += c === "'" ? "''" : c;
        column += c === "'" ? 2 : 1;
        spaces = false;
        breaks = false;
      }
    }
    if (breaks) writeIndent();
    return `${out}'`;
  };
}

type RubyTime = { isUtc(): boolean; strftime(format: string): string };
type RubyDate = { gregorian(): { toS(): string } };
type DateTime = { italy(): RubyTime & { offset: { isZero(): boolean } } };
type PlainDate = { toString(): string };
type ZonedDateTime = {
  timeZoneId: string;
  offset: string;
  toPlainTime(): { toString(options: { fractionalSecondDigits: number }): string };
  toPlainDate(): PlainDate;
};
type Instant = { toZonedDateTimeISO(timeZone: string): ZonedDateTime };

/** The `options` Hash `YAMLTree.create` takes (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:48`). */
export interface YAMLTreeOptions {
  permittedClasses?: unknown[];
  aliases?: boolean;
  indentation?: number;
  canonical?: boolean;
  lineWidth?: number;
}

/**
 * `Psych::Visitors::YAMLTree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:15`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class YAMLTree {
  /** @internal */
  protected readonly st = new Map<object, PsychNode>();
  private readonly doc = new yaml.Document(undefined, {
    customTags: (tags: Yaml.Tags) =>
      tags.map((t) =>
        typeof t === "object" && t.tag === "tag:yaml.org,2002:str"
          ? {
              ...(t as Yaml.ScalarTag),
              stringify: writeSingleQuoted((t as Yaml.ScalarTag).stringify!),
            }
          : t,
      ),
  });
  private anchors = 0;
  private readonly ss: ScalarScanner;
  private readonly lineWidth: number | null;

  /**
   * `YAMLTree.create` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:48`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static create(options: YAMLTreeOptions = {}): YAMLTree {
    const classLoader = new ClassLoader();
    const ss = new ScalarScanner(classLoader);
    return new this(ss, options);
  }

  /** @noRailsEquivalent PERMANENT */
  constructor(ss: ScalarScanner, options: YAMLTreeOptions = {}) {
    this.ss = ss;
    this.lineWidth = options.lineWidth ?? null;
    if (this.lineWidth != null && this.lineWidth < 0) {
      if (this.lineWidth === -1) {
        this.lineWidth = null;
      } else {
        throw new ArgumentError(
          `Invalid line_width ${this.lineWidth}, must be non-negative or -1 for unlimited.`,
        );
      }
    }
  }

  /** @noRailsEquivalent PERMANENT */
  accept(target: unknown): PsychNode {
    if (target !== null && typeof target === "object" && this.st.has(target)) {
      const node = this.st.get(target)! as Node;
      node.anchor ??= String(++this.anchors);
      return new yaml.Alias(node.anchor) as unknown as Node;
    }

    if (rbObjRespondTo(target, "encodeWith")) {
      return this.dumpCoder(target as { encodeWith(coder: Coder): void });
    }
    if (typeof target === "string") {
      return /^:./s.test(target) ? this.visitSymbol(target) : this.visitString(target);
    }
    if (typeof target === "function") return this.visitClass(target);
    const tag = target == null ? null : temporalTag(target);
    const dateTime = registeredConstant("DateTime");
    if (typeof dateTime === "function" && target instanceof dateTime) {
      return this.visitDateTime(target as DateTime);
    }
    if (target instanceof rbCDate) return this.visitDate(target as RubyDate);
    if (
      target instanceof rbCTime ||
      tag === "Temporal.ZonedDateTime" ||
      tag === "Temporal.Instant"
    ) {
      return this.visitTime(target as RubyTime | ZonedDateTime | Instant);
    }
    if (tag === "Temporal.PlainDate") {
      return this.register(target as object, this.visitInteger(target as PlainDate));
    }
    if (target instanceof Range) return this.visitRange(target);
    if (target instanceof RegExp) return this.visitRegexp(target);
    if (Array.isArray(target)) return this.visitArray(target);
    if (target instanceof Omap) return this.visitPsychOmap(target);
    if (target instanceof Map) return this.visitHash(target);
    if (isStruct(target)) return this.visitStruct(target);
    if (target !== null && typeof target === "object") {
      return [Object.prototype, null].includes(Object.getPrototypeOf(target) as object | null)
        ? this.visitHash(target)
        : this.visitObject(target);
    }
    return this.doc.createNode(target ?? null);
  }

  private visitObject(o: object): Node {
    let tag = Psych.dumpTags.get(o.constructor);
    if (tag === undefined) {
      const klass =
        o.constructor === Object ? undefined : rbModName(o.constructor as new () => unknown);
      tag = ["!ruby/object", klass].filter((part) => part != null).join(":");
    }
    const map = new yaml.YAMLMap();
    map.tag = tag;
    this.register(o, map);
    this.dumpIvars(o, map);
    return map;
  }

  private visitStruct(o: StructInstance & object): Node {
    const tag = ["!ruby/struct", rbModName(o.constructor as new () => unknown)]
      .filter((part) => part != null)
      .join(":");

    const map = new yaml.YAMLMap();
    map.tag = tag;
    this.register(o, map);
    for (const member of o.members()) {
      map.add(
        new yaml.Pair(
          this.doc.createNode(member),
          this.accept((o as unknown as Record<string, unknown>)[member]),
        ),
      );
    }

    this.dumpIvars(o, map);

    return map;
  }

  private visitPsychOmap(o: Omap): Node {
    const seq = new yaml.YAMLSeq();
    seq.tag = "tag:yaml.org,2002:omap";
    this.register(o, seq);

    for (const [k, v] of o) seq.items.push(this.visitHash(new Map([[k, v]])));
    return seq;
  }

  private visitClass(o: { name?: string }): Node {
    const name = rbModName(o as new () => unknown);
    if (!name) throw new TypeError(`can't dump anonymous class: ${String(o)}`);
    const scalar = new yaml.Scalar(name);
    scalar.tag = "!ruby/class";
    scalar.type = yaml.Scalar.QUOTE_SINGLE;
    return this.register(o, scalar);
  }

  private visitString(o: string): Node {
    let style: Scalar.Type = yaml.Scalar.PLAIN;
    let tag: string | null = null;

    if (/\n(?!\n?$)/.test(o)) {
      style = yaml.Scalar.BLOCK_LITERAL;
    } else if (o === "<<") {
      style = yaml.Scalar.QUOTE_SINGLE;
      tag = "tag:yaml.org,2002:str";
    } else if (o === "y" || o === "n") {
      style = yaml.Scalar.QUOTE_DOUBLE;
    } else if (this.lineWidth != null && Array.from(o).length > this.lineWidth) {
      style = yaml.Scalar.BLOCK_FOLDED;
    } else if (/^[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}][^"]*$/mu.test(o)) {
      style = yaml.Scalar.QUOTE_DOUBLE;
    } else if (typeof this.ss.tokenize(o) !== "string" || /^0[0-7]*[89]/.test(o)) {
      style = yaml.Scalar.QUOTE_SINGLE;
    }

    const analysis = analyzeScalar(o);
    if (style === yaml.Scalar.PLAIN && !analysis.blockPlainAllowed) {
      style = yaml.Scalar.QUOTE_SINGLE;
    }
    if (style === yaml.Scalar.QUOTE_SINGLE && !analysis.singleQuotedAllowed) {
      style = yaml.Scalar.QUOTE_DOUBLE;
    }
    if (
      (style === yaml.Scalar.BLOCK_LITERAL || style === yaml.Scalar.BLOCK_FOLDED) &&
      !analysis.blockAllowed
    ) {
      style = yaml.Scalar.QUOTE_DOUBLE;
    }

    const scalar = this.doc.createNode(o) as Scalar;
    scalar.type = style;
    if (tag) scalar.tag = tag;
    return scalar;
  }

  private visitSymbol(o: string): Node {
    const scalar = this.doc.createNode(o) as Scalar;
    scalar.type = analyzeScalar(o).blockPlainAllowed ? yaml.Scalar.PLAIN : yaml.Scalar.QUOTE_SINGLE;
    return scalar;
  }

  private visitRegexp(o: RegExp): Node {
    const scalar = new yaml.Scalar(String(o));
    scalar.tag = "!ruby/regexp";
    return this.register(o, scalar);
  }

  private visitDate(o: RubyDate): Node {
    return this.register(o, this.visitInteger(o.gregorian()));
  }

  private visitDateTime(o: DateTime): Node {
    const t = o.italy();
    const formatted = this.formatTime(t, t.offset.isZero());
    const scalar = new yaml.Scalar(formatted);
    scalar.tag = "!ruby/object:DateTime";
    return this.register(o, scalar);
  }

  private visitTime(o: RubyTime | ZonedDateTime | Instant): Node {
    return this.register(o, new yaml.Scalar(this.formatTime(o)));
  }

  private visitInteger(o: { toS(): string } | PlainDate): Node {
    return new yaml.Scalar(
      temporalTag(o) === "Temporal.PlainDate"
        ? (o as PlainDate).toString()
        : (o as { toS(): string }).toS(),
    );
  }

  private visitRange(o: Range): Node {
    const map = new yaml.YAMLMap();
    map.tag = "!ruby/range";
    this.register(o, map);
    for (const [k, v] of [
      ["begin", o.begin],
      ["end", o.end],
      ["excl", o.excludeEnd],
    ] as const) {
      map.add(new yaml.Pair(this.accept(k), this.accept(v)));
    }
    return map;
  }

  private visitHash(o: Map<unknown, unknown> | object): Node {
    if (!(o instanceof Map) || o.constructor === Map || o.constructor === Hash) {
      const map = new yaml.YAMLMap();
      this.register(o, map);
      for (const [k, v] of o instanceof Map ? o : Object.entries(o)) {
        map.add(new yaml.Pair(this.accept(k), this.accept(v)));
      }
      return map;
    } else {
      return this.visitHashSubclass(o);
    }
  }

  private visitArray(o: unknown[]): Node {
    const seq = new yaml.YAMLSeq();
    this.register(o, seq);
    for (const thing of o) seq.items.push(this.accept(thing));
    return seq;
  }

  private visitHashSubclass(o: Map<unknown, unknown>): Node {
    const ivars = rbObjInstanceVariables(o);
    if (ivars.length > 0) {
      const node = new yaml.YAMLMap();
      node.tag = `!ruby/hash-with-ivars:${rbModToS(o.constructor as new () => unknown)}`;
      this.register(o, node);

      const ivarsKey = this.accept("ivars");
      const ivarsMap = new yaml.YAMLMap();
      for (const ivar of rbObjInstanceVariables(o)) {
        ivarsMap.add(new yaml.Pair(this.accept(`:${ivar}`), this.accept(rbObjIvarGet(o, ivar))));
      }
      node.add(new yaml.Pair(ivarsKey, ivarsMap));

      const elementsKey = this.accept("elements");
      const elements = new yaml.YAMLMap();
      for (const [k, v] of o) elements.add(new yaml.Pair(this.accept(k), this.accept(v)));
      node.add(new yaml.Pair(elementsKey, elements));

      return node;
    } else {
      const node = new yaml.YAMLMap();
      node.tag = `!ruby/hash:${rbModToS(o.constructor as new () => unknown)}`;
      this.register(o, node);
      for (const [k, v] of o) node.add(new yaml.Pair(this.accept(k), this.accept(v)));
      return node;
    }
  }

  private formatTime(
    time: RubyTime | ZonedDateTime | Instant,
    utc = temporalTag(time) === null
      ? (time as RubyTime).isUtc()
      : temporalTag(time) !== "Temporal.ZonedDateTime" ||
        (time as ZonedDateTime).timeZoneId === "UTC",
  ): string {
    if (temporalTag(time) === "Temporal.Instant") {
      time = (time as Instant).toZonedDateTimeISO("UTC");
    }
    if (temporalTag(time) === "Temporal.ZonedDateTime") {
      time = time as ZonedDateTime;
      const clock = time.toPlainTime().toString({ fractionalSecondDigits: 9 });
      return `${time.toPlainDate().toString()} ${clock} ${utc ? "Z" : time.offset}`;
    }
    time = time as RubyTime;
    return utc
      ? time.strftime("%Y-%m-%d %H:%M:%S.%9N Z")
      : time.strftime("%Y-%m-%d %H:%M:%S.%9N %:z");
  }

  private register(target: object, yamlObj: Node): Node {
    this.st.set(target, yamlObj);
    return yamlObj;
  }

  private dumpCoder(o: { encodeWith(coder: Coder): void }): Node {
    let tag = Psych.dumpTags.get(o.constructor);
    if (tag === undefined) {
      const klass =
        o.constructor === Object ? undefined : rbModName(o.constructor as new () => unknown);
      tag = ["!ruby/object", klass].filter((part) => part != null).join(":");
    }
    const c = new Coder(tag);
    o.encodeWith(c);
    return this.emitCoder(c, o);
  }

  private emitCoder(c: Coder, o: object): Node {
    if (c[coderType] === ":seq") {
      const seq = new yaml.YAMLSeq();
      if (c[coderTag] !== null) seq.tag = c[coderTag];
      for (const thing of c[coderSeq]) seq.items.push(this.accept(thing));
      return seq;
    }
    const map = new yaml.YAMLMap();
    if (c[coderTag] !== null) map.tag = c[coderTag];
    this.register(o, map);
    for (const [k, v] of Object.entries(c)) map.add(new yaml.Pair(this.accept(k), this.accept(v)));
    return map;
  }

  private dumpIvars(target: object, map: YAMLMap): void {
    for (const iv of rbObjInstanceVariables(target)) {
      map.add(
        new yaml.Pair(
          this.doc.createNode(iv.replace(/^@/, "")),
          this.accept(rbObjIvarGet(target, iv)),
        ),
      );
    }
  }

  /**
   * `YAMLTree#tree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:97-100`).
   * Its `yaml` is `Psych::Nodes::Node#yaml` (`nodes/node.rb:58-64`) over
   * `Visitors::Emitter#initialize`'s options (`visitors/emitter.rb:5-17`); the
   * backend has no canonical style, so `canonical: true` raises.
   * libyaml writes a tagged or scalar root node on the `---` line, its
   * continuation lines indented (`YAML.dump(Object.new)` is
   * `"--- !ruby/object {}\n"`, `YAML.dump("a\nb")` is `"--- |-\n  a\n  b\n"`,
   * `YAML.dump(nil)` is `"---\n"`) where the backend breaks the line, so that
   * document start is written here. libyaml does not indent a block sequence
   * under a mapping key and writes `nil` as an empty plain scalar
   * (`{"a" => [nil]}.to_yaml` is `"---\na:\n-\n"`), so the backend is told so.
   *
   * @noRailsEquivalent PERMANENT
   */
  get tree(): PsychDocument {
    const doc = this.doc;
    return {
      yaml(io = null, options = {}) {
        const du: { indent?: number; lineWidth?: number; indentSeq: boolean; nullStr: string } = {
          indentSeq: false,
          nullStr: "",
        };
        if ("indentation" in options) du.indent = options.indentation;
        if (options.canonical) throw new NotImplementedError("canonical");
        if ("lineWidth" in options) du.lineWidth = options.lineWidth;
        let string: string;
        if (doc.contents?.tag) {
          string = `--- ${doc.toString(du)}`;
        } else if (yaml.isScalar(doc.contents)) {
          const indent = " ".repeat(du.indent ?? 2);
          string =
            doc.contents.value === null
              ? "---\n"
              : `--- ${doc.toString(du).replace(/\n(?=.)/g, `\n${indent}`)}`;
        } else {
          string = doc.toString({ directives: true, ...du }).replace(/^( *)- $/gm, "$1-");
        }
        if (!io) return string;
        io.write(string);
        return io;
      },
    };
  }

  /** @noRailsEquivalent PERMANENT */
  push(object: unknown): void {
    this.doc.contents = this.accept(object) as typeof this.doc.contents;
  }
}

/**
 * `Psych::Visitors::RestrictedYAMLTree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:540`).
 * A Symbol is a string here, so `Symbol === target` and `visit_Symbol`'s
 * `permitted_symbols` check have no value to turn on.
 *
 * @noRailsEquivalent PERMANENT
 */
export class RestrictedYAMLTree extends YAMLTree {
  /**
   * `RestrictedYAMLTree::DEFAULT_PERMITTED_CLASSES` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:541`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static readonly DEFAULT_PERMITTED_CLASSES: ReadonlySet<unknown> = new Set([
    rbCTrueClass,
    rbCFalseClass,
    rbCNilClass,
    rbCInteger,
    rbCFloat,
    rbCString,
    Array,
    Hash,
  ]);

  private readonly permittedClasses: Set<unknown>;
  private readonly aliases: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(ss: ScalarScanner, options: YAMLTreeOptions = {}) {
    super(ss, options);
    this.permittedClasses = new Set(RestrictedYAMLTree.DEFAULT_PERMITTED_CLASSES);
    for (const klass of options.permittedClasses ?? []) {
      this.permittedClasses.add(klass);
    }
    this.aliases = options.aliases ?? false;
  }

  /** @noRailsEquivalent PERMANENT */
  override accept(target: unknown): PsychNode {
    if (!this.aliases && target !== null && typeof target === "object" && this.st.has(target)) {
      throw new BadAlias("Tried to dump an aliased object");
    }

    const klass = rbObjClass(target);
    if (!this.permittedClasses.has(klass)) {
      throw new DisallowedClass("dump", rbModName(klass) ?? rbInspect(klass));
    }

    return super.accept(target);
  }
}
