import { isEmpty, rbEqual, rbObjRespondTo, stderr, stdout } from "@blazetrails/ruby-compat";
import type { ExpectStatic } from "vitest";

type MatcherState = ReturnType<ExpectStatic["getState"]>;

export interface RubyMatchers<R = unknown> {
  toEqualRuby(exp: unknown): R;
  toBeRubyTruthy(): R;
  toBeRubyFalsy(): R;
  toBeWithinDelta(exp: number, delta?: number): R;
  toBeEmpty(): R;
  toBeExactInstanceOf(cls: unknown): R;
  toRespondTo(meth: string): R;
  toStartWith(...expected: unknown[]): R;
  toEndWith(...expected: unknown[]): R;
  toInclude(...expected: unknown[]): R;
  toContainExactly(...expected: unknown[]): R;
  toHaveKey(key: unknown): R;
  toBeBetween(min: unknown, max: unknown, mode?: "inclusive" | "exclusive"): R;
  toChange(read: () => unknown, opts?: ChangeOptions): Promise<R>;
  toYieldControl(times?: number): Promise<R>;
  toYieldWithNoArgs(): Promise<R>;
  toYieldWithArgs(...expected: unknown[]): Promise<R>;
  toYieldSuccessiveArgs(...expected: unknown[]): Promise<R>;
  toOutput(expected?: string | RegExp, to?: "stdout" | "stderr"): Promise<R>;
}

export interface ChangeOptions {
  from?: unknown;
  to?: unknown;
  by?: number;
}

type ProbeBlock = (probe: (...args: unknown[]) => unknown) => unknown;

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T> extends RubyMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends RubyMatchers {}
}

function result(
  state: MatcherState,
  pass: boolean,
  received: unknown,
  what: string,
): { pass: boolean; message: () => string } {
  return {
    pass,
    message: () =>
      `expected ${state.utils.printReceived(received)} ${state.isNot ? "not " : ""}${what}`,
  };
}

export const matchers = {
  toEqualRuby(this: MatcherState, act: unknown, exp: unknown) {
    return result(this, rbEqual(exp, act), act, `to == ${this.utils.printExpected(exp)}`);
  },
  toBeRubyTruthy(this: MatcherState, received: unknown) {
    return result(this, received != null && received !== false, received, "to be truthy");
  },
  toBeRubyFalsy(this: MatcherState, received: unknown) {
    return result(this, received == null || received === false, received, "to be falsy");
  },
  toBeWithinDelta(this: MatcherState, act: number, exp: number, delta = 0.001) {
    const n = Math.abs(exp - act);
    return result(this, delta >= n, act, `to be within ${delta} of ${exp}`);
  },
  toBeEmpty(this: MatcherState, received: object) {
    const pass = rbObjRespondTo(received, "isEmpty") || respondsToEmpty(received);
    return result(this, pass && isEmpty(received), received, "to be empty");
  },
  toBeExactInstanceOf(this: MatcherState, received: unknown, cls: unknown) {
    const pass = received != null && (received as object).constructor === cls;
    return result(this, pass, received, `to be an instance of ${String(cls)}`);
  },
  toRespondTo(this: MatcherState, received: unknown, meth: string) {
    return result(this, rbObjRespondTo(received, meth), received, `to respond to #${meth}`);
  },
  toStartWith(this: MatcherState, received: unknown, ...expected: unknown[]) {
    const what = `to start with ${this.utils.printExpected(expected)}`;
    return result(this, startsOrEnds(received, expected, false), received, what);
  },
  toEndWith(this: MatcherState, received: unknown, ...expected: unknown[]) {
    const what = `to end with ${this.utils.printExpected(expected)}`;
    return result(this, startsOrEnds(received, expected, true), received, what);
  },
  toInclude(this: MatcherState, received: unknown, ...expected: unknown[]) {
    const pass = expected.every((e) => includes(received, e));
    return result(this, pass, received, `to include ${this.utils.printExpected(expected)}`);
  },
  toContainExactly(this: MatcherState, received: unknown, ...expected: unknown[]) {
    const what = `to contain exactly ${this.utils.printExpected(expected)}`;
    return result(this, containsExactly(received, expected), received, what);
  },
  toHaveKey(this: MatcherState, received: unknown, key: unknown) {
    const pass = isHashLike(received) && hashHas(received, key);
    return result(this, pass, received, `to have key ${this.utils.printExpected(key)}`);
  },
  toBeBetween(
    this: MatcherState,
    received: unknown,
    min: unknown,
    max: unknown,
    mode: "inclusive" | "exclusive" = "inclusive",
  ) {
    const [r, lo, hi] = [received, min, max] as number[];
    const pass = mode === "inclusive" ? r >= lo && r <= hi : r > lo && r < hi;
    return result(
      this,
      pass,
      received,
      `to be between ${String(min)} and ${String(max)} (${mode})`,
    );
  },
  async toChange(
    this: MatcherState,
    block: () => unknown,
    read: () => unknown,
    opts: ChangeOptions = {},
  ) {
    const before = await read();
    await block();
    const after = await read();
    let pass = !rbEqual(before, after);
    if ("from" in opts) pass &&= rbEqual(opts.from, before);
    if ("to" in opts) pass &&= rbEqual(opts.to, after);
    if (opts.by !== undefined) pass = (after as number) - (before as number) === opts.by;
    const what = `to change (${this.utils.printReceived(before)} → ${this.utils.printReceived(after)})`;
    return result(this, pass, block, what);
  },
  async toYieldControl(this: MatcherState, block: ProbeBlock, times?: number) {
    const n = (await probeYields(block)).length;
    const pass = times === undefined ? n > 0 : n === times;
    return result(
      this,
      pass,
      block,
      `to yield control${times === undefined ? "" : ` ${times} times`} (yielded ${n})`,
    );
  },
  async toYieldWithNoArgs(this: MatcherState, block: ProbeBlock) {
    const calls = await probeYields(block);
    return result(
      this,
      calls.length === 1 && calls[0].length === 0,
      block,
      "to yield with no args",
    );
  },
  async toYieldWithArgs(this: MatcherState, block: ProbeBlock, ...expected: unknown[]) {
    const calls = await probeYields(block);
    const args = calls[0] ?? [];
    const pass =
      calls.length === 1 &&
      (expected.length === 0
        ? args.length > 0
        : args.length === expected.length && expected.every((e, i) => argMatches(e, args[i])));
    return result(
      this,
      pass,
      block,
      `to yield with ${this.utils.printExpected(expected)} (got ${this.utils.printReceived(calls)})`,
    );
  },
  async toYieldSuccessiveArgs(this: MatcherState, block: ProbeBlock, ...expected: unknown[]) {
    const calls = await probeYields(block);
    const pass =
      calls.length === expected.length &&
      calls.every((c, i) => argMatches(expected[i], yieldArgs(c)));
    return result(this, pass, block, `to yield successively ${this.utils.printExpected(expected)}`);
  },
  async toOutput(
    this: MatcherState,
    block: () => unknown,
    expected?: string | RegExp,
    to: "stdout" | "stderr" = "stdout",
  ) {
    const stream = to === "stdout" ? stdout : stderr;
    const write = stream.write;
    let captured = "";
    stream.write = (chunk) => {
      captured += chunk;
      return true;
    };
    try {
      await block();
    } finally {
      stream.write = write;
    }
    const pass =
      expected === undefined
        ? captured !== ""
        : typeof expected === "string"
          ? captured === expected
          : expected.test(captured);
    return result(
      this,
      pass,
      captured,
      `to be output to ${to}${expected === undefined ? "" : ` matching ${String(expected)}`}`,
    );
  },
};

