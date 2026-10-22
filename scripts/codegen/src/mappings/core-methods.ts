/**
 * Ruby core methods on a receiver the generator cannot type: one rule per Ruby
 * method name, each answering the TypeScript for the call or null to leave it
 * to ordinary dispatch. Native JS forms are used where the call gate credits
 * them (`enumerable-idioms.ts`), ruby-compat otherwise.
 *
 * `CORE_METHODS` holds the rules; `RUBY_COMPAT_CORE_FNS` the names that are
 * nothing more than ruby-compat's function of the same name (`rbCoreFn`), so a
 * new one is a list entry. `Lowerer.coreCall` (lower.ts) builds the call site
 * and looks the name up here.
 */
import type { N, Param } from "../ir.js";
import type { TypeRef } from "../types.js";
import { GEM } from "../gem.js";
import { hashNamed, jsIdent, needsParens, rbCoreFn, type Ctx, type Lowerer } from "../lower.js";

/** What a rule sees of the call it lowers. */
export interface CoreSite {
  lw: Lowerer;
  ctx: Ctx;
  n: N;
  name: string;
  recvNode: N;
  /** The receiver's expression, and the same parenthesized for a member access. */
  r: string;
  R: string;
  /** The receiver as an Array of its elements (a Set / Map / Hash's pairs). */
  E: string;
  /** `.` or `?.` */
  nav: string;
  blk: N | null;
  recvType: TypeRef;
  /** The lowered arguments, the block last. */
  args(): string[];
  /** The block as a function, its yielded pair splatted where Ruby splats it. */
  fn(): string | null;
  /** A ruby-compat helper (`Lowerer.rc`). */
  rc(name: string): string;
  recvIsString(): boolean;
}

export type CoreRule = (c: CoreSite) => string | null;

/** A block whose parameters take one yielded pair apart (`|key, value|`). */
function pairParams(blk: N | null): Param[] | null {
  if (
    blk?.k !== "block" ||
    blk.params.length < 2 ||
    !blk.params.every((p: Param) => p.kind === "req" && p.name)
  )
    return null;
  return [
    {
      kind: "req",
      name: undefined,
      destructure: blk.params.map((p: Param) => p.name!),
    } as Param,
  ];
}

const argc = (c: CoreSite) => c.n.args.length;

const rules: Record<string, CoreRule> = {};
const rule = (names: string, f: CoreRule) => {
  for (const k of names.split(" ")) rules[k] = f;
};

// Array#clear / Hash#clear (array.c rb_ary_clear, hash.c rb_hash_clear)
// empty the receiver in place and answer it; a Map or Set has its own.
rule("clear", (c) => {
  if (argc(c) !== 0 || c.blk) return null;
  if (c.recvType?.k === "array") return c.lw.withOnce(c.r, (x) => `(${x}.length = 0, ${x})`);
  if (c.recvType?.k === "hash" && !c.recvType.map)
    return c.lw.withOnce(c.r, (x) => `(Object.keys(${x}).forEach((k) => delete ${x}[k]), ${x})`);
  return c.lw.withOnce(
    c.r,
    (x) => `(Array.isArray(${x}) ? (${x}.length = 0) : ${x}.clear(), ${x})`,
  );
});

// `x.grep(C)` keeps the elements `C === e` holds for (enum.c grep_i).
rule("grep", (c) => {
  if (argc(c) === 1 && !c.blk && c.n.args[0].k === "const") {
    const t = c.lw.typeTest(c.n.args[0], "e", c.ctx);
    if (t) return `${c.E}${c.nav}filter((e: any) => ${t})`;
  }
  return null;
});

rule("map collect", (c) => (c.blk ? `${c.E}${c.nav}map(${c.fn()})` : null));
rule("flat_map collect_concat", (c) => (c.blk ? `${c.E}${c.nav}flatMap(${c.fn()})` : null));
rule("select filter find_all", (c) => (c.blk ? `${c.E}${c.nav}filter(${c.fn()})` : null));

rule("reject", (c) => {
  // `reject(&:closed?)`: the predicate sent to each element; a Ruby
  // predicate's value is a boolean in practice, as `cond` treats it.
  if (c.blk?.k === "symproc" && /\?$/.test(c.blk.name)) {
    const m = c.lw.callName(c.blk.name);
    return `${c.E}${c.nav}filter((x) => !x.${m}())`;
  }
  // Typed variadic so forwarding `...xs` into a one-parameter block type-checks.
  if (c.blk)
    return `${c.E}${c.nav}filter((...xs: any[]) => !${c.lw.truthy(`((${c.fn()}) as (...a: any[]) => unknown)(...xs)`, true)})`;
  return null;
});

