import { Range } from "../../range.js";
import { rbObjIvarSet, rbObjRespondTo } from "../../object.js";
import type { Alias, Node, Scalar, YAMLMap, YAMLSeq } from "yaml";
import { Psych } from "../../psych.js";
import { yaml } from "../../psych-adapter.js";
import { Coder } from "../coder.js";
import { ClassLoader } from "../class-loader.js";
import { AliasesNotEnabled, AnchorNotDefined } from "../exception.js";
import { ScalarScanner } from "../scalar-scanner.js";

type RubyClass = { prototype: object; allocate?: () => object };

function allocate(klass: RubyClass): object {
  return klass.allocate?.() ?? (Object.create(klass.prototype) as object);
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

  /** @noRailsEquivalent PERMANENT */
  constructor(
    ss: ScalarScanner,
    classLoader: ClassLoader,
    { symbolizeNames = false, freeze = false } = {},
  ) {
    this.ss = ss;
    this.classLoader = classLoader;
    this.symbolizeNames = symbolizeNames;
    this.freeze = freeze;
  }

  /** @noRailsEquivalent PERMANENT */
  accept(o: Node | null): unknown {
    if (o === null) return null;
    if (yaml.isAlias(o)) return this.visitPsychNodesAlias(o);
    if (yaml.isMap(o)) return this.visitMapping(o);
    if (yaml.isSeq(o)) return this.register(o, this.registerEmpty(o));
    return this.register(o, this.deserialize(o));
  }

  /**
   * `ToRuby#visit_Psych_Nodes_Alias` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/to_ruby.rb:327`).
   *
   * @noRailsEquivalent PERMANENT
   */
  visitPsychNodesAlias(o: Alias): unknown {
    if (!this.st.has(o.source)) throw new AnchorNotDefined(o.source);
    return this.st.get(o.source);
  }

  private deserialize(o: Scalar): unknown {
    if (!o.tag) {
      const quoted = o.type === yaml.Scalar.QUOTE_SINGLE || o.type === yaml.Scalar.QUOTE_DOUBLE;
      return quoted ? o.value : this.ss.tokenize(o.value);
    }

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
        const endpoint = (text: string): unknown =>
          this.accept(yaml.parseDocument(text).contents as Node | null);
        return new klass(endpoint(begin), endpoint(end), dots === "...");
      }
      default:
        if (/^!ruby\/sym(bol)?:?(.*)?$/.test(o.tag)) return this.classLoader.symbolize(value);
        return this.ss.tokenize(o.value);
    }
  }

  private visitMapping(o: YAMLMap): unknown {
    if (o.tag && Psych.loadTags[o.tag])
      return this.revive(this.resolveClass(Psych.loadTags[o.tag]), o);
    if (!o.tag)
      return this.reviveHash(this.register(o, Object.create(null) as Record<string, unknown>), o);

    let match: RegExpExecArray | null;
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
    else for (const [k, v] of Object.entries(h)) rbObjIvarSet(o, `@${k}`, v);
    return o;
  }

  private resolveClass(klassname: string): RubyClass {
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
