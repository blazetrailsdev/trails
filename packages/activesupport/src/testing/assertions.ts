import { indexWith } from "../enumerable-utils.js";

import { Dir, env } from "@blazetrails/ruby-compat";
import { _testCaseIdentity, taggedLogger } from "./tagged-logging.js";

/** @noRailsEquivalent PERMANENT */
export class Assertion extends Error {
  override name = "Assertion";
}

/** @noRailsEquivalent PERMANENT */
export class UnexpectedError extends Assertion {
  override name = "UnexpectedError";
  error: Error;

  constructor(error: Error) {
    super("Unexpected exception");
    delete (this as { message?: string }).message;
    delete (this as { stack?: string }).stack;
    this.error = error;
  }

  get resultLabel(): string {
    return "Error";
  }
}

function classNameOf(e: Error): string {
  if (e.name && e.name !== "Error") return e.name;
  const ctor = e.constructor?.name;
  if (ctor && ctor !== "Error") return ctor;
  return e.name || ctor || "Error";
}

/** @noRailsEquivalent PERMANENT */
export class BacktraceFilter {
  /** @noRailsEquivalent PERMANENT */
  static MT_RE = /node_modules[/\\]@?vitest|node:internal/;

  regexp: RegExp;

  constructor(regexp: RegExp = BacktraceFilter.MT_RE) {
    this.regexp = regexp;
  }

  filter(bt: string[] | null): string[] {
    if (!bt) return ["No backtrace"];

    if (env.MT_DEBUG != null) return [...bt];

    const framework = bt.findIndex((line) => this.regexp.test(line));
    let newBt = framework === -1 ? [...bt] : bt.slice(0, framework);
    if (newBt.length === 0) newBt = bt.filter((line) => !this.regexp.test(line));
    if (newBt.length === 0) newBt = [...bt];

    return newBt;
  }
}

/** @noRailsEquivalent PERMANENT */
export const Minitest: {
  backtraceFilter: { filter(bt: string[] | null): string[] };
  filterBacktrace(bt: string[] | null): string[];
} = {
  backtraceFilter: new BacktraceFilter(),

  filterBacktrace(bt: string[] | null): string[] {
    let result = Minitest.backtraceFilter.filter(bt);
    if (result.length === 0 && bt) result = [...bt];
    return result;
  },
};

