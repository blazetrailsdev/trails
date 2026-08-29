/* eslint-disable blazetrails/rails-error-parity */

type ClassLike = { prototype: object; name: string };

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

export async function assertNotCalledOnInstanceOf(
  klass: ClassLike,
  methodName: string,
  block: () => void | Promise<void>,
  message?: string,
): Promise<void> {
  await assertCalledOnInstanceOf(klass, methodName, block, { times: 0, message });
}
