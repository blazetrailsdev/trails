import { rbEqual } from "@blazetrails/ruby-compat";
import { assert } from "./assertions.js";

/** @noRailsEquivalent PERMANENT */
export class MockExpectationError extends Error {
  override name = "MockExpectationError";
}

interface Mock {
  expected: unknown[][];
  returns: unknown;
  calls: unknown[][];
}

/** @internal */
export function assertCalled<T extends object>(
  object: T,
  methodName: keyof T & string,
  message: string | null,
  { times = 1, returns = null }: { times?: number; returns?: unknown } = {},
  block?: () => void | Promise<void>,
): void | Promise<void> {
  let timesCalled = 0;

  const check = () => {
    let error = `Expected ${methodName} to be called ${times} times, but was called ${timesCalled} times`;
    if (message) error = `${message}.\n${error}`;
    assertEqual(times, timesCalled, error);
  };

  const result = stub(
    object,
    methodName,
    () => {
      timesCalled += 1;
      return returns;
    },
    block,
  );
  if (result) return result.then(check);
  check();
}

/**
 * @internal
 * @missingRailsCall new — PERMANENT
 */
export function assertCalledWith<T extends object>(
  object: T,
  methodName: keyof T & string,
  args: unknown[],
  { returns = false }: { returns?: unknown } = {},
  block?: () => void | Promise<void>,
): void | Promise<void> {
  const mock: Mock = { expected: [], returns, calls: [] };
  expectCalledWith(mock, args, { returns });

  const result = stub(
    object,
    methodName,
    (...called: unknown[]) => {
      if (!mock.expected[mock.calls.length]) {
        throw new MockExpectationError(
          `No more expects available for :${methodName}: ${called.map(String).join(", ")}`,
        );
      }
      mock.calls.push(called);
      return mock.returns;
    },
    block,
  );

  if (result) return result.then(() => assertMock(mock));
  assertMock(mock);
}

/** @internal */
export function assertNotCalled<T extends object>(
  object: T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void | Promise<void>,
): void | Promise<void> {
  return assertCalled(object, methodName, message, { times: 0 }, block);
}

/** @internal */
export function expectCalledWith(
  mock: Mock,
  args: unknown[],
  { returns = false }: { returns?: unknown } = {},
): void {
  mock.expected.push(args);
  mock.returns = returns;
}

/** @internal */
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

/** @internal */
export function assertNotCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void,
): void {
  assertCalledOnInstanceOf(klass, methodName, message, { times: 0 }, block);
}

/** @internal */
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
  block?: () => void | Promise<void>,
): Promise<void> | undefined {
  const original = object[methodName];
  const restore = () => {
    (object as Record<string, unknown>)[methodName] = original;
  };
  (object as Record<string, unknown>)[methodName] = replacement;
  let result: void | Promise<void>;
  try {
    result = block?.();
  } catch (e) {
    restore();
    throw e;
  }
  if (result && typeof result.then === "function") {
    return result.finally(restore);
  }
  restore();
  return undefined;
}

function assertMock(mock: Mock): void {
  for (const [index, expected] of mock.expected.entries()) {
    const actual = mock.calls[index];
    if (!actual) {
      throw new MockExpectationError(
        `Expected call with ${JSON.stringify(expected)}, but it was never called`,
      );
    }
    if (
      actual.length !== expected.length ||
      expected.some((arg, i) => !rbEqual(arg, actual[i]))
    ) {
      throw new MockExpectationError(
        `Expected call with ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
  assert(true);
}

function assertEqual(expected: unknown, actual: unknown, message: string): void {
  assert(
    Object.is(expected, actual),
    () => `${message}.\nExpected: ${expected}\n  Actual: ${actual}`,
  );
}