function baseRe(): RegExp {
  let pwd: string;
  try {
    pwd = Dir.pwd();
  } catch {
    return /(?!)/g;
  }
  return new RegExp(`${pwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "g");
}

Object.defineProperties(UnexpectedError.prototype, {
  stack: {
    configurable: true,
    get(this: UnexpectedError): string | undefined {
      return this.error.stack;
    },
  },
  message: {
    configurable: true,
    get(this: UnexpectedError): string {
      const bt = Minitest.filterBacktrace(backtrace(this.error))
        .join("\n    ")
        .replace(baseRe(), "");
      return `${classNameOf(this.error)}: ${this.error.message}\n    ${bt}`;
    },
  },
});

function backtrace(error: Error): string[] | null {
  if (error.stack == null) return null;
  return error.stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => line.trim());
}

export const UNTRACKED: unique symbol = Symbol("UNTRACKED");

type Expression<T> = () => T | Promise<T>;

export function assertNot(object: unknown, message?: string | null): void {
  message ||= `Expected ${inspect(object)} to be nil or false`;
  assert(!(object != null && object !== false), message);
}

export async function assertRaises(
  exp: (new (...args: any[]) => Error)[],
  { match }: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<Error> {
  let error: Error | undefined;
  try {
    await block?.();
  } catch (e) {
    error = e as Error;
  }
  if (!error)
    throw new Assertion(`${exp.map((e) => e.name).join(", ")} expected but nothing was raised`);
  if (!exp.some((klass) => error instanceof klass)) {
    assert(false, `${exp.map((e) => e.name).join(", ")} expected, not ${error.name}`);
  }
  if (match) assertMatch(match, error.message);
  return error;
}

export async function assertRaise(
  exp: (new (...args: any[]) => Error)[],
  options: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<Error> {
  return assertRaises(exp, options, block);
}

export async function assertNothingRaised<T>(block: () => T | Promise<T>): Promise<T> {
  try {
    const retval = await block();
    assert(true);
    return retval;
  } catch (error) {
    throw new UnexpectedError(error as Error);
  }
}

/** @missingRailsCall map — PERMANENT */
export async function assertDifference<T>(
  expression: Map<Expression<number>, number>,
  ...args: [message?: string | null, block?: () => T | Promise<T>]
): Promise<T | undefined>;
export async function assertDifference<T>(
  expression: Expression<number> | Expression<number>[],
  ...args: [difference?: number, message?: string | null, block?: () => T | Promise<T>]
): Promise<T | undefined>;
export async function assertDifference<T>(
  expression: Expression<number> | Expression<number>[] | Map<Expression<number>, number>,
  ...args: unknown[]
): Promise<T | undefined> {
  const block =
    typeof args[args.length - 1] === "function" ? (args.pop() as () => T | Promise<T>) : undefined;

  let message: string | null | undefined;
  let expressions: Map<Expression<number>, number>;
  if (expression instanceof Map) {
    message = args[0] as string | null | undefined;
    expressions = expression;
  } else {
    const difference = (args[0] as number | undefined) ?? 1;
    message = args[1] as string | null | undefined;
    expressions = indexWith(Array.isArray(expression) ? expression : [expression], difference);
  }

  const exps = [...expressions.keys()];
  const before: number[] = [];
  for (const exp of exps) before.push(await exp());

  const retval = await _assertNothingRaisedOrWarn("assert_difference", block);

  for (const [index, exp] of exps.entries()) {
    const diff = expressions.get(exp) as number;
    const beforeValue = before[index];
    const actual = await exp();
    const richMessage = () => {
      let error = `\`${_callableToSourceString(exp)}\` didn't change by ${diff}, but by ${actual - beforeValue}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assertEqual(beforeValue + diff, actual, richMessage);
  }

  return retval;
}

export async function assertNoDifference<T>(
  expression: Expression<number> | Expression<number>[] | Map<Expression<number>, number>,
  message: string | null = null,
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  return assertDifference(
    expression as Expression<number>,
    0,
    message,
    block as () => T | Promise<T>,
  );
}

export async function assertChanges<T>(
  expression: Expression<unknown>,
  message: string | null = null,
  { from = UNTRACKED, to = UNTRACKED }: { from?: unknown; to?: unknown } = {},
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  const exp = expression;

  const before = await exp();
  const retval = await _assertNothingRaisedOrWarn("assert_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected change from ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp();

  const richMessage = () => {
    let error = `\`${_callableToSourceString(expression)}\` didn't change`;
    if (Object.is(before, to)) error = `${error}. It was already ${inspect(to)}`;
    if (message) error = `${message}.\n${error}`;
    return error;
  };
  refuteEqual(before, after, richMessage);

  if (to !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected change to ${inspect(to)}, got ${inspect(after)}\n`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(to, after), richMessage);
  }

  return retval;
}

export async function assertNoChanges<T>(
  expression: Expression<unknown>,
  message: string | null = null,
  { from = UNTRACKED }: { from?: unknown } = {},
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  const exp = expression;

  const before = await exp();
  const retval = await _assertNothingRaisedOrWarn("assert_no_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected initial value of ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp();

  const richMessage = () => {
    let error = `\`${_callableToSourceString(expression)}\` changed`;
    if (message) error = `${message}.\n${error}`;
    return error;
  };

  if (before === null || before === undefined) {
    assertNil(after, richMessage);
  } else {
    assertEqual(before, after, richMessage);
  }

  return retval;
}

/** @internal */
export async function _assertNothingRaisedOrWarn<T>(
  assertion: string,
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  if (!block) return undefined;
  try {
    return await assertNothingRaised(block);
  } catch (e) {
    if (!(e instanceof UnexpectedError)) throw e;

    const logger = taggedLogger();
    if (logger && (logger as { "warn?"?: boolean })["warn?"]) {
      const warning =
        `${_testCaseIdentity()}: ${classNameOf(e.error)} raised.\n` +
        "If you expected this exception, use `assert_raises` as near to the code that raises as possible.\n" +
        `Other block based assertions (e.g. \`${assertion}\`) can be used, as long as \`assert_raises\` is inside their block.\n`;
      logger.warn(warning);
    }

    throw e;
  }
}

