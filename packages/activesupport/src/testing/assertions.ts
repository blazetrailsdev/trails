/**
 * Mirrors: active_support/testing/assertions.rb
 *
 * Rails accepts a String expression and `eval`s it against the block's
 * binding. TypeScript has no binding to eval against, so every expression here
 * is a callable — the arm Rails documents as `-> { Article.count }`. Blocks may
 * be async (trails' `count` is), so each assertion returns a Promise and awaits
 * both the expression and the block.
 */
import { indexWith } from "../enumerable-utils.js";

/** Mirrors `Minitest::Assertion` — the error a failed assertion raises. */
class Assertion extends Error {
  override name = "Assertion";
}

/** :nodoc: */
export const UNTRACKED: unique symbol = Symbol("UNTRACKED");

type Expression<T> = () => T | Promise<T>;

/**
 * Asserts that an expression is not truthy. Passes if `object` is `nil` or
 * `false`.
 *
 *   assert_not nil    # => true
 *   assert_not false  # => true
 *   assert_not 'foo'  # => Expected "foo" to be nil or false
 */
export function assertNot(object: unknown, message?: string | null): void {
  message ||= `Expected ${inspect(object)} to be nil or false`;
  assert(!(object != null && object !== false), message);
}

/**
 * Asserts that a block raises one of `exp`. This is an enhancement of the
 * standard assertion method with the ability to test error messages.
 *
 *   assert_raises(ArgumentError, match: /incorrect param/i) do
 *     perform_service(param: 'exception')
 *   end
 *
 * Ruby's `*exp` splat is an array here: a TS rest parameter cannot precede the
 * `match` kwarg and the block, which Ruby takes after it.
 */
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

/** Alias of {@link assertRaises}. */
export async function assertRaise(
  exp: (new (...args: any[]) => Error)[],
  options: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<Error> {
  return assertRaises(exp, options, block);
}

/**
 * Assertion that the block should not raise an exception.
 *
 * Passes if evaluated code in the yielded block raises no exception.
 */
export async function assertNothingRaised<T>(block: () => T | Promise<T>): Promise<T> {
  const retval = await block();
  assert(true, "");
  return retval;
}

/**
 * Test numeric difference between the return value of an expression as a
 * result of what is evaluated in the yielded block.
 *
 *   assert_difference ->{ Article.count } do
 *     post :create, params: { article: {...} }
 *   end
 *
 * An arbitrary positive or negative difference can be specified. The default
 * is +1+. A list of expressions, or a Map of expression => difference, can be
 * passed in place of a single expression.
 *
 * Ruby reads `*args` positionally: `args[0]` is the message when `expression`
 * is a Hash, and the difference (with `args[1]` the message) otherwise. The
 * rest parameter here carries the same positions, with the block last — Ruby
 * takes it as a block rather than in `*args`.
 *
 * @missingRailsCall map — `expressions.keys.map` (assertions.rb:112-114) exists
 * only to turn a String expression into `lambda { eval(e, block.binding) }`.
 * Every expression here is already a callable (see this file's header), so the
 * block is the identity and Rails' `map` has nothing left to do.
 */
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

/**
 * Assertion that the numeric result of evaluating an expression is not
 * changed before and after invoking the passed in block.
 */
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

/**
 * Assertion that the result of evaluating an expression is changed before
 * and after invoking the passed in block.
 *
 *   assert_changes -> { Status.all_good? } do
 *     post :create, params: { status: { ok: false } }
 *   end
 */
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

/**
 * Assertion that the result of evaluating an expression is not changed before
 * and after invoking the passed in block.
 */
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
/**
 * Rails re-raises after warning through `tagged_logger` when the block raised
 * (`assertions.rb:281-294`). The warning describes a `Minitest::UnexpectedError`
 * wrapper that {@link assertNothingRaised} does not create here, so the rescue
 * arm has nothing to catch and the error propagates as Rails re-raises it.
 *
 * @internal
 */
async function _assertNothingRaisedOrWarn<T>(
  _assertion: string,
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  if (!block) return undefined;
  return assertNothingRaised(block);
}

/**
 * Ruby reads the callable's source through `RubyVM::InstructionSequence`;
 * `Function#toString` is the JS equivalent and needs no fallback.
 *
 * @internal
 */
function _callableToSourceString(callable: unknown): string {
  return String(callable);
}

function assert(value: boolean, message: string | (() => string)): void {
  if (!value) throw new Assertion(typeof message === "function" ? message() : message);
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

/** Ruby's `===`: a RegExp matches, a class is an instanceof, anything else `==`. */
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
