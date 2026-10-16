import { Hash } from "../../hash.js";
import { Range } from "../../range.js";
import { rbGetAllocFunc } from "../../include.js";
import { rbObjIvarSet, rbObjRespondTo } from "../../object.js";
import type { Struct, StructInstance } from "../../struct.js";
import { Psych } from "../../psych.js";
import { registerConstant } from "../../variable.js";
import { Alias } from "../nodes/alias.js";
import type { Document } from "../nodes/document.js";
import { Mapping } from "../nodes/mapping.js";
import type { Node } from "../nodes/node.js";
import { Scalar } from "../nodes/scalar.js";
import { Sequence } from "../nodes/sequence.js";
import type { Stream } from "../nodes/stream.js";
import { Visitor } from "./visitor.js";
import { Coder } from "../coder.js";
import { Omap } from "../omap.js";
import { ClassLoader } from "../class-loader.js";
import { AliasesNotEnabled, AnchorNotDefined } from "../exception.js";
import { ScalarScanner } from "../scalar-scanner.js";

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
export class ToRuby extends Visitor {
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
    super();
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
  override accept(target: Node | null): unknown {
    if (target === null) return null;
    let result = super.accept(target);

    if (!(Object.keys(this.domainTypes).length === 0 || !target.tag)) {
      let key = target.tag.replace(/^[!/]*/, "").replace(/(,\d+)\//, "$1:");
      if (!/^(?:tag:|x-private)/.test(key)) key = `tag:${key}`;

      if (Object.hasOwn(this.domainTypes, key)) {
        const [value, block] = this.domainTypes[key];
        result = block(value, result);
      }
    }

    if (this.freeze) result = result instanceof Hash ? result.freeze() : Object.freeze(result);
    return result;
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:139-141`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesScalar(o: Scalar): unknown {
    return this.register(o, this.deserialize(o));
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Sequence` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:143-176`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesSequence(o: Sequence): unknown {
    const klass = this.resolveClass(this.loadTags[o.tag ?? ""]);
    if (klass) {
      const instance = allocate(klass);

      if (rbObjRespondTo(instance, "initWith")) {
        const coder = new Coder(o.tag);
        coder.setSeq(o.children.map((c) => this.accept(c)));
        (instance as { initWith(coder: Coder): void }).initWith(coder);
      }

      return instance;
    }

    let match: RegExpExecArray | null;
    if (!o.tag) {
      return this.register(o, this.registerEmpty(o));
    } else if (o.tag === "!omap" || o.tag === "tag:yaml.org,2002:omap") {
      const map = this.register(o, new Omap());
      for (const a of o.children) {
        map.set(this.accept(a.children[0]), this.accept(a.children.at(-1)!));
      }
      return map;
    } else if ((match = /^!(?:seq|ruby\/array):(.*)$/.exec(o.tag))) {
      const klass = this.resolveClass(match[1]);
      const list = this.register(o, allocate(klass) as unknown[]);
      for (const c of o.children) list.push(this.accept(c));
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
  visitPsychNodesAlias(o: Alias): unknown {
    if (!this.st.has(o.anchor)) throw new AnchorNotDefined(o.anchor);
    return this.st.get(o.anchor);
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Document` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:319-321`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesDocument(o: Document): unknown {
    return this.accept(o.root ?? null);
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Stream` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:323-325`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesStream(o: Stream): unknown {
    return o.children.map((c) => this.accept(c));
  }

  private deserialize(o: Scalar): unknown {
    const klass = this.resolveClass(this.loadTags[o.tag ?? ""]);
    if (klass) {
      const instance = allocate(klass);

      if (rbObjRespondTo(instance, "initWith")) {
        const coder = new Coder(o.tag);
        coder.setScalar(o.value);
        (instance as { initWith(coder: Coder): void }).initWith(coder);
      }

      return instance;
    }

    if (o.quoted) return o.value;
    if (!o.tag) return this.ss.tokenize(o.value);

    switch (o.tag) {
      case "!ruby/object:DateTime":
        return (this.classLoader.dateTime() as { parse(s: string): unknown }).parse(o.value);
      case "!ruby/class":
      case "!ruby/module":
        return this.resolveClass(o.value);
      case "!ruby/regexp": {
        const klass = this.classLoader.regexp() as typeof RegExp;
        const [, source, options] = /^\/(.*)\/([mixn]*)$/s.exec(o.value)!;
        return new klass(source, options.replace("x", "").replace("n", "").replace("m", "s"));
      }
      case "!ruby/range": {
        const klass = this.classLoader.range() as typeof Range;
        const args = o.value.split(/([.]{2,3})/, 3).map((s) => this.accept(new Scalar(s)));
        args.push(args.splice(1, 1)[0] === "...");
        return new klass(...(args as [unknown, unknown, boolean]));
      }
      default:
        if (/^!(?:str|ruby\/string)(?::(.*))?$/.test(o.tag) || o.tag === "tag:yaml.org,2002:str")
          return o.value;
        if (/^!ruby\/sym(bol)?:?(.*)?$/.test(o.tag)) return this.classLoader.symbolize(o.value);
        return this.ss.tokenize(o.value);
    }
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Mapping` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:178-317`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesMapping(o: Mapping): unknown {
    if (o.tag && this.loadTags[o.tag])
      return this.revive(this.resolveClass(this.loadTags[o.tag]), o);
    if (!o.tag) return this.reviveHash(this.register(o, new Hash<unknown, unknown>()), o);

    let match: RegExpExecArray | null;
    if ((match = /^!ruby\/struct:?(.*)?$/.exec(o.tag))) {
      const klass = this.resolveClass(match[1]);

      if (klass) {
        const s = this.register(o, allocate(klass)) as StructInstance & Record<string, unknown>;

        const members: Record<string, unknown> = {};
        const structMembers = s.members().map((x) => this.classLoader.symbolize(x));
        for (let i = 0; i < o.children.length; i += 2) {
          const [k, v] = [o.children[i], o.children[i + 1]];
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
        return this.reviveHash(this.register(o, new Hash<unknown, unknown>()), o);
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
      for (let i = 0; i < o.children.length; i += 2) {
        const [l, r] = [o.children[i], o.children[i + 1]];
        map.set(this.accept(l), this.accept(r));
      }
      return map;
    }
    return this.reviveHash(this.register(o, new Hash<unknown, unknown>()), o);
  }

  private register<T>(node: Node & { anchor?: string | null }, object: T): T {
    if (node.anchor) this.st.set(node.anchor, object);
    return object;
  }

  private registerEmpty(o: Sequence): unknown[] {
    const list = this.register(o, [] as unknown[]);
    for (const c of o.children) list.push(this.accept(c));
    return list;
  }

  private reviveHash<H extends Map<unknown, unknown> | Record<string, unknown>>(
    hash: H,
    o: Mapping,
    tagged = false,
  ): H {
    const aset = (key: unknown, val: unknown) => {
      if (hash instanceof Map) hash.set(key, val);
      else hash[String(key)] = val;
    };
    for (let i = 0; i < o.children.length; i += 2) {
      const [k, v] = [o.children[i], o.children[i + 1]];
      const key = this.accept(k);
      const val = this.accept(v);
      if (key === "<<" && k.tag !== "tag:yaml.org,2002:str") {
        if (v instanceof Alias || v instanceof Mapping) {
          if (val instanceof Map) for (const [mk, mv] of val) aset(mk, mv);
          else aset(key, val);
        } else if (v instanceof Sequence) {
          const values = val as unknown[];
          if (values.every((value) => value instanceof Map)) {
            const h = new Hash<unknown, unknown>();
            for (const value of values.slice().reverse()) {
              for (const [mk, mv] of value as Map<unknown, unknown>) h.set(mk, mv);
            }
            for (const [mk, mv] of h) aset(mk, mv);
          } else {
            aset(key, val);
          }
        } else {
          aset(key, val);
        }
      } else {
        aset(!tagged && this.symbolizeNames && typeof key === "string" ? `:${key}` : key, val);
      }
    }
    return hash;
  }

  private revive(klass: RubyClass, node: Mapping): object {
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
  override visitPsychNodesAlias(_o: Alias): unknown {
    throw new AliasesNotEnabled();
  }
}

registerConstant("Psych::Visitors::ToRuby", ToRuby);