rule("detect find", (c) => (c.blk && argc(c) === 0 ? `${c.E}${c.nav}find(${c.fn()})` : null));

rule("any? all? none?", (c) => {
  // `h.all? { |key, value| }`: Ruby splats each yielded pair across the
  // block's parameters (as `each` below); JS `every` passes (element, index).
  const one = pairParams(c.blk);
  if (one) {
    const m = c.name === "all?" ? "every" : "some";
    return `${c.name === "none?" ? "!" : ""}${c.lw.entries(c.r, c.ctx, c.recvNode)}.${m}(${c.lw.arrow(one, c.blk!.body, c.ctx)})`;
  }
  // `x&.any? { }` is nil for a nil `x`, where `?.` reads `undefined`.
  if (c.name === "all?") {
    if (c.blk)
      return c.nav ? `(${c.E}${c.nav}every(${c.fn()}) ?? null)` : `${c.E}.every(${c.fn()})`;
    return null;
  }
  if (c.name === "none?") {
    if (c.blk && !c.nav) return `!${c.E}.some(${c.fn()})`;
    return null;
  }
  if (c.blk) return c.nav ? `(${c.E}${c.nav}some(${c.fn()}) ?? null)` : `${c.E}.some(${c.fn()})`;
  if (argc(c) === 0) return `${c.E}${c.nav}some((x: any) => x != null && x !== false)`;
  return null;
});

rule("each", (c) => {
  // Ruby splats one yielded pair across a block's parameters (`|label, value|`),
  // and a Hash yields `[key, value]`; JS forEach would pass (element, index).
  const one = pairParams(c.blk);
  if (one)
    return `${c.lw.entries(c.r, c.ctx, c.recvNode)}.forEach(${c.lw.arrow(one, c.blk!.body, c.ctx)})`;
  if (c.blk) return `${c.R}${c.nav}forEach(${c.fn()})`;
  return null;
});

rule("each_with_index", (c) => (c.blk ? `${c.R}${c.nav}forEach(${c.fn()})` : null));

// enum.c enum_each_with_object: yields each element with the memo, answers the memo.
rule("each_with_object", (c) => {
  if (!c.blk || argc(c) !== 1) return null;
  const [memo, f] = c.args();
  return `${c.lw.entries(c.r, c.ctx, c.recvNode)}.reduce((memo: any, x: any) => ((${f})(x, memo), memo), ${memo})`;
});

// enum.c enum_inject with a block: Array#reduce, which seeds with the first
// element as Ruby does; an empty receiver with no seed is nil in Ruby, where
// JS throws.
rule("inject reduce", (c) => {
  if (c.blk && argc(c) <= 1 && !c.lw.mayBeMap(c.recvNode, c.ctx)) {
    const xs = c.lw.entries(c.r, c.ctx, c.recvNode);
    if (argc(c) === 1) return `${xs}.reduce(${c.fn()}, ${c.lw.expr(c.n.args[0], c.ctx)})`;
    return c.lw.withOnce(xs, (x) => `(${x}.length === 0 ? null : ${x}.reduce(${c.fn()}))`);
  }
  return `${c.rc("inject")}(${c.r}, ${c.args().join(", ")})`;
});

rule("include? member?", (c) => {
  if (argc(c) === 1 && !c.blk && hashNamed(c.recvNode))
    return c.lw.hasKeyForm(c.recvNode, c.r, c.args()[0], c.ctx);
  if (argc(c) === 1 && !c.blk) return `${c.E}${c.nav}includes(${c.args()[0]})`;
  return null;
});

rule("key? has_key?", (c) =>
  argc(c) === 1 ? c.lw.hasKeyForm(c.recvNode, c.r, c.args()[0], c.ctx) : null,
);

