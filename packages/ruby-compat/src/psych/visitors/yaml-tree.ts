import { Hash } from "../../hash.js";
import {
  rbCDate,
  rbCTime,
  rbModName,
  rbModToS,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjRespondTo,
} from "../../object.js";
import { Range } from "../../range.js";
import { temporalTag } from "../../temporal-tag.js";
import { TypeError } from "../../type-error.js";
import { registeredConstant } from "../../variable.js";
import type { Document, Node, Scalar, YAMLMap } from "yaml";
import { Psych } from "../../psych.js";
import { yaml } from "../../psych-adapter.js";
import { Coder, coderTag } from "../coder.js";
import { ClassLoader } from "../class-loader.js";
import { ScalarScanner } from "../scalar-scanner.js";

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

/**
 * `Psych::Visitors::YAMLTree` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:15`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class YAMLTree {
  private readonly st = new Map<object, Node>();
  private readonly doc = new yaml.Document();
  private anchors = 0;
  private readonly ss: ScalarScanner;

  /**
   * `YAMLTree.create` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/yaml_tree.rb:48`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static create(): YAMLTree {
    const classLoader = new ClassLoader();
    const ss = new ScalarScanner(classLoader);
    return new YAMLTree(ss);
  }

  /** @noRailsEquivalent PERMANENT */
  constructor(ss: ScalarScanner) {
    this.ss = ss;
  }

  /** @noRailsEquivalent PERMANENT */
  accept(target: unknown): Node {
    if (target !== null && typeof target === "object" && this.st.has(target)) {
      const node = this.st.get(target)!;
      node.anchor ??= String(++this.anchors);
      return new yaml.Alias(node.anchor) as unknown as Node;
    }

    if (rbObjRespondTo(target, "encodeWith")) {
      return this.dumpCoder(target as { encodeWith(coder: Coder): void });
    }
    if (typeof target === "string") return this.visitString(target);
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
    if (target instanceof Map) return this.visitHash(target);
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

  private visitClass(o: { name?: string }): Node {
    const name = rbModName(o as new () => unknown);
    if (!name) throw new TypeError(`can't dump anonymous class: ${String(o)}`);
    const scalar = new yaml.Scalar(name);
    scalar.tag = "!ruby/class";
    scalar.type = yaml.Scalar.QUOTE_SINGLE;
    return this.register(o, scalar);
  }

  private visitString(o: string): Node {
    const scalar = this.doc.createNode(o) as Scalar;
    if (typeof this.ss.tokenize(o) !== "string") scalar.type = yaml.Scalar.QUOTE_SINGLE;
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

  /** @noRailsEquivalent PERMANENT */
  get tree(): Document {
    return this.doc;
  }

  /** @noRailsEquivalent PERMANENT */
  push(object: unknown): void {
    this.doc.contents = this.accept(object) as typeof this.doc.contents;
  }
}
