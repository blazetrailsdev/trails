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