rule("size length", (c) => {
  if (argc(c) === 0 && !c.blk && hashNamed(c.recvNode)) return `${c.rc("size")}(${c.r})`;
  // In a ported test an untyped receiver may be a Set (`Serializers.serializers`).
  if (
    argc(c) === 0 &&
    !c.blk &&
    c.ctx.f.rubyFile.startsWith("test/") &&
    !["array", "prim"].includes(c.lw.typeOf(c.recvNode, c.ctx)?.k ?? "")
  )
    return c.lw.withOnce(
      c.r,
      (x) =>
        `(${x} instanceof globalThis.Set || ${x} instanceof globalThis.Map ? ${x}.size : ${x}.length)`,
    );
  if (argc(c) === 0 && !c.blk) return `${c.R}${c.nav}length`;
  return null;
});

rule("empty?", (c) => (argc(c) === 0 ? `${c.rc("isEmpty")}(${c.r})` : null));

rule("first", (c) => {
  if (c.blk) return null;
  // ActiveSupport String#first(limit) (core_ext/string/access.rb); an
  // Array's `first(n)` is `take(ary, n)`, ruby-compat's `first` takes none.
  if (c.recvIsString()) return `${c.lw.as(c.ctx, "first")}(${[c.r, ...c.args()].join(", ")})`;
  if (argc(c) === 1 && c.lw.typeOf(c.recvNode, c.ctx)?.k === "array")
    return `${c.rc("take")}(${c.r}, ${c.args()[0]})`;
  return `${c.rc("first")}(${[c.r, ...c.args()].join(", ")})`;
});

rule("last", (c) => {
  if (c.blk) return null;
  if (c.recvIsString()) return `${c.lw.as(c.ctx, "last")}(${[c.r, ...c.args()].join(", ")})`;
  return `${c.rc("last")}(${[c.r, ...c.args()].join(", ")})`;
});

// Array#join (array.c rb_ary_join) converts each element by its Ruby `to_s`
// (a Hash's is `inspect`); JS join gives `[object Object]` (activejob).
rule("join", (c) => {
  if (GEM.gem === "activejob" && c.nav === ".")
    return `${c.rc("aryJoin")}(${[c.r, ...c.args()].join(", ")})`;
  return `${c.R}${c.nav}join(${c.args().join(", ")})`;
});

rule("drop", (c) =>
  !c.blk && argc(c) === 1 ? `${c.rc("drop")}(${c.r} as unknown[], ${c.args()[0]})` : null,
);

rule("compact", (c) => {
  // Hash#compact (hash.c rb_hash_compact) on a plain object is activesupport's.
  if (!c.blk && argc(c) === 0 && c.recvNode.k === "hash")
    return `${c.lw.imp(c.ctx, "@blazetrails/activesupport", "compact", "hashCompact")}(${c.r})`;
  if (!c.blk && argc(c) === 0) return `${c.rc("compact")}(${c.r})`;
  return null;
});

rule("uniq", (c) => (!c.blk && argc(c) === 0 ? `${c.rc("uniq")}(${c.r})` : null));
rule("flatten", (c) => `${c.R}${c.nav}flat(${argc(c) ? c.args()[0] : "Infinity"})`);
rule("keys", (c) => (argc(c) === 0 ? `Object.keys(${c.r})` : null));
rule("values", (c) => (argc(c) === 0 ? `Object.values(${c.r})` : null));

// The native spread / `Object.assign` copies only a plain object's own keys,
// so an argument that may be a Map (a caller's Hash) keeps the helper.
rule("merge", (c) => {
  if (!c.blk && argc(c) === 1 && c.lw.plainHash(c.n.args[0], c.ctx))
    return `{ ...${c.R}, ...${c.args()[0]} }`;
  if (!c.blk && argc(c) === 1) return `${c.rc("merge")}(${c.r}, ${c.args()[0]})`;
  return null;
});

rule("merge! update", (c) => {
  if (!c.blk && argc(c) === 1 && c.name === "merge!" && c.lw.plainHash(c.n.args[0], c.ctx))
    return `Object.assign(${c.r}, ${c.args()[0]})`;
  if (!c.blk && argc(c) === 1) return `${c.rc("update")}(${c.r}, ${c.args()[0]})`;
  return null;
});

rule("to_sym to_str", (c) => (argc(c) === 0 ? c.r : null));
rule("to_i", (c) => (argc(c) === 0 ? `${c.rc("rbToI")}(${c.r})` : null));

