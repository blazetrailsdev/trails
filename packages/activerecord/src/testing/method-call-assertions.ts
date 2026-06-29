/**
 * Method-call assertions — test helpers for asserting whether a method is
 * invoked on instances of a class during a block.
 *
 * Mirrors: ActiveSupport::Testing::MethodCallAssertions
 * (activesupport/lib/active_support/testing/method_call_assertions.rb)
 */
// This is a test-assertion helper: a failed assertion raises a bare Error the
// way Minitest raises Minitest::Assertion, so the rails-error-parity rule
// (which governs ported domain error classes) does not apply here.
/* eslint-disable blazetrails/rails-error-parity */

/** A constructor-like value with a prototype we can spy on. */
type ClassLike = { prototype: object; name: string };

interface FoundDescriptor {
  owner: object;
  descriptor: PropertyDescriptor;
}

function findDescriptor(proto: object, name: string): FoundDescriptor | null {
  let current: object | null = proto;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return { owner: current, descriptor };
    current = Object.getPrototypeOf(current);
  }
  return null;
}

/**
 * Replace `methodName` on `klass.prototype` with a spy that counts calls and
 * delegates to the original implementation (supporting both plain methods and
 * accessor getters), runs `block`, then restores the prototype. Returns the
 * number of times the member was accessed/called.
 */
async function countInstanceCalls(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
): Promise<number> {
  const proto = klass.prototype;
  const found = findDescriptor(proto, methodName);
  if (!found) {
    throw new Error(`${klass.name} has no method or accessor named ${methodName}`);
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, methodName);
  const ownDescriptor = Object.getOwnPropertyDescriptor(proto, methodName);
  const original = found.descriptor;

  let count = 0;
  const spy: PropertyDescriptor = { configurable: true, enumerable: original.enumerable };
  if (typeof original.get === "function") {
    const originalGet = original.get;
    spy.get = function (this: unknown) {
      count += 1;
      return originalGet.call(this);
    };
    if (original.set) spy.set = original.set;
  } else if (typeof original.value === "function") {
    const originalFn = original.value as (...args: unknown[]) => unknown;
    spy.writable = original.writable;
    spy.value = function (this: unknown, ...args: unknown[]) {
      count += 1;
      return originalFn.apply(this, args);
    };
  } else {
    throw new Error(`${klass.name}#${methodName} is not a callable method or getter`);
  }

  Object.defineProperty(proto, methodName, spy);
  try {
    await block();
  } finally {
    if (hadOwn && ownDescriptor) {
      Object.defineProperty(proto, methodName, ownDescriptor);
    } else {
      delete (proto as Record<string, unknown>)[methodName];
    }
  }
  return count;
}

/**
 * Assert that `methodName` is NOT invoked on any instance of `klass` during
 * `block`.
 *
 * Mirrors: assert_not_called_on_instance_of(klass, method_name, &block)
 */
export async function assertNotCalledOnInstanceOf(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
): Promise<void> {
  const count = await countInstanceCalls(klass, methodName, block);
  if (count > 0) {
    throw new Error(
      `Expected ${klass.name}#${methodName} to not be called, but was called ${count} time(s).`,
    );
  }
}

/**
 * Assert that `methodName` IS invoked on an instance of `klass` during `block`.
 *
 * Mirrors: assert_called_on_instance_of(klass, method_name, times:, &block)
 */
export async function assertCalledOnInstanceOf(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
  times = 1,
): Promise<void> {
  const count = await countInstanceCalls(klass, methodName, block);
  if (count !== times) {
    throw new Error(
      `Expected ${klass.name}#${methodName} to be called ${times} time(s), but was called ${count} time(s).`,
    );
  }
}
