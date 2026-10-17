/**
 * The generated tree's two support files.
 *
 * `codegen-runtime.ts` holds every Ruby-semantics helper the lowering wanted
 * that `@blazetrails/ruby-compat` does not export. It is the wanted-list made
 * executable: a handful are implemented (truthiness `||`/`&&`, `Array()`),
 * the rest throw. None of it is meant to ship — each name is a ruby-compat
 * addition to make by hand (rule 1/2 of that package's README), or a lowering
 * to change.
 */
const IMPLEMENTED: Record<string, string> = {
  rbAryEnsure: `import { rbCheckArrayType as rbAryEnsureCheck } from "@blazetrails/ruby-compat";
export function rbAryEnsure(a: any): any[] {
  if (a == null) return [];
  return (rbAryEnsureCheck(a) as any[] | null) ?? [a];
}`,
  rbRaise: `import { RuntimeError as RbRaiseRuntimeError } from "@blazetrails/ruby-compat";
export function rbRaise(...args: any[]): never {
  if (!args.length) throw new RbRaiseRuntimeError("unhandled exception");
  throw rbMakeException(...args);
}`,
  rbAsyncEnum: `import { TypeError as RbAsyncEnumTypeError, rbObjClassname as rbAsyncEnumClassname } from "@blazetrails/ruby-compat";
export async function rbAsyncEnum(recv: any, method: string, ...rest: any[]): Promise<any> {
  const fn = rest.pop();
  const items: any[] = recv instanceof Map ? [...recv.entries()] : Array.isArray(recv) ? recv : Object.entries(recv ?? {});
  const out: any[] = [];
  switch (method) {
    case "each": case "each_pair": case "each_value": case "each_key":
      for (const x of items) await fn(x);
      return recv;
    case "each_with_index":
      for (let i = 0; i < items.length; i++) await fn(items[i], i);
      return recv;
    case "map": case "collect":
      for (const x of items) out.push(await fn(x));
      return out;
    // Hash#transform_values (hash.c rb_hash_transform_values): a new plain hash.
    case "transform_values": {
      const h: any = {};
      for (const [k, v] of Object.entries(recv ?? {})) h[k] = await fn(v);
      return h;
    }
    case "flat_map": case "collect_concat":
      for (const x of items) out.push(...[await fn(x)].flat());
      return out;
    case "select": case "filter":
      for (const x of items) if (truthy(await fn(x))) out.push(x);
      return out;
    case "reject":
      for (const x of items) if (!truthy(await fn(x))) out.push(x);
      return out;
    case "filter_map":
      for (const x of items) { const v = await fn(x); if (truthy(v)) out.push(v); }
      return out;
    case "find": case "detect":
      for (const x of items) if (truthy(await fn(x))) return x;
      return null;
    case "any?":
      for (const x of items) if (truthy(await fn(x))) return true;
      return false;
    case "all?":
      for (const x of items) if (!truthy(await fn(x))) return false;
      return true;
    case "none?":
      for (const x of items) if (truthy(await fn(x))) return false;
      return true;
    case "count": { let n = 0; for (const x of items) if (truthy(await fn(x))) n++; return n; }
    case "sum": {
      let s = rest[0] ?? 0;
      for (const x of items) {
        const v = await fn(x);
        if (typeof s === "number" && typeof v === "number") s += v;
        else if (typeof s === "string" && typeof v === "string") s += v;
        else if (Array.isArray(s) && Array.isArray(v)) s = [...s, ...v];
        else if (s != null && typeof s.plus === "function") s = s.plus(v);
        else throw new RbAsyncEnumTypeError(\`\${rbAsyncEnumClassname(v)} can't be coerced into \${rbAsyncEnumClassname(s)}\`);
      }
      return s;
    }
    case "each_with_object": { const memo = rest[0]; for (const x of items) await fn(x, memo); return memo; }
    case "inject": case "reduce": {
      const xs = [...items];
      let acc = rest.length ? rest[0] : xs.shift();
      for (const x of xs) acc = await fn(acc, x);
      return acc;
    }
    default:
      throw new Error("codegen-runtime: rbAsyncEnum " + method);
  }
}
function truthy(v: any): boolean {
  return v !== null && v !== undefined && v !== false;
}`,
  // A Ruby binary operator on operands the generator could not type: Array and
  // Set (array.c rb_ary_plus / rb_ary_diff / rb_ary_and / rb_ary_or; set.rb's
  // `+` / `|` union, `-`, `&`), numbers and strings natively, else the
  // receiver's own operator method by name.
  rbBinop: `export function rbBinop(a: any, op: string, ...rest: any[]): any {
  const b = rest[0];
  const items = (x: any): any[] => (x instanceof Set ? [...x] : Array.isArray(x) ? x : [...x]);
  if (a instanceof Set) {
    switch (op) {
      case "+": case "|": return new Set([...a, ...items(b)]);
      case "-": { const o = new Set(items(b)); return new Set([...a].filter((x) => !o.has(x))); }
      case "&": { const o = new Set(items(b)); return new Set([...a].filter((x) => o.has(x))); }
    }
  }
  if (Array.isArray(a)) {
    switch (op) {
      case "+": return [...a, ...items(b)];
      case "-": { const o = new Set(items(b)); return a.filter((x) => !o.has(x)); }
      case "&": { const o = new Set(items(b)); return [...new Set(a.filter((x) => o.has(x)))]; }
      case "|": return [...new Set([...a, ...items(b)])];
    }
  }
  // Comparable#< and friends (compar.c) go through \`<=>\`: trails spells it
  // \`compareTo\` (Comparable) or \`compare\` (\`@blazetrails/date\`'s Time).
  if ((op === "<" || op === ">" || op === "<=" || op === ">=") && a != null && typeof a === "object") {
    const cmp = typeof a.compareTo === "function" ? a.compareTo(b) : typeof a.compare === "function" ? a.compare(b) : undefined;
    if (typeof cmp === "number")
      return op === "<" ? cmp < 0 : op === ">" ? cmp > 0 : op === "<=" ? cmp <= 0 : cmp >= 0;
  }
  if (typeof a === "number" || typeof a === "string" || typeof a === "bigint") {
    const x: any = a;
    switch (op) {
      case "<": return x < b;
      case ">": return x > b;
      case "<=": return x <= b;
      case ">=": return x >= b;
      case "+": return x + b;
      case "-": return x - b;
      case "*": return typeof x === "string" ? x.repeat(b) : x * b;
      case "/": return x / b;
      case "%": return x % b;
    }
  }
  // A Ruby operator method is spelled by its trails name (\`TimeWithZone#-\` is
  // \`minus\`); reading \`a["-"]\` would reach a method_missing proxy and raise.
  const named: Record<string, string> = { "+": "plus", "-": "minus", "*": "times", "/": "div", "<=>": "compareTo", "==": "equals" };
  if (a != null && named[op] && typeof a[named[op]] === "function") return a[named[op]](b);
  // \`date ± duration\` (core_ext/date/calculations.rb \`plus_with_duration\` /
  // \`minus_with_duration\`): the Duration advances the date, \`since\` / \`until\`.
  if (b != null && (op === "+" || op === "-") && typeof b.since === "function" && typeof b.until === "function")
    return op === "+" ? b.since(a) : b.until(a);
  if (a != null && typeof a[op] === "function") return a[op](b);
  throw new Error("codegen-runtime: rbBinop " + op + " on " + Object.prototype.toString.call(a));
}`,
  // A Ruby Enumerable as an array for the Array-method forms the lowering uses:
  // a Set's members, a Map's [key, value] pairs; anything else unchanged.
  // \`Integer#times\` (numeric.c int_dotimes): yields 0...n in order and answers
  // the receiver; an async block is awaited before the next.
  times: `export function times(n: number, fn: (i: number) => any): any {
  let i = 0;
  const step = (): any => {
    for (; i < n; ) {
      const v = fn(i++);
      if (v instanceof Promise) return v.then(step);
    }
    return n;
  };
  return step();
}`,
  // \`x.delete(k)\` on a receiver of unknown type: Array#delete (array.c
  // rb_ary_delete) or Hash#delete (hash.c rb_hash_delete_m), by what it is.
  rbDelete: `import { aryDelete as rbDeleteAry, hashDelete as rbDeleteHash } from "@blazetrails/ruby-compat";
export function rbDelete(x: any, k: any): any {
  return Array.isArray(x) ? rbDeleteAry(x, k) : rbDeleteHash(x, k);
}`,
  rbEnum: `export function rbEnum(x: any): any {
  return x instanceof Set || x instanceof Map ? [...x] : x;
}`,
  // \`Array#map!\` (array.c rb_ary_collect_bang): replaces each element in place
  // and answers the receiver.
  // \`Enumerable#each_with_object\` (enum.c enum_each_with_object): yields each
  // element (a Hash's [key, value] pair) with the memo, and answers the memo.
  // Ruby \`<<\` (array.c rb_ary_push / string.c rb_str_concat / set.rb add):
  // appends in place and answers the receiver; else the receiver's own \`<<\`.
  rbAppend: `export function rbAppend(a: any, b: any): any {
  if (Array.isArray(a)) { a.push(b); return a; }
  if (a instanceof Set) { a.add(b); return a; }
  if (typeof a === "string") return a + b;
  if (a != null && typeof a["<<"] === "function") return a["<<"](b);
  if (a != null && typeof a.append === "function") return a.append(b);
  throw new Error("codegen-runtime: rbAppend on " + Object.prototype.toString.call(a));
}`,
  // \`BasicObject#instance_exec(*args, &blk)\` (vm_eval.c rb_obj_instance_exec):
  // the block (last argument) runs with \`self\` the receiver.
  jsInstanceExec: `export function jsInstanceExec(self: any, ...args: any[]): any {
  const fn = args.pop();
  return fn.apply(self, args);
}`,
  // \`Array#clear\` / \`Hash#clear\` (array.c rb_ary_clear, hash.c rb_hash_clear):
  // empties the receiver in place and answers it; else the receiver's own \`clear\`.
  clear: `export function clear(x: any): any {
  if (Array.isArray(x)) { x.length = 0; return x; }
  if (x != null && typeof x.clear === "function") { x.clear(); return x; }
  if (x != null && typeof x === "object") { for (const k of Object.keys(x)) delete x[k]; return x; }
  return x;
}`,
  // \`ActiveSupport::TestCase\` for a generated test class: Minitest::Test (its
  // empty before_setup / after_teardown end the chain an included module's
  // \`super\` reaches) with Minitest's and ActiveSupport's assertions, which trails
  // ports as flat functions (activesupport testing/assertions.ts), as methods.
  TestHost: `import * as AS from "@blazetrails/activesupport";
import { TestCase as AsTestCase } from "@blazetrails/activesupport/test-case";
// ActiveSupport::TestCase (test_case.rb), with SetupAndTeardown's class-level
// \`setup\` / \`teardown\` callbacks.
export class TestHost extends AsTestCase {
  [key: string]: any;
}
// Minitest::Assertions#pass (minitest/assertions.rb): an assertion that passes.
(TestHost.prototype as any).pass = function (_msg?: any) { return AS.assert(true); };
// ActiveSupport::TestCase includes Testing::TimeHelpers (test_case.rb).
for (const k of ["travel", "travelTo", "travelBack", "freezeTime", "unfreezeTime"])
  (TestHost.prototype as any)[k] = function (this: any, ...args: any[]) { return (AS as any)[k](...args); };
for (const [k, v] of Object.entries(AS))
  if (/^_?assert/.test(k) && typeof v === "function")
    (TestHost.prototype as any)[k] = function (this: any, ...args: any[]) { return (v as any)(...args); };`,
  // A method with \`*rest\` and keywords (\`retry_on(*exceptions, wait: ...)\`): a
  // trailing plain object in the rest array is the keyword hash (vm_args.c).
  rbExtractKeywords: `export function rbExtractKeywords(rest: any[]): any {
  const last = rest[rest.length - 1];
  if (last !== null && typeof last === "object" && Object.getPrototypeOf(last) === Object.prototype) return rest.pop();
  return {};
}`,
  // A class's own public singleton methods (Module#public_instance_methods(false)
  // on its singleton class), Ruby-spelled: its own statics.
  rbSingletonPublicMethods: `import { underscore as asUnderscore } from "@blazetrails/activesupport";
export function rbSingletonPublicMethods(klass: any): string[] {
  // A class_attribute written on this class (its own \`__class_attr_<name>\`
  // storage) is the singleton reader Ruby's setter redefines (class_attribute.rb).
  return Object.getOwnPropertyNames(klass)
    .filter((n) => !["length", "name", "prototype"].includes(n))
    .map((n) => (n.startsWith("__class_attr_") ? n.slice("__class_attr_".length) : n))
    .map((n) => { const u = asUnderscore(n); return n.startsWith("_") && !u.startsWith("_") ? "_" + u : u; });
}`,
  rbMakeException: `import { RuntimeError as RbMakeExceptionRuntimeError } from "@blazetrails/ruby-compat";
export function rbMakeException(x: any, ...rest: any[]): any {
  if (typeof x === "string") return new RbMakeExceptionRuntimeError(x);
  if (x != null && typeof x.exception === "function") return x.exception(...rest);
  if (typeof x === "function") return new x(...rest);
  return x;
}`,
  // \`obj.is_a?(klass)\` where Symbols are colon strings (CLAUDE.md "A Ruby Symbol is
  // a JS string"): Symbol is \`isSymbol\`, String a string that is not one.
  rbIsA: `import { rbObjIsKindOf as rbIsAKindOf, rbCSymbol as rbIsASym, rbCString as rbIsAStr, isSymbol as rbIsASymP } from "@blazetrails/ruby-compat";
export function rbIsA(x: any, klass: any): boolean {
  if (klass === rbIsASym) return rbIsASymP(x);
  if (klass === rbIsAStr && typeof x === "string") return !rbIsASymP(x);
  return rbIsAKindOf(x, klass);
}`,
  // Array#map! / #flatten! (array.c rb_ary_collect_bang / rb_ary_flatten_bang):
  // in place, answering the receiver (flatten! answers nil when nothing changed).
  mapBang: `export function mapBang(a: any[], fn: (x: any) => any): any[] {
  for (let i = 0; i < a.length; i++) a[i] = fn(a[i]);
  return a;
}`,
  flattenBang: `export function flattenBang(a: any[], depth: number = Infinity): any[] | null {
  if (!a.some((x) => Array.isArray(x))) return null;
  const flat = a.flat(depth);
  a.length = 0;
  a.push(...flat);
  return a;
}`,
  // Enumerable#sort_by (enum.c enum_sort_by): stable, keys compared by <=>.
  sortBy: `import { cmp as sortByCmp } from "@blazetrails/ruby-compat";
export function sortBy(xs: any, fn: (x: any) => any): any[] {
  const items: any[] = xs instanceof Map ? [...xs.entries()] : Array.isArray(xs) ? xs : Object.entries(xs ?? {});
  return items.map((x) => [fn(x), x] as const).sort((a, b) => sortByCmp(a[0], b[0]) ?? 0).map((p) => p[1]);
}`,
  tally: `export function tally(xs: any[]): Map<any, number> {
  const hash = new Map<any, number>();
  for (const x of xs) hash.set(x, (hash.get(x) ?? 0) + 1);
  return hash;
}`,
  // Enumerable#each_with_object (enum.c enum_each_with_object): a Hash yields [key, value].
  eachWithObject: `export function eachWithObject(xs: any, memo: any, fn: (x: any, memo: any) => any): any {
  const items: any[] = xs instanceof Map ? [...xs.entries()] : Array.isArray(xs) ? xs : Object.entries(xs ?? {});
  for (const x of items) fn(x, memo);
  return memo;
}`,
  // Enumerable#any? with no block or pattern: some element is truthy.
  isAny: `export function isAny(xs: any, fn?: ((x: any) => any) | null): boolean {
  const items: any[] = xs instanceof Map ? [...xs.entries()] : Array.isArray(xs) ? xs : Object.entries(xs ?? {});
  return items.some((x) => { const v = fn ? fn(x) : x; return v !== null && v !== undefined && v !== false; });
}`,
  // Ruby's \`Object\` for \`Object.new\` (object.c rb_cObject): not a plain JS object,
  // which trails reads as a Hash.
  RubyObject: `export const RubyObject = class Object {};`,
  // ruby-compat's \`Kernel\` with \`rand\` seated (random.c rb_f_rand is a
  // module_function of Kernel), so \`Kernel.stub(:rand, x)\` replaces what lib calls.
  rbKernel: `import { Kernel as RbKernelModule, kernelRand as rbKernelRand } from "@blazetrails/ruby-compat";
(RbKernelModule as any).rand ??= rbKernelRand;
export const rbKernel: any = RbKernelModule;`,
  // \`x.seconds\` on an Integer or a Duration (core_ext/numeric/time.rb; a Duration
  // reaches Integer#seconds through method_missing to its value).
  rbNumDuration: `import { Duration as RbNumDurationClass } from "@blazetrails/activesupport";
export function rbNumDuration(x: any, unit: string): any {
  const n = x instanceof RbNumDurationClass ? (x as any).value : x;
  return (RbNumDurationClass as any)[unit](n);
}`,
  // \`x.to_f\`: a value's own \`toF\` (Time#to_f), else the JS number.
  rbToF: `export function rbToF(x: any): number {
  return x != null && typeof x.toF === "function" ? x.toF() : Number(x);
}`,
  // \`size\` / \`length\` on any Ruby collection: a Set or Map (Set#size), an Array
  // or String, a Hash's pairs.
  rbSize: `export function rbSize(x: any): number {
  if (x instanceof Set || x instanceof Map) return x.size;
  if (Array.isArray(x) || typeof x === "string") return x.length;
  if (x != null && typeof x.size === "number") return x.size;
  if (x != null && typeof x.length === "number") return x.length;
  return Object.keys(x ?? {}).length;
}`,
  // A Ruby method name known only at run time as the TS member name
  // (snake_case → camelCase, \`x?\` → \`isX\`), as conventions.ts translates it.
  rbTsName: `export function rbTsName(name: any): string {
  const s = String(name);
  const camel = s.replace(/[?!]$/, "").replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
  return s.endsWith("?") ? "is" + camel[0].toUpperCase() + camel.slice(1) : camel;
}`,
  // Enumerable#count with a block (enum.c count_iter_i).
  count: `export function count(xs: any, fn: (x: any) => any): number {
  const items: any[] = xs instanceof Map ? [...xs.entries()] : Array.isArray(xs) ? xs : xs instanceof Set ? [...xs] : Object.entries(xs ?? {});
  return items.filter((x) => { const v = fn(x); return v !== null && v !== undefined && v !== false; }).length;
}`,
  rbEntries: `export function rbEntries(x: any): any[] {\n  return x instanceof Map ? [...x.entries()] : Array.isArray(x) ? x : Object.entries(x ?? {});\n}`,
};