// A value with its own `to_f` (a Ruby Time) answers it; `Number(time)` is NaN.
rule("to_f", (c) => {
  if (argc(c) !== 0) return null;
  const t = c.lw.typeOf(c.recvNode, c.ctx);
  return t?.k === "prim" ? `Number(${c.r})` : `${c.rc("toF")}(${c.r})`;
});

rule("to_a", (c) => (argc(c) === 0 ? `${c.rc("rbToA")}(${c.r})` : null));

// An Array of pairs is a plain-object Hash (CLAUDE.md "A Ruby Hash is a
// plain object"); `toH` answers a Map-backed Hash.
rule("to_h", (c) => {
  if (argc(c) === 0 && !c.blk && c.recvType?.k === "array") return `Object.fromEntries(${c.r})`;
  if (argc(c) === 0 && !c.blk) return `${c.rc("rbToH")}(${c.r})`;
  return null;
});

rule("start_with?", (c) => `${c.R}${c.nav}startsWith(${c.args().join(", ")})`);
rule("end_with?", (c) => `${c.R}${c.nav}endsWith(${c.args().join(", ")})`);
rule("downcase", (c) => `${c.R}${c.nav}toLowerCase()`);
rule("upcase", (c) => `${c.R}${c.nav}toUpperCase()`);
rule("strip", (c) => `${c.R}${c.nav}trim()`);

// string.c rb_str_split_m: a limit keeps the remainder in the last field,
// trailing empty fields drop, and `" "` / no pattern split awk-style; JS
// `split` does none of these.
rule("split", (c) => {
  if (c.nav === "?.")
    return c.lw.withOnce(
      c.r,
      (x) =>
        `(${x} == null ? ${x} : (${c.rc("rbStrSend")}(${[x, '"split"', ...c.args()].join(", ")})[0] as string[]))`,
    );
  return `(${c.rc("rbStrSend")}(${[c.r, '"split"', ...c.args()].join(", ")})[0] as string[])`;
});

rule("sub", (c) => (!c.blk ? `${c.R}${c.nav}replace(${c.args().join(", ")})` : null));
rule("gsub", (c) =>
  !c.blk && argc(c) === 2 ? `${c.rc("gsub")}(${c.r}, ${c.args().join(", ")})` : null,
);

rule("match?", (c) => {
  if (argc(c) === 1 && c.recvNode.k === "regex") return `${c.R}.test(${c.args()[0]})`;
  return `${c.rc("isMatch")}(${c.r}, ${c.args().join(", ")})`;
});

rule("zero?", (c) => `(${c.r} === 0)`);
rule("push unshift", (c) => `${c.R}${c.nav}${c.name}(${c.args().join(", ")})`);
rule("pop shift", (c) => (argc(c) === 0 ? `${c.R}${c.nav}${c.name}()` : null));
rule("concat", (c) => (argc(c) === 1 ? `${c.R}${c.nav}push(...${c.args()[0]})` : null));

rule("call", (c) => {
  const { recvNode, ctx } = c;
  if (
    recvNode.k === "lvar" &&
    jsIdent(recvNode.name) === ctx.blockVar &&
    ctx.asyncBox &&
    ctx.defName &&
    c.lw.resolver.asyncYielders.has(ctx.defName)
  ) {
    ctx.asyncBox.awaits = true;
    return `(await ${c.R}${c.nav === "?." ? "?." : ""}(${c.args().join(", ")}))`;
  }
  if (recvNode.k !== "self") return `${c.R}${c.nav === "?." ? "?." : ""}(${c.args().join(", ")})`;
  return null;
});

// `Hash#delete` / `Array#delete` answer the removed value (hash.c
// rb_hash_delete_m, array.c rb_ary_delete): ruby-compat `hashDelete` /
// `aryDelete`, by the receiver's type (a Hash when it is not known). An
// untyped receiver in activejob (`queue_adapter.enqueued_jobs`) is dispatched
// at run time.
rule("delete", (c) => {
  if (argc(c) === 1 && !c.blk && !c.recvType)
    return c.lw.withOnce(
      c.r,
      (x) =>
        `(Array.isArray(${x}) ? ${c.rc("aryDelete")}(${x}, ${c.args()[0]}) : ${c.rc("hashDelete")}(${x}, ${c.args()[0]}))`,
    );
  if (argc(c) === 1 && !c.blk)
    return `${c.rc(c.lw.typeOf(c.recvNode, c.ctx)?.k === "array" ? "aryDelete" : "hashDelete")}(${c.r}, ${c.args()[0]})`;
  return null;
});