function argMatches(expected: unknown, actual: unknown): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (typeof expected === "function" && Object(actual) instanceof (expected as new () => unknown))
    return true;
  return rbEqual(expected, actual);
}

function startsOrEnds(received: unknown, expected: unknown[], end: boolean): boolean {
  if (typeof received === "string")
    return expected.every(
      (e) => typeof e === "string" && (end ? received.endsWith(e) : received.startsWith(e)),
    );
  if (!Array.isArray(received)) return false;
  if (expected.length > received.length) return false;
  const part = end
    ? received.slice(received.length - expected.length)
    : received.slice(0, expected.length);
  return part.every((x, i) => rbEqual(expected[i], x));
}

function isHashLike(v: unknown): v is object {
  if (v instanceof Map) return true;
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function hashHas(h: object, key: unknown): boolean {
  return h instanceof Map ? h.has(key) : Object.hasOwn(h, String(key));
}

function hashGet(h: object, key: unknown): unknown {
  return h instanceof Map ? h.get(key) : (h as Record<string, unknown>)[String(key)];
}

function includes(received: unknown, e: unknown): boolean {
  if (typeof received === "string") return typeof e === "string" && received.includes(e);
  if (isHashLike(received)) {
    if (isHashLike(e))
      return [...(e instanceof Map ? e.entries() : Object.entries(e))].every(
        ([k, v]) => hashHas(received, k) && rbEqual(v, hashGet(received, k)),
      );
    return hashHas(received, e);
  }
  if (received != null && typeof (received as Iterable<unknown>)[Symbol.iterator] === "function")
    return [...(received as Iterable<unknown>)].some((x) => rbEqual(e, x));
  return false;
}

function containsExactly(received: unknown, expected: unknown[]): boolean {
  if (!Array.isArray(received) || received.length !== expected.length) return false;
  const left = [...received];
  return expected.every((e) => {
    const i = left.findIndex((x) => rbEqual(e, x));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

async function probeYields(block: ProbeBlock): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  await block((...args) => {
    calls.push(args);
  });
  return calls;
}

const yieldArgs = (args: unknown[]): unknown => (args.length === 1 ? args[0] : args);

function respondsToEmpty(value: unknown): boolean {
  if (typeof value === "string" || Array.isArray(value)) return true;
  if (value instanceof Set || value instanceof Map) return true;
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