/** @internal */
function _callableToSourceString(callable: unknown): string {
  const source = String(callable);
  const match = /^(?:async\s+)?\(\s*\)\s*=>\s*([\s\S]+)$/.exec(source.trim());
  if (!match) return source;

  let body = match[1].trim();
  if (body.startsWith("{")) {
    body = body.replace(/\}$/, "").replace(/^\{/, "").trim();
    body = body
      .replace(/^return\s+/, "")
      .replace(/;$/, "")
      .trim();
  }
  if (!body.includes("\n")) return body;

  return source;
}

/** @noRailsEquivalent PERMANENT */
export function assert(value: boolean, message: string | (() => string) = ""): void {
  if (!value) throw new Assertion(typeof message === "function" ? message() : message);
}

/** @noRailsEquivalent PERMANENT */
export function assertPredicate<T>(
  actual: T,
  predicate: (value: T) => unknown,
  message?: string,
): void {
  const result = predicate(actual);
  assert(
    result != null && result !== false,
    message ?? `Expected ${inspect(actual)} to satisfy the predicate`,
  );
}

/** @noRailsEquivalent PERMANENT */
export function assertNotPredicate<T>(
  actual: T,
  predicate: (value: T) => unknown,
  message?: string,
): void {
  const result = predicate(actual);
  assert(
    result == null || result === false,
    message ?? `Expected ${inspect(actual)} to not satisfy the predicate`,
  );
}

/** @noRailsEquivalent PERMANENT */
export function assertRespondTo(actual: unknown, name: string, message?: string): void {
  assert(name in Object(actual), message ?? `Expected ${inspect(actual)} to respond to ${name}`);
}

/** @noRailsEquivalent PERMANENT */
export function assertNotRespondTo(actual: unknown, name: string, message?: string): void {
  assert(
    !(name in Object(actual)),
    message ?? `Expected ${inspect(actual)} to not respond to ${name}`,
  );
}

/** @noRailsEquivalent PERMANENT */
export function assertEmpty(actual: unknown, message?: string): void {
  assert(collectionSize(actual) === 0, message ?? `Expected ${inspect(actual)} to be empty`);
}

/** @noRailsEquivalent PERMANENT */
export function assertNotEmpty(actual: unknown, message?: string): void {
  assert(collectionSize(actual) !== 0, message ?? `Expected ${inspect(actual)} to not be empty`);
}

function collectionSize(actual: unknown): number {
  const collection = actual as { length?: number; size?: number };
  if (typeof collection?.length === "number") return collection.length;
  if (typeof collection?.size === "number") return collection.size;
  return Object.keys(actual as object).length;
}

/** @noRailsEquivalent PERMANENT */
export function assertSame(expected: unknown, actual: unknown, message?: string): void {
  assert(
    Object.is(expected, actual),
    message ?? `Expected ${inspect(actual)} to be the same as ${inspect(expected)}`,
  );
}

/** @noRailsEquivalent PERMANENT */
export function assertNotSame(expected: unknown, actual: unknown, message?: string): void {
  assert(
    !Object.is(expected, actual),
    message ?? `Expected ${inspect(actual)} to not be the same as ${inspect(expected)}`,
  );
}

function assertEqual(expected: unknown, actual: unknown, message: () => string): void {
  assert(deepEqual(expected, actual), message);
}

function refuteEqual(expected: unknown, actual: unknown, message: () => string): void {
  assert(!deepEqual(expected, actual), message);
}

function assertNil(actual: unknown, message: () => string): void {
  assert(actual === null || actual === undefined, message);
}

function assertMatch(match: RegExp | string, actual: string): void {
  const matched = typeof match === "string" ? actual.includes(match) : match.test(actual);
  assert(matched, `Expected ${inspect(actual)} to match ${String(match)}`);
}

function caseEqual(expected: unknown, actual: unknown): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (typeof expected === "function") return actual instanceof (expected as new () => unknown);
  return deepEqual(expected, actual);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  return String(value);
}