// enum.c enum_sort_by: stable, the keys compared by `<=>`.
rule("sort_by", (c) =>
  c.blk
    ? `[...${c.E}].map((x: any) => [(${c.fn()})(x), x]).sort((a: any, b: any) => ${c.rc("cmp")}(a[0], b[0]) ?? 0).map((p: any) => p[1])`
    : null,
);

// enum.c enum_tally: a Hash keyed by the element itself, so a Map.
rule("tally", (c) =>
  !c.blk && argc(c) === 0
    ? `${c.E}${c.nav}reduce((h: Map<any, number>, x: any) => h.set(x, (h.get(x) ?? 0) + 1), new Map())`
    : null,
);

rule("group_by", (c) => (c.blk ? `${c.rc("groupBy")}(${c.r}, ${c.fn()})` : null));
rule("index_by", (c) => (c.blk ? `${c.lw.as(c.ctx, "indexBy")}(${c.r}, ${c.fn()})` : null));
rule("sum", (c) => `${c.rc("sum")}(${[c.r, ...c.args()].join(", ")})`);

rule("count", (c) => {
  if (argc(c) === 0 && !c.blk) return `${c.R}${c.nav}length`;
  // Enumerable#count with a block (enum.c count_iter_i): the elements it holds for.
  if (argc(c) === 0 && c.blk) {
    const f = c.fn();
    if (f && !f.startsWith("async ")) return `${c.E}${c.nav}filter(${f}).length`;
  }
  return null;
});

rule("max min", (c) => (!c.blk && argc(c) === 0 ? `${c.rc(c.name)}(${c.r})` : null));

// array.c rb_ary_collect_bang: each element replaced in place; answers the receiver.
rule("map!", (c) =>
  c.blk && !c.lw.index.methodNames.has(c.name)
    ? c.lw.withOnce(c.r, (x) => `(${x}.splice(0, ${x}.length, ...${x}.map(${c.fn()})), ${x})`)
    : null,
);

// array.c rb_ary_flatten_bang: nil when nothing was nested.
rule("flatten!", (c) => {
  if (c.blk || argc(c) > 1 || c.lw.index.methodNames.has(c.name)) return null;
  const d = argc(c) ? c.args()[0] : "Infinity";
  return c.lw.withOnce(
    c.r,
    (x) =>
      `(${x}.some(Array.isArray) ? (${x}.splice(0, ${x}.length, ...${x}.flat(${d})), ${x}) : null)`,
  );
});

// numeric.c int_dotimes: yields 0...n in order and answers n.
rule("times", (c) => {
  if (!c.blk || argc(c) !== 0) return null;
  const f = c.fn()!;
  const i = c.blk.k === "block" && !c.blk.params.length ? "" : "i";
  if (f.startsWith("async ")) {
    if (c.ctx.asyncBox) c.ctx.asyncBox.awaits = true;
    return `(await (async (n: number) => { for (let i = 0; i < n; i++) await (${f})(${i}); return n; })(${c.r}))`;
  }
  return `((n: number) => { for (let i = 0; i < n; i++) (${f})(${i}); return n; })(${c.r})`;
});

/**
 * Ruby core methods ported as ruby-compat's function of the same name
 * (`rbCoreFn`: `each_slice` → `eachSlice`, `odd?` → `isOdd`), receiver first.
 */
export const RUBY_COMPAT_CORE_FNS: ReadonlySet<string> = new Set(
  `each_slice each_index zip partition min_by max_by transform_values transform_keys
   slice except dig filter_map each_value each_key each_pair values_at sort reverse
   intersect? symbolize_keys stringify_keys deep_dup to_set sum_by chars lines squish
   underscore camelize classify constantize safe_constantize demodulize pluralize
   singularize humanize foreign_key tableize parameterize in? abs round ceil floor
   between? succ upto downto step ljust rjust center chomp chop lstrip rstrip tr
   delete_prefix delete_suffix unpack1 pack bytesize encoding force_encoding
   valid_encoding? ascii_only? b scan positive? negative? odd? even? integer? finite?
   nan? minmax cycle rotate sample shuffle fill insert delete_at delete_if keep_if
   select! reject! uniq! compact! sort! reverse! concat! replace invert key assoc store
   default compare_by_identity extract! extract_options! in_groups_of split_at
   each_char each_line each_byte start freeze! with_object`
    .split(/\s+/)
    .filter(Boolean),
);

