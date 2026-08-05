export function caseEq(matcher: unknown, subject: unknown): boolean {
  if (typeof matcher === "function") {
    return subject instanceof (matcher as new () => unknown);
  }
  if (matcher instanceof RegExp) return matcher.test(String(subject));
  if (matcher && typeof matcher === "object" && "includes" in matcher) {
    return (matcher as { includes(v: unknown): boolean }).includes(subject);
  }
  return matcher === subject;
}

export interface RubyRange {
  begin: number;
  end: number;
  includes(v: unknown): boolean;
  toA(): number[];
}

export function range(begin: number, end: number): RubyRange {
  return {
    begin,
    end,
    includes(v: unknown): boolean {
      return typeof v === "number" && v >= begin && v <= end;
    },
    toA(): number[] {
      const out: number[] = [];
      for (let i = begin; i <= end; i++) out.push(i);
      return out;
    },
  };
}

/** Ruby `<=>` — nil (null here) for operands Ruby cannot order. */
export function cmp(left: unknown, right: unknown): number | null {
  if (left === right) return 0;
  if (typeof left !== typeof right) return null;
  if ((left as number) < (right as number)) return -1;
  if ((left as number) > (right as number)) return 1;
  return null;
}

/**
 * Ruby `|` — set union on Array, bitwise-or on Integer, logical-or on boolean.
 * One Ruby operator over three families, and codegen has no type information to
 * pick between them, so the dispatch happens at runtime.
 */
export function union(left: unknown, right: unknown): unknown {
  if (typeof left === "number" && typeof right === "number") return left | right;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) || Boolean(right);
  }
  return [...new Set([...(left as unknown[]), ...(right as unknown[])])];
}

/** Ruby `&` — set intersection on Array, bitwise-and / logical-and otherwise. */
export function intersection(left: unknown, right: unknown): unknown {
  if (typeof left === "number" && typeof right === "number") return left & right;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) && Boolean(right);
  }
  const other = new Set(right as unknown[]);
  return [...new Set(left as unknown[])].filter((v) => other.has(v));
}

/**
 * Ruby `receiver[a, b]` — the multi-argument index read, which has no JS
 * operator. Array and String take a `(start, length)` slice; every other
 * receiver defines `[]` as an ordinary method, which the port spells `idx`.
 */
export function idxGet(receiver: unknown, ...index: unknown[]): unknown {
  if (index.length === 2 && (Array.isArray(receiver) || typeof receiver === "string")) {
    const [start, length] = index as [number, number];
    const from = start < 0 ? receiver.length + start : start;
    return receiver.slice(from, from + length);
  }
  return (receiver as { idx(...i: unknown[]): unknown }).idx(...index);
}

/**
 * Ruby `receiver[a, b] = value` — the multi-argument index write. Array splices
 * the `(start, length)` window; every other receiver spells `[]=` as `setIdx`.
 * Returns the assigned value, as the Ruby expression does.
 */
export function idxSet(receiver: unknown, ...args: unknown[]): unknown {
  const value = args[args.length - 1];
  const index = args.slice(0, -1);
  if (index.length === 2 && Array.isArray(receiver)) {
    const [start, length] = index as [number, number];
    const from = start < 0 ? receiver.length + start : start;
    receiver.splice(from, length, ...(Array.isArray(value) ? value : [value]));
    return value;
  }
  (receiver as { setIdx(...a: unknown[]): unknown }).setIdx(...index, value);
  return value;
}