/** The Ruby each {@link runtimeShim} helper stands in for, emitted as its `Mirrors:` line. */
export const SHIM_SOURCES: Record<string, string> = {
  rbAryEnsure:
    "multiple assignment and splat (vm_insnhelper.c vm_expandarray, rb_check_array_type)",
  rbRaise: "Kernel#raise (eval.c rb_f_raise, rb_make_exception)",
  rbAsyncEnum:
    "Enumerable / Array iteration run in order (enum.c, array.c); sum adds with the accumulator's + (enum.c enum_sum, array.c rb_ary_sum), raising TypeError where Integer#+ cannot coerce",
  rbBinop:
    "Array#+ #- #& #| (array.c rb_ary_plus, rb_ary_diff, rb_ary_and, rb_ary_or); Comparable#< #> #<= #>= (compar.c)",
  times: "Integer#times (numeric.c int_dotimes)",
  rbDelete: "Array#delete (array.c rb_ary_delete); Hash#delete (hash.c rb_hash_delete_m)",
  rbEnum: "Enumerable#to_a over a Set or Hash (enum.c enum_to_a)",
  rbAppend:
    "Array#<< (array.c rb_ary_push); String#<< (string.c rb_str_concat); Set#<< (set.rb add)",
  jsInstanceExec: "BasicObject#instance_exec (vm_eval.c rb_obj_instance_exec)",
  clear: "Array#clear (array.c rb_ary_clear); Hash#clear (hash.c rb_hash_clear)",
  TestHost: "ActiveSupport::TestCase (activesupport/lib/active_support/test_case.rb)",
  rbExtractKeywords: "keyword arguments from a trailing Hash (vm_args.c)",
  rbSingletonPublicMethods:
    "Module#public_instance_methods(false) on a singleton class (class.c rb_class_public_instance_methods)",
  rbMakeException:
    "eval.c rb_make_exception: a String is RuntimeError.new(str) (rb_exc_new_str); otherwise arg.exception(*rest). Exception.exception is rb_class_new_instance (error.c:3297, Init_Exception) and no ruby-compat Exception class defines exception, so for a class it is new(*rest); an instance with no message is itself",
  rbIsA: "Object#is_a? (object.c rb_obj_is_kind_of)",
  mapBang: "Array#map! (array.c rb_ary_collect_bang)",
  flattenBang: "Array#flatten! (array.c rb_ary_flatten_bang)",
  sortBy: "Enumerable#sort_by (enum.c enum_sort_by)",
  tally: "Enumerable#tally, keyed by the element itself (enum.c enum_tally)",
  eachWithObject: "Enumerable#each_with_object (enum.c enum_each_with_object)",
  isAny: "Enumerable#any? (enum.c enum_any)",
  RubyObject: "Object.new (object.c rb_cObject)",
  rbKernel: "Kernel's module functions (random.c rb_f_rand)",
  rbNumDuration:
    "Numeric#seconds and siblings (activesupport/lib/active_support/core_ext/numeric/time.rb)",
  rbToF: "#to_f (numeric.c flo_to_f, time.c time_to_f)",
  rbSize: "#size (array.c rb_ary_length, hash.c rb_hash_size, string.c rb_str_length)",
  rbTsName: "a Ruby method name as its trails member name (docs/ruby-ts-conventions.md)",
  count: "Enumerable#count with a block (enum.c enum_count)",
  rbEntries: "Hash#each yielding [key, value] pairs (hash.c rb_hash_each_pair)",
};

/** The names the shim implements; any other wanted name throws when called. */
export function implementedShimNames(): string[] {
  return Object.keys(IMPLEMENTED);
}

export function runtimeShim(wanted: Iterable<string>): string {
  const lines = [
    "/* eslint-disable */",
    "// Generated by scripts/codegen: Ruby helpers ruby-compat does not export yet.",
    "",
  ];
  const names = new Set(wanted);
  if (names.has("rbRaise")) names.add("rbMakeException");
  for (const name of [...names].sort()) {
    if (SHIM_SOURCES[name]) lines.push(`/** Mirrors: ${SHIM_SOURCES[name]} */`);
    lines.push(
      IMPLEMENTED[name] ??
        `export function ${name}(..._args: any[]): any {\n  throw new Error("codegen-runtime: ${name} is not in @blazetrails/ruby-compat");\n}`,
      "",
    );
  }
  return lines.join("\n");
}

export const DECLINED_SHIM = `/* eslint-disable */
// Generated by scripts/codegen. A \`declined()\` call marks Ruby the generator
// could not lower; it throws so a missed marker fails loudly.
export function declined(site: string, reason: string, ruby: string): any {
  throw new Error(\`codegen declined \${reason} at \${site}: \${ruby}\`);
}
`;
