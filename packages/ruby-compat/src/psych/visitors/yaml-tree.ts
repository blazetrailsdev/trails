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
  rbObjAsString,
} from "../../object.js";
import { Range } from "../../range.js";
import { type StructInstance, isStruct } from "../../struct.js";
import { temporalTag } from "../../temporal-tag.js";
import { TypeError } from "../../type-error.js";
import { registeredConstant } from "../../variable.js";
import { Psych } from "../../psych.js";
import {
  Coder,
  coderImplicit,
  coderObject,
  coderScalar,
  coderSeq,
  coderStyle,
  coderTag,
  coderType,
} from "../coder.js";
import { ClassLoader } from "../class-loader.js";
import { BadAlias, DisallowedClass } from "../exception.js";
import { ScalarScanner } from "../scalar-scanner.js";
import { ArgumentError } from "../../argument-error.js";
import { Omap } from "../omap.js";
import { Mapping } from "../nodes/mapping.js";
import type { Node } from "../nodes/node.js";
import { Scalar } from "../nodes/scalar.js";
import { Sequence } from "../nodes/sequence.js";
import { Stream } from "../nodes/stream.js";
import { TreeBuilder } from "../tree-builder.js";

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
  header?: boolean;
  version?: number[] | string;
}

/**
 * `YAMLTree::Registrar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:16-41`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Registrar {
  private readonly objToId = new Map<unknown, number>();
  private readonly objToNode = new Map<unknown, Node>();
  private readonly targets: unknown[] = [];
  private counter = 0;

  /** @noRailsEquivalent PERMANENT */
  register(target: unknown, node: Node): void {
    this.targets.push(target);
    this.objToNode.set(target, node);
  }

  /** @noRailsEquivalent PERMANENT */
  isKey(target: unknown): boolean {
    return this.objToNode.has(target);
  }

  /** @noRailsEquivalent PERMANENT */
  idFor(target: unknown): number {
    let id = this.objToId.get(target);
    if (id === undefined) this.objToId.set(target, (id = ++this.counter));
    return id;
  }

  /** @noRailsEquivalent PERMANENT */
  nodeFor(target: unknown): Node | undefined {
    return this.objToNode.get(target);
  }
}

