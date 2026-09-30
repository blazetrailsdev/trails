import {
  ArgumentError,
  Hash,
  LoadError,
  Range,
  TypeError,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime, Temporal, Time } from "@blazetrails/date";
import { camelize, constantize, registeredConstantName, underscore } from "./inflector.js";
export type { CollectionTag, YAMLMap } from "yaml";

const yaml = await import("yaml").catch(() => {
  const missing = (): never => {
    throw new LoadError("cannot load such file -- yaml");
  };
  return { parse: missing, stringify: missing } as unknown as typeof import("yaml");
});

import type { Document, Node, Scalar, YAMLMap, YAMLSeq } from "yaml";

export const parse: typeof import("yaml").parse = yaml.parse;
export const stringify: typeof import("yaml").stringify = yaml.stringify;

export class DisallowedClass extends globalThis.Error {
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}

export const loadTags: Record<string, string> = Object.create(null) as Record<string, string>;
export const dumpTags = new Map<object, string>();

const coderTag: unique symbol = Symbol("tag");

export class Coder {
  declare [coderTag]: string | null;
  [key: string]: unknown;

  constructor(tag: string | null) {
    Object.defineProperty(this, coderTag, { value: tag });
  }
}

function className(klass: { name?: string }): string | undefined {
  return registeredConstantName(klass) ?? klass.name;
}

const TIME =
  /^-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|\s+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:\s*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?$/;
const DATE = /^\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)$/;

function tokenize(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    if (TIME.test(value)) return Time.parse(value);
    if (DATE.test(value)) return RubyDate.strptime(value, "%F", RubyDate.GREGORIAN);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
  }
  return value;
}

