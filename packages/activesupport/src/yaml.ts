import { LoadError, TypeError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { constantize, registeredConstantName } from "./inflector.js";
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

const coderTag: unique symbol = Symbol("tag");

export class Coder {
  declare [coderTag]: string | null;
  [key: string]: unknown;

  constructor(tag: string | null) {
    Object.defineProperty(this, coderTag, { value: tag });
  }
}

const rubyNamespace: unique symbol = Symbol.for("@blazetrails:rubyNamespace");

function className(klass: { name?: string; [rubyNamespace]?: string }): string | undefined {
  const registered = registeredConstantName(klass);
  if (registered !== undefined) return registered;
  const nesting = klass[rubyNamespace];
  return typeof nesting === "string" ? `${nesting}::${klass.name}` : klass.name;
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
    if (typeof target === "function") return this.visitClass(target);
    if (Array.isArray(target)) return this.visitArray(target);
    if (target instanceof Map) return this.visitHash(target);
    if (target !== null && typeof target === "object") {
      return [Object.prototype, null].includes(Object.getPrototypeOf(target) as object | null)
        ? this.visitHash(new Map(Object.entries(target)))
        : this.visitObject(target);
    }
    return this.doc.createNode(target ?? null);
  }

  private visitObject(o: object): Node {
    const klass = o.constructor === Object ? undefined : className(o.constructor);
    const tag = ["!ruby/object", klass].filter((part) => part !== undefined).join(":");
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

  private visitHash(o: Map<unknown, unknown>): Node {
    const map = new yaml.YAMLMap();
    this.register(o, map);
    for (const [k, v] of o) map.add(new yaml.Pair(this.accept(k), this.accept(v)));
    return map;
  }

  private visitArray(o: unknown[]): Node {
    const seq = new yaml.YAMLSeq();
    this.register(o, seq);
    for (const thing of o) seq.items.push(this.accept(thing));
    return seq;
  }

  private register(target: object, yamlObj: Node): Node {
    this.st.set(target, yamlObj);
    return yamlObj;
  }

  private dumpCoder(o: { encodeWith(coder: Coder): void }): Node {
    const klass = o.constructor === Object ? undefined : className(o.constructor);
    const tag = ["!ruby/object", klass].filter((part) => part !== undefined).join(":");
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
    for (const [iv, value] of Object.entries(target))
      map.add(new yaml.Pair(this.doc.createNode(iv), this.accept(value)));
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
    if (o.tag === "!ruby/class" || o.tag === "!ruby/module") {
      return this.resolveClass(String(o.value));
    }
    return o.value;
  }

  private visitMapping(o: YAMLMap): unknown {
    if (o.tag?.startsWith("!ruby/object:")) {
      const klass = this.resolveClass(o.tag.slice("!ruby/object:".length));
      return this.revive(klass, o);
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
    else Object.defineProperties(o, Object.getOwnPropertyDescriptors(h));
    return o;
  }

  private resolveClass(klassname: string): RubyClass {
    return constantize(klassname) as RubyClass;
  }
}

export function dump(o: unknown): string {
  const visitor = new YAMLTree();
  visitor.push(o);
  return visitor.tree.toString({ directives: true });
}

export function unsafeLoad(yamlString: string): unknown {
  const doc = yaml.parseDocument(yamlString);
  return new ToRuby().accept(doc.contents as Node | null);
}