const rubyCompatCall: CoreRule = (c) => {
  if (c.lw.index.methodNames.has(c.name)) return null;
  return `${c.rc(rbCoreFn(c.name))}(${[c.r, ...c.args()].join(", ")})`;
};

// `ary.map.with_index { |x, i| }` (and each / select): the JS array method
// already passes the index, so the enumerator chain is one call; otherwise
// ruby-compat's `withIndex`.
rule("with_index", (c) => {
  if (c.lw.index.methodNames.has(c.name)) return null;
  const JS_INDEXED: Record<string, string> = { map: "map", each: "forEach", select: "filter" };
  const inner = c.recvNode?.k === "call" ? c.recvNode : null;
  if (
    c.blk &&
    argc(c) === 0 &&
    inner &&
    JS_INDEXED[inner.name] &&
    inner.recv &&
    !inner.block &&
    inner.args.length === 0
  ) {
    const ir = c.lw.expr(inner.recv, c.ctx);
    return `${needsParens(ir) ? `(${ir})` : ir}.${JS_INDEXED[inner.name]}(${c.fn()})`;
  }
  return rubyCompatCall(c);
});

for (const k of RUBY_COMPAT_CORE_FNS) rules[k] ??= rubyCompatCall;

/** Ruby method name → its rule. */
export const CORE_METHODS: Readonly<Record<string, CoreRule>> = rules;

/** Enumerable methods whose awaiting block is run sequentially by `rbAsyncEnum`. */
export const ASYNC_ENUM: ReadonlySet<string> = new Set(
  "map collect flat_map collect_concat each each_with_index each_with_object select filter reject find detect any? all? none? sum inject reduce each_value each_pair each_key filter_map group_by index_by sort_by count transform_values".split(
    " ",
  ),
);

/** Enumerable methods whose block takes one yielded pair apart (`|key, value|`). */
export const SPLAT_YIELD_ONE: ReadonlySet<string> = new Set(
  "map collect flat_map collect_concat select filter find_all reject find detect sort_by min_by max_by group_by partition filter_map sum count".split(
    " ",
  ),
);

/**
 * The body of an Enumerable method whose block awaits, run in order as Ruby's
 * iteration is (enum.c, array.c), over `xs` with the block `g`; `self` is the
 * receiver and `a0…` its arguments. `null` where the method has no native body.
 */
export function asyncEnumBody(name: string, argcount: number): string | null {
  const T = (v: string) => `(${v} != null && ${v} !== false)`;
  switch (argcount === 0 ? name : argcount === 1 ? `${name}/1` : "") {
    case "each":
    case "each_pair":
      return "for (const x of xs) await g(x); return self;";
    case "each_with_index":
      return "for (let i = 0; i < xs.length; i++) await g(xs[i], i); return self;";
    case "map":
    case "collect":
      return "const out: unknown[] = []; for (const x of xs) out.push(await g(x)); return out;";
    case "flat_map":
    case "collect_concat":
      return "const out: unknown[] = []; for (const x of xs) out.push(...[await g(x)].flat()); return out;";
    case "select":
    case "filter":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if ${T("v")} out.push(x); } return out;`;
    case "reject":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if (!${T("v")}) out.push(x); } return out;`;
    case "filter_map":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if ${T("v")} out.push(v); } return out;`;
    case "find":
    case "detect":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return x; } return null;`;
    case "any?":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return true; } return false;`;
    case "all?":
      return `for (const x of xs) { const v = await g(x); if (!${T("v")}) return false; } return true;`;
    case "none?":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return false; } return true;`;
    case "count":
      return `let n = 0; for (const x of xs) { const v = await g(x); if ${T("v")} n++; } return n;`;
    case "each_with_object/1":
      return "for (const x of xs) await g(x, a0); return a0;";
    case "inject/1":
    case "reduce/1":
      return "let acc = a0; for (const x of xs) acc = await g(acc, x); return acc;";
    // hash.c rb_hash_transform_values on a plain-object Hash (a Map keeps the helper).
    case "transform_values":
      return "const out: Record<string, unknown> = {}; for (const [k, v] of Object.entries(self ?? {})) out[k] = await g(v); return out;";
  }
  return null;
}
