import { Assertion } from "./assertions.js";

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
 * @internal
 * @missingRailsCall new — PERMANENT
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

/** @internal */
export function assertNotCalled<T extends object>(
  object: T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void,
): void {
  assertCalled(object, methodName, message, { times: 0 }, block);
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
      throw new MockExpectationError(
        `Expected call with ${JSON.stringify(expected)}, but it was never called`,
      );
    }
    if (
      actual.length !== expected.length ||
      expected.some((arg, i) => !Object.is(arg, actual[i]))
    ) {
      throw new MockExpectationError(
        `Expected call with ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
}

function assertEqual(expected: unknown, actual: unknown, message: string): void {
  if (!Object.is(expected, actual))
    throw new Assertion(`${message}.\nExpected: ${expected}\n  Actual: ${actual}`);
}
