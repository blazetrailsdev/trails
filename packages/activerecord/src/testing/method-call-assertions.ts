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

/** A constructor-like value with a prototype we can stub on. */
type ClassLike = { prototype: object; name: string };

/** Mirrors the Ruby keyword args of `assert_called_on_instance_of`. */
export interface CallAssertionOptions {
  times?: number;
  returns?: unknown;
  message?: string;
}

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
 * Replace `methodName` on `klass.prototype` with a stub that counts calls and
 * returns `returns` (it does NOT call the original — matching Rails'
 * `define_method("stubbed_#{method_name}")`), run `block`, then restore the
 * prototype. Supports both plain methods and accessor getters. Returns the
 * number of times the member was accessed/called.
 *
 * Mirrors the stub-and-restore body of `assert_called_on_instance_of`, where
 * Rails aliases the original away, installs the stub, yields, and restores in
 * an `ensure` block.
 */
async function countInstanceCalls(
  klass: ClassLike,
  methodName: string,
  returns: unknown,
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
  const stub: PropertyDescriptor = { configurable: true, enumerable: original.enumerable };
  if (typeof original.get === "function") {
    stub.get = function () {
      count += 1;
      return returns;
    };
    if (original.set) stub.set = original.set;
  } else if (typeof original.value === "function") {
    stub.writable = original.writable;
    stub.value = function () {
      count += 1;
      return returns;
    };
  } else {
    throw new Error(`${klass.name}#${methodName} is not a callable method or getter`);
  }

  Object.defineProperty(proto, methodName, stub);
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
 * Assert that `methodName` is invoked exactly `times` (default 1) on instances
 * of `klass` during `block`.
 *
 * Mirrors: assert_called_on_instance_of(klass, method_name, message, times:, returns:, &block)
 */
export async function assertCalledOnInstanceOf(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
  { times = 1, returns = null, message }: CallAssertionOptions = {},
): Promise<void> {
  const count = await countInstanceCalls(klass, methodName, returns, block);
  if (count !== times) {
    let error = `Expected ${methodName} to be called ${times} times, but was called ${count} times`;
    if (message) error = `${message}.\n${error}`;
    throw new Error(error);
  }
}

/**
 * Assert that `methodName` is NOT invoked on any instance of `klass` during
 * `block`.
 *
 * Mirrors: assert_not_called_on_instance_of(klass, method_name, message, &block)
 */
export async function assertNotCalledOnInstanceOf(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
  message?: string,
): Promise<void> {
  await assertCalledOnInstanceOf(klass, methodName, block, { times: 0, message });
}
