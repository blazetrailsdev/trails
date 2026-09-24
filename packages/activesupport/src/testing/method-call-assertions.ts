import { ArgumentError, NameError, rbEqual, rbInspect } from "@blazetrails/ruby-compat";
import { assert } from "./assertions.js";

/** @noRailsEquivalent PERMANENT */
export class MockExpectationError extends Error {
  override name = "MockExpectationError";
}

interface MockCall {
  retval: unknown;
  args: unknown[];
}

class Mock {
  expected: MockCall[] = [];
  calls: MockCall[] = [];
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

/** @internal */
export function assertCalledWith<T extends object>(
  object: T,
  methodName: keyof T & string,
  args: unknown[],
  { returns = false }: { returns?: unknown } = {},
  block?: () => void | Promise<void>,
): void | Promise<void> {
  const mock = new Mock();
  expectCalledWith(mock, args, { returns });

  const result = stub(object, methodName, (...called: unknown[]) => mockCall(mock, called), block);

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
  mock.expected.push({ retval: returns, args });
}

/** @internal */
export function assertCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  methodName: keyof T & string,
  message: string | null,
  { times = 1, returns = null }: { times?: number; returns?: unknown } = {},
  block?: () => void | Promise<void>,
): void | Promise<void> {
  let timesCalled = 0;
  const stubbed = function () {
    timesCalled += 1;

    return returns;
  };

  const proto = klass.prototype as object;
  const original = Object.getOwnPropertyDescriptor(proto, methodName);
  let inherited: PropertyDescriptor | undefined;
  for (let p = proto; !inherited && p; p = Object.getPrototypeOf(p)) {
    inherited = Object.getOwnPropertyDescriptor(p, methodName);
  }
  if (!inherited) {
    throw new NameError(`undefined method '${methodName}' for class '${klass.name}'`, methodName);
  }
  Object.defineProperty(
    proto,
    methodName,
    inherited.get
      ? { configurable: true, get: stubbed, set: inherited.set }
      : { configurable: true, writable: true, value: stubbed },
  );
  const ensure = () => {
    if (original) Object.defineProperty(proto, methodName, original);
    else delete (proto as Record<string, unknown>)[methodName];
  };

  const check = () => {
    let error = `Expected ${methodName} to be called ${times} times, but was called ${timesCalled} times`;
    if (message) error = `${message}.\n${error}`;

    assertEqual(times, timesCalled, error);
  };

  let result: void | Promise<void>;
  try {
    result = block?.();
  } catch (e) {
    ensure();
    throw e;
  }
  if (result && typeof result.then === "function") {
    return result.then(check).finally(ensure);
  }
  try {
    check();
  } finally {
    ensure();
  }
}

/** @internal */
export function assertNotCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  methodName: keyof T & string,
  message: string | null,
  block?: () => void | Promise<void>,
): void | Promise<void> {
  return assertCalledOnInstanceOf(klass, methodName, message, { times: 0 }, block);
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

function mockCall(mock: Mock, args: unknown[]): unknown {
  const sym = ":call";
  const index = mock.calls.length;
  const expectedCall = mock.expected[index];

  if (!expectedCall) {
    throw new MockExpectationError(
      `No more expects available for ${rbInspect(sym)}: ${rbInspect(args)} ${rbInspect({})}`,
    );
  }

  const { args: expectedArgs, retval } = expectedCall;

  if (expectedArgs.length !== args.length) {
    throw new ArgumentError(
      `mocked method ${rbInspect(sym)} expects ${expectedArgs.length} arguments, got ${rbInspect(args)}`,
    );
  }

  const fullyMatched = expectedArgs.every(
    (mod, i) => caseEqual(mod, args[i]) || rbEqual(mod, args[i]),
  );

  if (!fullyMatched) {
    throw new MockExpectationError(
      `mocked method ${rbInspect(sym)} called with unexpected arguments ${rbInspect(args)}`,
    );
  }

  mock.calls.push({
    retval,
    args: expectedArgs.map((e, i) => (caseEqual(e, args[i]) ? e : args[i])),
  });

  return retval;
}

function mockCallToS(name: string, data: MockCall | MockCall[]): string {
  if (Array.isArray(data)) return data.map((d) => mockCallToS(name, d)).join(", ");
  const args = rbInspect(data.args).slice(1, -1);
  return `${name}(${args}) => ${rbInspect(data.retval)}`;
}

function verify(mock: Mock): true {
  const name = "call";
  const expected = mock.expected;
  const actual = mock.calls.length > 0 ? mock.calls : null;
  if (!actual) throw new MockExpectationError(`Expected ${mockCallToS(name, expected[0])}`);
  if (actual.length < expected.length) {
    throw new MockExpectationError(
      `Expected ${mockCallToS(name, expected[actual.length])}, got [${mockCallToS(name, actual)}]`,
    );
  }
  return true;
}

function assertMock(mock: Mock): void {
  try {
    assert(verify(mock));
  } catch (e) {
    if (!(e instanceof MockExpectationError)) throw e;
    assert(false, e.message);
  }
}

function caseEqual(expected: unknown, actual: unknown): boolean {
  const matcher = expected as { caseEquals?: unknown } | null | undefined;
  if (typeof matcher?.caseEquals === "function") {
    return (matcher as { caseEquals(value: unknown): boolean }).caseEquals(actual);
  }
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (typeof expected === "function") {
    if (expected.prototype === undefined) {
      const result: unknown = expected(actual);
      return result != null && result !== false;
    }
    return actual instanceof expected;
  }
  return rbEqual(expected, actual);
}

function assertEqual(expected: unknown, actual: unknown, message: string): void {
  assert(
    Object.is(expected, actual),
    () => `${message}.\nExpected: ${expected}\n  Actual: ${actual}`,
  );
}
