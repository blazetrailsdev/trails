/**
 * Mirrors: active_support/testing/method_call_assertions.rb
 *
 * Ruby's `object.stub(method_name, ...) { ... }` (Minitest::Mock) swaps a
 * singleton method for the duration of the block; the TS equivalent is an own
 * property assignment restored in a `finally`, and the `Minitest::Mock` of
 * `assert_called_with` is the recorded call list compared against `args`.
 */

/** Mirrors `Minitest::Assertion` — the error a failed assertion raises. */
class Assertion extends Error {
  override name = "Assertion";
}

interface Mock {
  expected: unknown[][];
  returns: unknown;
  calls: unknown[][];
}

/**
 * Asserts that `methodName` is called on `object` `times` times while `block`
 * runs, stubbing it to return `returns`.
 *
 * @internal
 */
export function assertCalled<T extends object>(
  object: T,
  methodName: keyof T & string,
  message: string | null,
  { times = 1, returns = null }: { times?: number; returns?: unknown } = {},
  block?: () => void,
): void {
  let timesCalled = 0;

  stub(
    object,
    methodName,
    () => {
      timesCalled += 1;
      return returns;
    },
    block,
  );

  let error = `Expected ${methodName} to be called ${times} times, but was called ${timesCalled} times`;
  if (message) error = `${message}.\n${error}`;
  assertEqual(times, timesCalled, error);
}

/**
 * Asserts that `methodName` is called on `object` with `args` while `block`
 * runs.
 *
 * @internal
 */
export function assertCalledWith<T extends object>(
  object: T,
  methodName: keyof T & string,
  args: unknown[],
  { returns = false }: { returns?: unknown } = {},
  block?: () => void,
): void {
  const mock: Mock = { expected: [], returns, calls: [] };
  expectCalledWith(mock, args, { returns });

  stub(
    object,
    methodName,
    (...called: unknown[]) => {
      mock.calls.push(called);
      return mock.returns;
    },
    block,
  );

  assertMock(mock);
}

/**
 * Asserts that `methodName` is never called on `object` while `block` runs.
 *
 * @internal
 */
export function assertNotCalled<T extends object>(
  object: T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void,
): void {
  assertCalled(object, methodName, message, { times: 0 }, block);
}

/**
 * Records the call `mock` is expected to receive.
 *
 * @internal
 */
export function expectCalledWith(
  mock: Mock,
  args: unknown[],
  { returns = false }: { returns?: unknown } = {},
): void {
  mock.expected.push(args);
  mock.returns = returns;
}

/**
 * Asserts that `methodName` is called `times` times on any instance of
 * `klass` while `block` runs.
 *
 * @internal
 */
export function assertCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  methodName: keyof T & string,
  message: string | null,
  { times = 1, returns = null }: { times?: number; returns?: unknown } = {},
  block?: () => void,
): void {
  let timesCalled = 0;
  const originalMethod = klass.prototype[methodName];

  klass.prototype[methodName] = function () {
    timesCalled += 1;
    return returns;
  };

  try {
    block?.();
  } finally {
    klass.prototype[methodName] = originalMethod;
  }

  let error = `Expected ${methodName} to be called ${times} times, but was called ${timesCalled} times`;
  if (message) error = `${message}.\n${error}`;
  assertEqual(times, timesCalled, error);
}

/**
 * Asserts that `methodName` is never called on any instance of `klass`.
 *
 * @internal
 */
export function assertNotCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void,
): void {
  assertCalledOnInstanceOf(klass, methodName, message, { times: 0 }, block);
}

/**
 * Stubs `klass.new` to return `instance` for the duration of `block`
 * (method_call_assertions.rb:64-65).
 *
 * In Ruby `new` is an ordinary class method, so stubbing it redirects every
 * construction of `klass`, however the caller spells it. In JavaScript `new` is
 * an operator on the class object itself, not a property of it, and a class
 * binding cannot be replaced in modules that already imported it — so the stub
 * can only cover the literal `Klass.new()` spelling, which is the direct analog
 * of the Ruby method being stubbed. Code under test that says `new Klass()`
 * still constructs normally; pass the yielded `instance` to it instead.
 *
 * @internal
 */
export function stubAnyInstance<T>(
  klass: { new (...args: any[]): T },
  { instance = new klass() }: { instance?: T } = {},
  block?: (instance: T) => void,
): void {
  const holder = klass as unknown as { new: unknown };
  const original = holder.new;
  holder.new = () => instance;
  try {
    block?.(instance);
  } finally {
    holder.new = original;
  }
}

function stub<T extends object>(
  object: T,
  methodName: keyof T & string,
  replacement: (...args: unknown[]) => unknown,
  block?: () => void,
): void {
  const original = object[methodName];
  (object as Record<string, unknown>)[methodName] = replacement;
  try {
    block?.();
  } finally {
    (object as Record<string, unknown>)[methodName] = original;
  }
}

function assertMock(mock: Mock): void {
  for (const [index, expected] of mock.expected.entries()) {
    const actual = mock.calls[index];
    if (!actual) {
      throw new Assertion(
        `Expected call with ${JSON.stringify(expected)}, but it was never called`,
      );
    }
    if (
      actual.length !== expected.length ||
      expected.some((arg, i) => !Object.is(arg, actual[i]))
    ) {
      throw new Assertion(
        `Expected call with ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
}

function assertEqual(expected: unknown, actual: unknown, message: string): void {
  if (!Object.is(expected, actual)) throw new Assertion(message);
}
