import { indexWith } from "../enumerable-utils.js";

import {
  Dir,
  RbConfig,
  Tempfile,
  env,
  getChildProcess,
  rbAnyToS,
  rbEqual,
  rbObjClass,
  rbStrRespondTo,
  stderr,
  verbose,
} from "@blazetrails/ruby-compat";
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
  static MT_RE = /node_modules[/\\]@?vitest|node:internal(?!\/process\/task_queues)/;

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
  VERSION: string;
  backtraceFilter: { filter(bt: string[] | null): string[] };
  filterBacktrace(bt: string[] | null): string[];
} = {
  VERSION: "5.27.0",
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
      const message = Object.hasOwn(this.error, "message")
        ? this.error.message
        : classNameOf(this.error);
      return `${classNameOf(this.error)}: ${message}\n    ${bt}`;
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

export function assertNot(object: unknown, message?: string | (() => string) | null): true {
  message ||= () => `Expected ${inspect(object)} to be nil or false`;
  return assert(!(object != null && object !== false), message);
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
    if (!exp.some((klass) => e instanceof klass) && e instanceof Assertion) throw e;
    error = e as Error;
  }
  if (!error)
    throw new Assertion(`${exp.map((e) => e.name).join(", ")} expected but nothing was raised`);
  if (!exp.some((klass) => error instanceof klass)) {
    assert(false, `${exp.map((e) => e.name).join(", ")} expected, not ${error.name}`);
  }
  assert(true);
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
  const exp = expression as unknown as { call(): unknown };

  const before = await exp.call();
  const retval = await _assertNothingRaisedOrWarn("assert_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected change from ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp.call();

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
  const exp = expression as unknown as { call(): unknown };

  const before = await exp.call();
  const retval = await _assertNothingRaisedOrWarn("assert_no_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected initial value of ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp.call();

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
  if (typeof callable !== "function" || !match) return rbAnyToS(callable as object);

  let body = match[1].trim();
  if (body.startsWith("{")) {
    body = body.replace(/\}$/, "").replace(/^\{/, "").trim();
    body = body
      .replace(/^return\s+/, "")
      .replace(/;$/, "")
      .trim();
  }
  if (!body.includes("\n")) return body;

  return rbAnyToS(callable as object);
}

let _assertions = 0;

/** @internal */
export function _takeAssertions(): number {
  const count = _assertions;
  _assertions = 0;
  return count;
}

/** @noRailsEquivalent PERMANENT */
export function assert(value: unknown, message: string | (() => string) | null = null): true {
  _assertions += 1;
  if (value == null || value === false) {
    message ||= `Expected ${inspect(value)} to be truthy.`;
    if (typeof message === "function") message = message();
    throw new Assertion(message);
  }
  return true;
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
  assert(
    respondsTo(Object(actual), name),
    message ?? `Expected ${inspect(actual)} to respond to ${name}`,
  );
}

/** @noRailsEquivalent PERMANENT */
export function assertNotRespondTo(actual: unknown, name: string, message?: string): void {
  assert(
    !respondsTo(Object(actual), name),
    message ?? `Expected ${inspect(actual)} to not respond to ${name}`,
  );
}

export function assertInDelta(exp: number, act: number, delta: number = 0.001, msg?: string): void {
  const n = Math.abs(exp - act);
  assert(delta >= n, msg ?? `Expected |${exp} - ${act}| (${n}) to be <= ${delta}`);
}

function respondsTo(object: object, name: string): boolean {
  if (Object.getPrototypeOf(object) === String.prototype) {
    return rbStrRespondTo(object.valueOf() as string, name);
  }
  const override = findDescriptor(object, "respondTo");
  if (override && typeof override.value === "function") {
    return (override.value as (name: string) => unknown).call(object, name) !== false;
  }
  if (name in object) {
    const descriptor = findDescriptor(object, name);
    if (descriptor && "value" in descriptor && descriptor.value === undefined) return false;
    return !(descriptor && descriptor.set !== undefined && descriptor.get === undefined);
  }
  if (!name.endsWith("=")) return false;
  const descriptor = findDescriptor(object, name.slice(0, -1));
  return descriptor?.set !== undefined;
}

function findDescriptor(object: object, name: string): PropertyDescriptor | undefined {
  for (let o: object | null = object; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, name);
    if (descriptor) return descriptor;
  }
  return undefined;
}

/** @noRailsEquivalent PERMANENT */
export function assertEmpty(actual: unknown, message?: string): void {
  assert(isEmptyCollection(actual), message ?? `Expected ${inspect(actual)} to be empty`);
}

/** @noRailsEquivalent PERMANENT */
export function assertNotEmpty(actual: unknown, message?: string): void {
  assert(!isEmptyCollection(actual), message ?? `Expected ${inspect(actual)} to not be empty`);
}

/** @noRailsEquivalent CONVERGEABLE assert-includes-receipt-is-a-scoring-gap-not-permanent */
export function assertIncludes(collection: unknown, obj: unknown, message?: string): void {
  assert(respondsToInclude(collection), `Expected ${inspect(collection)} to respond to include?`);
  assert(
    collectionIncludes(collection, obj),
    message ?? `Expected ${inspect(collection)} to include ${inspect(obj)}`,
  );
}

export function assertNotIncludes(collection: unknown, obj: unknown, message?: string): void {
  assert(respondsToInclude(collection), `Expected ${inspect(collection)} to respond to include?`);
  assertNot(
    collectionIncludes(collection, obj),
    message ?? `Expected ${inspect(collection)} to not include ${inspect(obj)}`,
  );
}

function respondsToInclude(collection: unknown): boolean {
  if (typeof collection === "string" || Array.isArray(collection)) return true;
  const target = collection as { include?: unknown; isInclude?: unknown; has?: unknown };
  return (
    typeof target?.include === "function" ||
    typeof target?.isInclude === "function" ||
    typeof target?.has === "function"
  );
}

function collectionIncludes(collection: unknown, obj: unknown): boolean {
  if (typeof collection === "string") return collection.includes(obj as string);
  if (Array.isArray(collection)) return collection.some((element) => rbEqual(element, obj));
  const target = collection as {
    include?: (obj: never) => boolean;
    isInclude?: (obj: never) => boolean;
    has?: (obj: never) => boolean;
  };
  if (typeof target.isInclude === "function") return target.isInclude(obj as never);
  if (typeof target.include === "function") return target.include(obj as never);
  if (typeof target.has === "function") return target.has(obj as never);
  return false;
}

function isEmptyCollection(actual: unknown): boolean {
  const collection = actual as { isEmpty?: () => boolean };
  if (typeof collection?.isEmpty === "function") return collection.isEmpty();
  return collectionSize(actual) === 0;
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

function diff(exp: unknown, act: unknown): string {
  let result = "";

  const [expect, butwas] = thingsToDiff(exp, act);

  if (expect == null) return `Expected: ${inspect(exp)}\n  Actual: ${inspect(act)}`;

  Tempfile.create("expect", undefined, (a) => {
    a.puts(expect);

    Tempfile.create("butwas", undefined, (b) => {
      b.puts(butwas);

      const [cmd, ...args] = assertionsDiff()!.split(" ");
      result = getChildProcess().spawnSync(cmd, [...args, a.path()!, b.path()!]).stdout;
      result = result.replace(/^--- .+/m, "--- expected");
      result = result.replace(/^\+\+\+ .+/m, "+++ actual");

      if (result === "") {
        const klass = rbObjClass(exp);
        result = [
          `No visible difference in the ${klass}#inspect output.\n`,
          "You should look at the implementation of #== on ",
          `${klass} or its members.\n`,
          expect,
        ].join("");
      }
    });
  });

  return result;
}

function thingsToDiff(exp: unknown, act: unknown): [string, string] | [null, null] {
  const expect = muPpForDiff(exp);
  const butwas = muPpForDiff(act);

  const [e1, e2] = [expect.includes("\n"), expect.includes("\\n")];
  const [b1, b2] = [butwas.includes("\n"), butwas.includes("\\n")];

  const needToDiff =
    (e1 !== e2 || b1 !== b2 || expect.length > 30 || butwas.length > 30 || expect === butwas) &&
    assertionsDiff();

  return needToDiff ? [expect, butwas] : [null, null];
}

let _diff: string | null | undefined;

function assertionsDiff(): string | null {
  if (_diff !== undefined) return _diff;

  const system = (cmd: string) =>
    getChildProcess().spawnSync(cmd, [Dir.pwd(), Dir.pwd()]).status === 0;
  _diff =
    /mswin|mingw/.test(RbConfig.CONFIG.host_os) && system("diff.exe")
      ? "diff.exe -u"
      : system("gdiff")
        ? "gdiff -u"
        : system("diff")
          ? "diff -u"
          : null;
  return _diff;
}

function muPpForDiff(obj: unknown): string {
  const str = inspect(obj);

  const single = /(?<!\\|^)\\n/m.test(str);
  const double = /(?<=\\|^)\\n/m.test(str);

  const process =
    single !== double
      ? single
        ? (s: string) => (s === "\\n" ? "\n" : s)
        : (s: string) => (s === "\\\\n" ? "\\n\n" : s)
      : (s: string) => s;

  return str.replace(/\\?\\n/g, process).replace(/:0x[a-fA-F0-9]{4,}/gm, ":0xXXXXXX");
}

function message(
  msg: string | (() => string) | null,
  ending: string | null,
  defaultMessage: () => string,
): () => string {
  return () => {
    if (typeof msg === "function") msg = msg().replace(/\.$/, "");
    const customMessage = msg == null || msg === "" ? "" : `${msg}.\n`;
    return `${customMessage}${defaultMessage()}${ending ?? "."}`;
  };
}

function refute(test: unknown, msg: string | (() => string) | null = null): true {
  msg ||= message(null, null, () => `Expected ${inspect(test)} to not be truthy`);
  return assert(test == null || test === false, msg);
}

const E = "";

function assertEqual(exp: unknown, act: unknown, msg: string | (() => string) | null = null): true {
  msg = message(msg, E, () => diff(exp, act));
  const result = assert(deepEqual(exp, act), msg);

  if (exp == null) {
    if (Minitest.VERSION >= "6") {
      refuteNil(exp, "Use assert_nil if expecting nil.");
    } else if (verbose() != null) {
      stderr.write("DEPRECATED: Use assert_nil if expecting nil. This will fail in Minitest 6.\n");
    }
  }

  return result;
}

function refuteEqual(exp: unknown, act: unknown, msg: string | (() => string) | null = null): true {
  msg = message(msg, null, () => `Expected ${inspect(act)} to not be equal to ${inspect(exp)}`);
  return refute(deepEqual(exp, act), msg);
}

/** @noRailsEquivalent PERMANENT */
export function assertNil(obj: unknown, msg: string | (() => string) | null = null): true {
  msg = message(msg, null, () => `Expected ${inspect(obj)} to be nil`);
  return assert(obj == null, msg);
}

function refuteNil(obj: unknown, msg: string | (() => string) | null = null): true {
  msg = message(msg, null, () => `Expected ${inspect(obj)} to not be nil`);
  return refute(obj == null, msg);
}

export function assertNotNil(obj: unknown, msg: string | (() => string) | null = null): true {
  return refuteNil(obj, msg);
}

function assertMatch(
  matcher: RegExp | string,
  obj: string,
  msg: string | (() => string) | null = null,
): void {
  const m = message(msg, null, () => `Expected ${inspect(matcher)} to match ${inspect(obj)}`);
  const matched = typeof matcher === "string" ? obj.includes(matcher) : matcher.test(obj);
  assert(matched, m);
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
  if (value instanceof RegExp) return String(value);
  if (value === null || value === undefined) return "nil";
  try {
    return String(value);
  } catch {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  }
}