class YAMLTree {
  private readonly st = new Map<object, Node>();
  private readonly doc = new yaml.Document();
  private anchors = 0;

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
    if (target instanceof DateTime) return this.visitDateTime(target);
    if (target instanceof RubyDate) return this.visitDate(target);
    if (
      target instanceof Time ||
      target instanceof Temporal.ZonedDateTime ||
      target instanceof Temporal.Instant
    ) {
      return this.visitTime(target);
    }
    if (target instanceof Temporal.PlainDate)
      return this.register(target, this.visitInteger(target));
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
    let tag = dumpTags.get(o.constructor);
    if (tag === undefined) {
      const klass = o.constructor === Object ? undefined : className(o.constructor);
      tag = ["!ruby/object", klass].filter((part) => part !== undefined).join(":");
    }
    const map = new yaml.YAMLMap();
    map.tag = tag;
    this.register(o, map);
    this.dumpIvars(o, map);
    return map;
  }

  private visitClass(o: { name?: string }): Node {
    const name = className(o);
    if (!name) throw new TypeError(`can't dump anonymous class: ${String(o)}`);
    const scalar = new yaml.Scalar(name);
    scalar.tag = "!ruby/class";
    scalar.type = yaml.Scalar.QUOTE_SINGLE;
    return this.register(o, scalar);
  }

  private visitString(o: string): Node {
    const scalar = this.doc.createNode(o) as Scalar;
    if (typeof tokenize(o) !== "string") scalar.type = yaml.Scalar.QUOTE_SINGLE;
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

  private visitTime(o: Time | Temporal.ZonedDateTime | Temporal.Instant): Node {
    return this.register(o, new yaml.Scalar(this.formatTime(o)));
  }

  private visitInteger(o: { toS(): string } | Temporal.PlainDate): Node {
    return new yaml.Scalar(o instanceof Temporal.PlainDate ? o.toString() : o.toS());
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
    const ivars = Object.entries(o);
    if (ivars.length > 0) {
      const node = new yaml.YAMLMap();
      node.tag = `!ruby/hash-with-ivars:${className(o.constructor)}`;
      this.register(o, node);

      const ivarsKey = this.accept("ivars");
      const ivarsMap = new yaml.YAMLMap();
      for (const [ivar, value] of ivars) {
        ivarsMap.add(
          new yaml.Pair(this.accept(`:@${underscore(ivar.replace(/^_/, ""))}`), this.accept(value)),
        );
      }
      node.add(new yaml.Pair(ivarsKey, ivarsMap));

      const elementsKey = this.accept("elements");
      const elements = new yaml.YAMLMap();
      for (const [k, v] of o) elements.add(new yaml.Pair(this.accept(k), this.accept(v)));
      node.add(new yaml.Pair(elementsKey, elements));

      return node;
    } else {
      const node = new yaml.YAMLMap();
      node.tag = `!ruby/hash:${className(o.constructor)}`;
      this.register(o, node);
      for (const [k, v] of o) node.add(new yaml.Pair(this.accept(k), this.accept(v)));
      return node;
    }
  }

  private formatTime(
    time: Time | DateTime | Temporal.ZonedDateTime | Temporal.Instant,
    utc = time instanceof Time
      ? time.isUtc()
      : !(time instanceof Temporal.ZonedDateTime) || time.timeZoneId === "UTC",
  ): string {
    if (time instanceof Temporal.Instant) time = time.toZonedDateTimeISO("UTC");
    if (time instanceof Temporal.ZonedDateTime) {
      const clock = time.toPlainTime().toString({ fractionalSecondDigits: 9 });
      return `${time.toPlainDate().toString()} ${clock} ${utc ? "Z" : time.offset}`;
    }
    return utc
      ? time.strftime("%Y-%m-%d %H:%M:%S.%9N Z")
      : time.strftime("%Y-%m-%d %H:%M:%S.%9N %:z");
  }

  private register(target: object, yamlObj: Node): Node {
    this.st.set(target, yamlObj);
    return yamlObj;
  }

  private dumpCoder(o: { encodeWith(coder: Coder): void }): Node {
    let tag = dumpTags.get(o.constructor);
    if (tag === undefined) {
      const klass = o.constructor === Object ? undefined : className(o.constructor);
      tag = ["!ruby/object", klass].filter((part) => part !== undefined).join(":");
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
    for (const [iv, value] of Object.entries(target)) {
      map.add(
        new yaml.Pair(this.doc.createNode(underscore(iv.replace(/^_/, ""))), this.accept(value)),
      );
    }
  }

  get tree(): Document {
    return this.doc;
  }

  push(object: unknown): void {
    this.doc.contents = this.accept(object) as typeof this.doc.contents;
  }
}

type RubyClass = { prototype: object; allocate?: () => object };

function allocate(klass: RubyClass): object {
  return klass.allocate?.() ?? (Object.create(klass.prototype) as object);
}

const CACHE: Record<string, unknown> = {
  Date: RubyDate,
  DateTime,
  Exception: globalThis.Error,
  Object,
  Range,
  Regexp: RegExp,
};

class ToRuby {
  private readonly st = new Map<string, unknown>();

  accept(o: Node | null): unknown {
    if (o === null) return null;
    if (yaml.isAlias(o)) return this.st.get(o.source);
    if (yaml.isMap(o)) return this.visitMapping(o);
    if (yaml.isSeq(o)) return this.register(o, this.registerEmpty(o));
    return this.register(o, this.deserialize(o));
  }

  private deserialize(o: Scalar): unknown {
    if (!o.tag) {
      const quoted = o.type === yaml.Scalar.QUOTE_SINGLE || o.type === yaml.Scalar.QUOTE_DOUBLE;
      return quoted ? o.value : tokenize(o.value);
    }

    const value = String(o.value);
    switch (o.tag) {
      case "!ruby/object:DateTime":
        return DateTime.parse(value);
      case "!ruby/class":
      case "!ruby/module":
        return this.resolveClass(value);
      case "!ruby/regexp": {
        const [, source, options] = /^\/(.*)\/([mixn]*)$/s.exec(value)!;
        return new RegExp(source, options.replace("x", "").replace("n", "").replace("m", "s"));
      }
      case "!ruby/range": {
        const [begin, dots, end] = value.split(/([.]{2,3})/, 3);
        const endpoint = (text: string): unknown =>
          this.accept(yaml.parseDocument(text).contents as Node | null);
        return new Range(endpoint(begin), endpoint(end), dots === "...");
      }
      default:
        if (/^!ruby\/sym(bol)?:?(.*)?$/.test(o.tag)) return `:${value}`;
        return tokenize(o.value);
    }
  }

  private visitMapping(o: YAMLMap): unknown {
    if (o.tag && loadTags[o.tag]) return this.revive(this.resolveClass(loadTags[o.tag]), o);
    if (!o.tag)
      return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);

    let match: RegExpExecArray | null;
    if ((match = /^!ruby\/object:?(.*)?$/.exec(o.tag))) {
      const name = match[1] || "Object";
      if (name === "Hash")
        return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);
      return this.revive(this.resolveClass(name), o);
    }
    if (o.tag === "!ruby/range") {
      const h = this.reviveHash(Object.create(null) as Record<string, unknown>, o);
      return this.register(o, new Range(h["begin"], h["end"], h["excl"] === true));
    }
    if ((match = /^!map:(.*)$/.exec(o.tag) ?? /^!ruby\/hash:(.*)$/.exec(o.tag))) {
      return this.reviveHash(
        this.register(o, allocate(this.resolveClass(match[1])) as Record<string, unknown>),
        o,
      );
    }
    return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);
  }

  private register<T>(node: Node, object: T): T {
    if (node.anchor) this.st.set(node.anchor, object);
    return object;
  }

  private registerEmpty(o: YAMLSeq): unknown[] {
    const list = this.register(o, [] as unknown[]);
    for (const c of o.items) list.push(this.accept(c as Node));
    return list;
  }

  private reviveHash(hash: Record<string, unknown>, o: YAMLMap): Record<string, unknown> {
    for (const { key: k, value: v } of o.items as { key: Node; value: Node }[]) {
      const key = String(this.accept(k));
      const val = this.accept(v);
      if (key === "<<" && k.tag !== "tag:yaml.org,2002:str") {
        if ((yaml.isAlias(v) || yaml.isMap(v)) && typeof val === "object") Object.assign(hash, val);
        else if (yaml.isSeq(v)) Object.assign(hash, ...(val as object[]).slice().reverse());
        else hash[key] = val;
      } else hash[key] = val;
    }
    return hash;
  }

  private revive(klass: RubyClass, node: YAMLMap): object {
    const s = this.register(node, allocate(klass));
    return this.initWith(
      s,
      this.reviveHash(Object.create(null) as Record<string, never>, node),
      node,
    );
  }

  private initWith(o: object, h: Record<string, unknown>, node: Node): object {
    const c = Object.defineProperties(
      new Coder(node.tag ?? null),
      Object.getOwnPropertyDescriptors(h),
    );
    if (rbObjRespondTo(o, "initWith")) (o as { initWith(coder: Coder): void }).initWith(c);
    else {
      for (const [k, v] of Object.entries(h)) {
        const name = camelize(k, false);
        const ivar = name in o ? `_${name}` : name;
        Object.defineProperty(o, ivar, {
          value: v,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
    return o;
  }

  private resolveClass(klassname: string): RubyClass {
    return (CACHE[klassname] ?? constantize(klassname)) as RubyClass;
  }
}

export function dump(o: unknown): string {
  const visitor = new YAMLTree();
  visitor.push(o);
  return visitor.tree.toString({ directives: true });
}

/**
 * `Object#to_yaml` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/core_ext.rb:13-15`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function toYaml(self: unknown): string {
  return dump(self);
}

export function unsafeLoad(yamlString: string): unknown {
  const doc = yaml.parseDocument(yamlString);
  return new ToRuby().accept(doc.contents as Node | null);
}