/**
 * `Psych::Visitors::YAMLTree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:15`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class YAMLTree {
  /** @internal */
  protected readonly st = new Registrar();
  private _started = false;
  private _finished = false;
  private readonly emitter: TreeBuilder;
  private readonly options: YAMLTreeOptions;
  private readonly ss: ScalarScanner;
  private readonly lineWidth: number | null;

  /**
   * `YAMLTree.create` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:48`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static create(options: YAMLTreeOptions = {}, emitter: TreeBuilder | null = null): YAMLTree {
    emitter ??= new TreeBuilder();
    const classLoader = new ClassLoader();
    const ss = new ScalarScanner(classLoader);
    return new this(emitter, ss, options);
  }

  /** @noRailsEquivalent PERMANENT */
  constructor(emitter: TreeBuilder, ss: ScalarScanner, options: YAMLTreeOptions = {}) {
    this.emitter = emitter;
    this.ss = ss;
    this.options = options;
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
  accept(target: unknown): Node {
    if (this.st.isKey(target)) {
      const oid = this.st.idFor(target);
      const node = this.st.nodeFor(target) as Mapping;
      const anchor = String(oid);
      node.anchor = anchor;
      return this.emitter.alias(anchor);
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
    if (target == null) return this.visitNilClass();
    if (typeof target === "number" && !Number.isSafeInteger(target)) return this.visitFloat(target);
    return this.visitInteger(target as number | boolean | bigint);
  }

  private visitFloat(o: number): Node {
    if (Number.isNaN(o)) {
      return this.emitter.scalar(".nan", null, null, true, false, Scalar.ANY);
    } else if (!Number.isFinite(o)) {
      return this.emitter.scalar(o > 0 ? ".inf" : "-.inf", null, null, true, false, Scalar.ANY);
    } else {
      return this.emitter.scalar(rbObjAsString(new Number(o)), null, null, true, false, Scalar.ANY);
    }
  }

  private visitNilClass(): Node {
    return this.emitter.scalar("", null, "tag:yaml.org,2002:null", true, false, Scalar.ANY);
  }

  private visitObject(o: object): Node {
    let tag = Psych.dumpTags.get(o.constructor);
    if (tag === undefined) {
      const klass =
        o.constructor === Object ? undefined : rbModName(o.constructor as new () => unknown);
      tag = ["!ruby/object", klass].filter((part) => part != null).join(":");
    }
    const map = this.emitter.startMapping(null, tag, false, Mapping.BLOCK);
    this.register(o, map);

    this.dumpIvars(o);
    return this.emitter.endMapping();
  }

  private visitStruct(o: StructInstance & object): Node {
    const tag = ["!ruby/struct", rbModName(o.constructor as new () => unknown)]
      .filter((part) => part != null)
      .join(":");

    this.register(o, this.emitter.startMapping(null, tag, false, Mapping.BLOCK));
    for (const member of o.members()) {
      this.emitter.scalar(member, null, null, true, false, Scalar.ANY);
      this.accept((o as unknown as Record<string, unknown>)[member]);
    }

    this.dumpIvars(o);

    return this.emitter.endMapping();
  }

  private visitPsychOmap(o: Omap): Node {
    const seq = this.emitter.startSequence(null, "tag:yaml.org,2002:omap", false, Sequence.BLOCK);
    this.register(o, seq);

    for (const [k, v] of o) this.visitHash(new Map([[k, v]]));
    return this.emitter.endSequence();
  }

  private visitClass(o: { name?: string }): Node {
    const name = rbModName(o as new () => unknown);
    if (!name) throw new TypeError(`can't dump anonymous class: ${String(o)}`);
    return this.register(
      o,
      this.emitter.scalar(name, null, "!ruby/class", false, false, Scalar.SINGLE_QUOTED),
    );
  }

  private visitString(o: string): Node {
    let plain = true;
    let quote = true;
    let style = Scalar.PLAIN;
    let tag: string | null = null;

    if (/\n(?!\n?$)/.test(o)) {
      style = Scalar.LITERAL;
    } else if (o === "<<") {
      style = Scalar.SINGLE_QUOTED;
      tag = "tag:yaml.org,2002:str";
      plain = false;
      quote = false;
    } else if (o === "y" || o === "n") {
      style = Scalar.DOUBLE_QUOTED;
    } else if (this.lineWidth != null && Array.from(o).length > this.lineWidth) {
      style = Scalar.FOLDED;
    } else if (
      /(?:^|(?<=\n))[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}][^"]*(?=\n|$)/u.test(o)
    ) {
      style = Scalar.DOUBLE_QUOTED;
    } else if (typeof this.ss.tokenize(o) !== "string" || /^0[0-7]*[89]/.test(o)) {
      style = Scalar.SINGLE_QUOTED;
    }

    return this.emitter.scalar(o, null, tag, plain, quote, style);
  }

  private visitSymbol(o: string): Node {
    return this.emitter.scalar(o, null, null, true, false, Scalar.ANY);
  }

  private visitRegexp(o: RegExp): Node {
    return this.register(
      o,
      this.emitter.scalar(String(o), null, "!ruby/regexp", false, false, Scalar.ANY),
    );
  }

  private visitDate(o: RubyDate): Node {
    return this.register(o, this.visitInteger(o.gregorian()));
  }

  private visitDateTime(o: DateTime): Node {
    const t = o.italy();
    const formatted = this.formatTime(t, t.offset.isZero());
    return this.register(
      o,
      this.emitter.scalar(formatted, null, "!ruby/object:DateTime", false, false, Scalar.ANY),
    );
  }

  private visitTime(o: RubyTime | ZonedDateTime | Instant): Node {
    return this.register(
      o,
      this.emitter.scalar(this.formatTime(o), null, null, true, false, Scalar.ANY),
    );
  }

  private visitInteger(o: { toS(): string } | PlainDate | number | boolean | bigint): Node {
    return this.emitter.scalar(
      typeof o !== "object"
        ? String(o)
        : temporalTag(o) === "Temporal.PlainDate"
          ? (o as PlainDate).toString()
          : (o as { toS(): string }).toS(),
      null,
      null,
      true,
      false,
      Scalar.ANY,
    );
  }

  private visitRange(o: Range): Node {
    this.register(o, this.emitter.startMapping(null, "!ruby/range", false, Mapping.BLOCK));
    for (const [k, v] of [
      ["begin", o.begin],
      ["end", o.end],
      ["excl", o.excludeEnd],
    ] as const) {
      this.accept(k);
      this.accept(v);
    }
    return this.emitter.endMapping();
  }

  private visitHash(o: Map<unknown, unknown> | object): Node {
    if (!(o instanceof Map) || o.constructor === Map || o.constructor === Hash) {
      this.register(o, this.emitter.startMapping(null, null, true, Mapping.BLOCK));
      for (const [k, v] of o instanceof Map ? o : Object.entries(o)) {
        this.accept(k);
        this.accept(v);
      }
      return this.emitter.endMapping();
    } else {
      return this.visitHashSubclass(o);
    }
  }

  private visitArray(o: unknown[]): Node {
    return this.visitEnumerator(o);
  }

  private visitEnumerator(o: unknown[]): Node {
    this.register(o, this.emitter.startSequence(null, null, true, Sequence.BLOCK));
    for (const c of o) this.accept(c);
    return this.emitter.endSequence();
  }

  private visitHashSubclass(o: Map<unknown, unknown>): Node {
    const ivars = rbObjInstanceVariables(o);
    if (ivars.length > 0) {
      const node = this.emitter.startMapping(
        null,
        `!ruby/hash-with-ivars:${rbModToS(o.constructor as new () => unknown)}`,
        false,
        Mapping.BLOCK,
      );
      this.register(o, node);

      this.accept("ivars");
      this.emitter.startMapping(null, null, true, Mapping.BLOCK);
      for (const ivar of rbObjInstanceVariables(o)) {
        this.accept(`:${ivar}`);
        this.accept(rbObjIvarGet(o, ivar));
      }
      this.emitter.endMapping();

      this.accept("elements");
      this.emitter.startMapping(null, null, true, Mapping.BLOCK);
      for (const [k, v] of o) {
        this.accept(k);
        this.accept(v);
      }
      this.emitter.endMapping();

      return this.emitter.endMapping();
    } else {
      const node = this.emitter.startMapping(
        null,
        `!ruby/hash:${rbModToS(o.constructor as new () => unknown)}`,
        false,
        Mapping.BLOCK,
      );
      this.register(o, node);
      for (const [k, v] of o) {
        this.accept(k);
        this.accept(v);
      }
      return this.emitter.endMapping();
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

  private register(target: unknown, yamlObj: Node): Node {
    this.st.register(target, yamlObj);
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
    switch (c[coderType]) {
      case ":scalar":
        return this.emitter.scalar(
          c[coderScalar] as string,
          null,
          c[coderTag],
          c[coderTag] === null,
          false,
          c[coderStyle],
        );
      case ":seq":
        this.emitter.startSequence(null, c[coderTag], c[coderTag] === null, c[coderStyle]);
        for (const thing of c[coderSeq]) this.accept(thing);
        return this.emitter.endSequence();
      case ":map":
        this.register(
          o,
          this.emitter.startMapping(null, c[coderTag], c[coderImplicit], c[coderStyle]),
        );
        for (const [k, v] of Object.entries(c)) {
          this.accept(k);
          this.accept(v);
        }
        return this.emitter.endMapping();
      case ":object":
        return this.accept(c[coderObject]);
    }
  }

  private dumpIvars(target: object): void {
    for (const iv of rbObjInstanceVariables(target)) {
      this.emitter.scalar(iv.replace(/^@/, ""), null, null, true, false, Scalar.ANY);
      this.accept(rbObjIvarGet(target, iv));
    }
  }

  /**
   * `YAMLTree#start` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:79-83`).
   *
   * @noRailsEquivalent PERMANENT
   */
  start(encoding: number = Stream.UTF8): Stream {
    const stream = this.emitter.startStream(encoding);
    this._started = true;
    return stream;
  }

  /**
   * `YAMLTree#finish` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:85-89`).
   *
   * @noRailsEquivalent PERMANENT
   */
  finish(): Stream {
    const stream = this.emitter.endStream();
    this._finished = true;
    return stream;
  }

  /**
   * `YAMLTree#tree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:97-100`).
   *
   * @noRailsEquivalent PERMANENT
   */
  get tree(): Stream {
    if (!this.isFinished()) this.finish();
    return this.emitter.root!;
  }

  /** @noRailsEquivalent PERMANENT */
  get started(): boolean {
    return this._started;
  }

  /** @noRailsEquivalent PERMANENT */
  get finished(): boolean {
    return this._finished;
  }

  /** @noRailsEquivalent PERMANENT */
  isStarted(): boolean {
    return this.started;
  }

  /** @noRailsEquivalent PERMANENT */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * `YAMLTree#push` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:102-119`).
   *
   * @noRailsEquivalent PERMANENT
   */
  push(object: unknown): void {
    if (!this.isStarted()) this.start();
    let version: number[] = [];
    if (this.options.header) version = [1, 1];

    if ("version" in this.options) {
      if (Array.isArray(this.options.version)) {
        version = this.options.version;
      } else if (typeof this.options.version === "string") {
        version = this.options.version.split(".").map((x) => parseInt(x, 10) || 0);
      } else {
        version = [1, 1];
      }
    }

    this.emitter.startDocument(version, [], false);
    this.accept(object);
    this.emitter.endDocument(!this.emitter.isStreaming());
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
  constructor(emitter: TreeBuilder, ss: ScalarScanner, options: YAMLTreeOptions = {}) {
    super(emitter, ss, options);
    this.permittedClasses = new Set(RestrictedYAMLTree.DEFAULT_PERMITTED_CLASSES);
    for (const klass of options.permittedClasses ?? []) {
      this.permittedClasses.add(klass);
    }
    this.aliases = options.aliases ?? false;
  }

  /** @noRailsEquivalent PERMANENT */
  override accept(target: unknown): Node {
    if (!this.aliases && this.st.isKey(target)) {
      throw new BadAlias("Tried to dump an aliased object");
    }

    const klass = rbObjClass(target);
    if (!this.permittedClasses.has(klass)) {
      throw new DisallowedClass("dump", rbModName(klass) ?? rbInspect(klass));
    }

    return super.accept(target);
  }
}
