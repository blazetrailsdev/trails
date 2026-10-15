import { Hash } from "../../hash.js";
import { Range } from "../../range.js";
import { rbGetAllocFunc } from "../../include.js";
import { rbObjIvarSet, rbObjRespondTo } from "../../object.js";
import type { Struct, StructInstance } from "../../struct.js";
import type { Alias, Node, Pair, ParsedNode, Scalar, YAMLMap, YAMLSeq } from "yaml";
import { Psych } from "../../psych.js";
import type * as Yaml from "yaml";
import { yaml as backend, type PsychNode } from "../../psych-adapter.js";
import { Coder } from "../coder.js";
import { Omap } from "../omap.js";
import { ClassLoader } from "../class-loader.js";
import { AliasesNotEnabled, AnchorNotDefined } from "../exception.js";
import { ScalarScanner } from "../scalar-scanner.js";

const yaml = backend as unknown as typeof Yaml;

type RubyClass = { prototype: object; allocate?: () => object };

function allocate(klass: RubyClass): object {
  return (
    klass.allocate?.() ??
    rbGetAllocFunc(klass)?.(klass as never) ??
    (Object.create(klass.prototype) as object)
  );
}

/**
 * `Psych::Visitors::ToRuby` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:14`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class ToRuby {
  /**
   * `ToRuby.create` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:15`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static create({ symbolizeNames = false, freeze = false, strictInteger = false } = {}): ToRuby {
    const classLoader = new ClassLoader();
    const scanner = new ScalarScanner(classLoader, { strictInteger });
    return new this(scanner, classLoader, { symbolizeNames, freeze });
  }

  /** @noRailsEquivalent PERMANENT */
  readonly classLoader: ClassLoader;
  private readonly st = new Map<string, unknown>();
  private readonly ss: ScalarScanner;
  private readonly symbolizeNames: boolean;
  private readonly freeze: boolean;
  private readonly loadTags: Record<string, string>;
  private readonly domainTypes: typeof Psych.domainTypes;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    ss: ScalarScanner,
    classLoader: ClassLoader,
    { symbolizeNames = false, freeze = false } = {},
  ) {
    this.ss = ss;
    this.loadTags = Psych.loadTags;
    this.domainTypes = Psych.domainTypes;
    this.classLoader = classLoader;
    this.symbolizeNames = symbolizeNames;
    this.freeze = freeze;
  }

  /**
   * `ToRuby#accept` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:35-50`).
   *
   * @noRailsEquivalent PERMANENT
   */
  accept(target: PsychNode | null): unknown {
    if (target === null) return null;
    let result = this.visit(target as ParsedNode);

    if (!(Object.keys(this.domainTypes).length === 0 || !target.tag)) {
      let key = target.tag.replace(/^[!/]*/, "").replace(/(,\d+)\//, "$1:");
      if (!/^(?:tag:|x-private)/.test(key)) key = `tag:${key}`;

      if (Object.hasOwn(this.domainTypes, key)) {
        const [value, block] = this.domainTypes[key];
        result = block(value, result);
      }
    }

    if (this.freeze) result = Object.freeze(result);
    return result;
  }

  private visit(o: ParsedNode): unknown {
    if (yaml.isAlias(o)) return this.visitPsychNodesAlias(o);
    if (yaml.isMap(o)) return this.visitMapping(o);
    if (yaml.isSeq(o)) return this.visitPsychNodesSequence(o);
    return this.register(o, this.deserialize(o));
  }

  private visitPsychNodesSequence(o: YAMLSeq.Parsed): unknown {
    const klass = this.resolveClass(this.loadTags[o.tag ?? ""]);
    if (klass) {
      const instance = allocate(klass);

      if (rbObjRespondTo(instance, "initWith")) {
        const coder = new Coder(o.tag!);
        coder.setSeq(o.items.map((c) => this.accept(c)));
        (instance as { initWith(coder: Coder): void }).initWith(coder);
      }

      return instance;
    }

    let match: RegExpExecArray | null;
    if (!o.tag) {
      return this.register(o, this.registerEmpty(o));
    } else if (o.tag === "!omap" || o.tag === "tag:yaml.org,2002:omap") {
      const map = this.register(o, new Omap());
      for (const a of o.items as (YAMLMap.Parsed | Pair<ParsedNode, ParsedNode>)[]) {
        const { key, value } = (yaml.isPair(a) ? a : a.items[0]) as {
          key: ParsedNode;
          value: ParsedNode;
        };
        map.set(this.accept(key), this.accept(value));
      }
      return map;
    } else if ((match = /^!(?:seq|ruby\/array):(.*)$/.exec(o.tag))) {
      const klass = this.resolveClass(match[1]);
      const list = this.register(o, allocate(klass) as unknown[]);
      for (const c of o.items) list.push(this.accept(c));
      return list;
    } else {
      return this.register(o, this.registerEmpty(o));
    }
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Alias` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:327`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesAlias(o: PsychNode): unknown {
    const { source } = o as Alias;
    if (!this.st.has(source)) throw new AnchorNotDefined(source);
    return this.st.get(source);
  }

  private deserialize(o: Scalar.Parsed): unknown {
    const klass = this.resolveClass(this.loadTags[o.tag ?? ""]);
    if (klass) {
      const instance = allocate(klass);

      if (rbObjRespondTo(instance, "initWith")) {
        const coder = new Coder(o.tag!);
        coder.setScalar(o.source);
        (instance as { initWith(coder: Coder): void }).initWith(coder);
      }

      return instance;
    }

    if (!o.tag && o.type !== yaml.Scalar.PLAIN) return o.value;
    if (!o.tag) return this.ss.tokenize(o.source);

    const value = String(o.value);
    switch (o.tag) {
      case "!ruby/object:DateTime":
        return (this.classLoader.dateTime() as { parse(s: string): unknown }).parse(value);
      case "!ruby/class":
      case "!ruby/module":
        return this.resolveClass(value);
      case "!ruby/regexp": {
        const klass = this.classLoader.regexp() as typeof RegExp;
        const [, source, options] = /^\/(.*)\/([mixn]*)$/s.exec(value)!;
        return new klass(source, options.replace("x", "").replace("n", "").replace("m", "s"));
      }
      case "!ruby/range": {
        const klass = this.classLoader.range() as typeof Range;
        const [begin, dots, end] = value.split(/([.]{2,3})/, 3);
        const endpoint = (text: string): unknown => this.accept(yaml.parseDocument(text).contents);
        return new klass(endpoint(begin), endpoint(end), dots === "...");
      }
      default:
        if (/^!(?:str|ruby\/string)(?::(.*))?$/.test(o.tag) || o.tag === "tag:yaml.org,2002:str")
          return value;
        if (/^!ruby\/sym(bol)?:?(.*)?$/.test(o.tag)) return this.classLoader.symbolize(value);
        return this.ss.tokenize(o.source);
    }
  }

  private visitMapping(o: YAMLMap): unknown {
    if (o.tag && this.loadTags[o.tag])
      return this.revive(this.resolveClass(this.loadTags[o.tag]), o);
    if (!o.tag)
      return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);

    let match: RegExpExecArray | null;
    if ((match = /^!ruby\/struct:?(.*)?$/.exec(o.tag))) {
      const klass = this.resolveClass(match[1]);

      if (klass) {
        const s = this.register(o, allocate(klass)) as StructInstance & Record<string, unknown>;

        const members: Record<string, unknown> = {};
        const structMembers = s.members().map((x) => this.classLoader.symbolize(x));
        for (const { key: k, value: v } of o.items as { key: ParsedNode; value: ParsedNode }[]) {
          const member = this.accept(k) as string;
          const value = this.accept(v);
          if (structMembers.includes(this.classLoader.symbolize(member))) {
            s[member] = value;
          } else {
            members[String(member).replace(/^@/, "")] = value;
          }
        }
        return this.initWith(s, members, o);
      } else {
        const klass = this.classLoader.struct() as typeof Struct;
        const h = this.reviveHash(Object.create(null) as Record<string, unknown>, o);
        const s = new (klass.new(
          ...Object.keys(h).map((k) => this.classLoader.symbolize(k).slice(1)),
        ))(...Object.values(h));
        this.register(o, s);
        return s;
      }
    }
    if ((match = /^!ruby\/object:?(.*)?$/.exec(o.tag))) {
      const name = match[1] || "Object";
      if (name === "Hash")
        return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);
      return this.revive(this.resolveClass(name) ?? this.classLoader.object(), o);
    }
    if (o.tag === "!ruby/range") {
      const klass = this.classLoader.range() as typeof Range;
      const h = this.reviveHash(Object.create(null) as Record<string, unknown>, o);
      return this.register(o, new klass(h["begin"], h["end"], h["excl"] === true));
    }
    if ((match = /^!map:(.*)$/.exec(o.tag) ?? /^!ruby\/hash:(.*)$/.exec(o.tag))) {
      return this.reviveHash(
        this.register(o, allocate(this.resolveClass(match[1])) as Record<string, unknown>),
        o,
      );
    }
    if (o.tag === "!omap" || o.tag === "tag:yaml.org,2002:omap") {
      const map = this.register(o, new (this.classLoader.psychOmap() as typeof Omap)());
      for (const { key: l, value: r } of o.items as { key: ParsedNode; value: ParsedNode }[]) {
        map.set(this.accept(l), this.accept(r));
      }
      return map;
    }
    return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);
  }

  private register<T>(node: Node, object: T): T {
    if (node.anchor) this.st.set(node.anchor, object);
    return object;
  }

  private registerEmpty(o: YAMLSeq): unknown[] {
    const list = this.register(o, [] as unknown[]);
    for (const c of o.items) list.push(this.accept(c as ParsedNode));
    return list;
  }

  private reviveHash(
    h: Record<string, unknown>,
    o: YAMLMap,
    tagged = false,
  ): Record<string, unknown> {
    const items = o.items as { key: ParsedNode; value: ParsedNode }[];
    const keys = items.map(({ key: k }) => (yaml.isScalar(k) ? this.accept(k) : k));
    let hash = h;
    const widen = () => {
      const upgraded = new Hash<unknown, unknown>();
      for (const [k, v] of Object.entries(hash)) upgraded.set(k, v);
      hash = this.register(o, upgraded as unknown as Record<string, unknown>);
    };
    const widenable = () => !tagged && Object.getPrototypeOf(hash) === null;
    if (widenable() && keys.some((key) => typeof key !== "string")) widen();
    const aset = (key: unknown, val: unknown) => {
      if (typeof key !== "string" && widenable()) widen();
      if (hash instanceof Map) hash.set(key, val);
      else hash[String(key)] = val;
    };
    const mergeBang = (val: object) => {
      for (const [k, v] of val instanceof Map ? val : Object.entries(val)) aset(k, v);
    };
    for (const [i, { key: k, value: v }] of items.entries()) {
      const key = yaml.isScalar(k) ? keys[i] : this.accept(k);
      const val = this.accept(v);
      if (key === "<<" && k.tag !== "tag:yaml.org,2002:str") {
        if ((yaml.isAlias(v) || yaml.isMap(v)) && typeof val === "object") mergeBang(val as object);
        else if (yaml.isSeq(v)) (val as object[]).slice().reverse().forEach(mergeBang);
        else aset(key, val);
      } else {
        aset(!tagged && this.symbolizeNames && typeof key === "string" ? `:${key}` : key, val);
      }
    }
    return hash;
  }

  private revive(klass: RubyClass, node: YAMLMap): object {
    const s = this.register(node, allocate(klass));
    return this.initWith(
      s,
      this.reviveHash(Object.create(null) as Record<string, never>, node, true),
      node,
    );
  }

  private initWith(o: object, h: Record<string, unknown>, node: Node): object {
    const c = Object.defineProperties(
      new Coder(node.tag ?? null),
      Object.getOwnPropertyDescriptors(h),
    );
    if (rbObjRespondTo(o, "initWith")) (o as { initWith(coder: Coder): void }).initWith(c);
    else for (const [k, v] of Object.entries(h)) rbObjIvarSet(o, `@${k}`, v);
    return o;
  }

  private resolveClass(klassname: string | undefined): RubyClass {
    return this.classLoader.load(klassname) as RubyClass;
  }
}

/**
 * `Psych::Visitors::NoAliasRuby` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:430`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class NoAliasRuby extends ToRuby {
  /** @noRailsEquivalent PERMANENT */
  override visitPsychNodesAlias(_o: PsychNode): unknown {
    throw new AliasesNotEnabled();
  }
}
