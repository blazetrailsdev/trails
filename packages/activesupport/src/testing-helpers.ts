/**
 * Testing helpers that mirror Rails ActiveSupport::Testing modules.
 * Provides time travel helpers and method call assertion utilities.
 */

// ── Time Travel ───────────────────────────────────────────────────────────────

let _frozenTime: Date | null = null;
let _timeOffset: number = 0;
let _usingFakeTimers = false;

/**
 * travelTo — sets the current time to the given Date.
 * Use travelBack() to restore.
 */
export function travelTo(time: Date, fn?: () => void): void {
  _frozenTime = new Date(time);
  _timeOffset = time.getTime() - Date.now();
  if (fn) {
    try {
      fn();
    } finally {
      travelBack();
    }
  }
}

/**
 * travel — advances time by the given number of milliseconds.
 */
export function travel(ms: number, fn?: () => void): void {
  const target = new Date(Date.now() + ms);
  travelTo(target, fn);
}

/**
 * freezeTime — freezes the current time (no advancement).
 */
export function freezeTime(fn?: () => void): void {
  travelTo(new Date(), fn);
}

/**
 * travelBack — restores real time.
 */
export function travelBack(): void {
  _frozenTime = null;
  _timeOffset = 0;
}

/**
 * currentTime — returns the current (possibly frozen/traveled) time.
 */
export function currentTime(): Date {
  if (_frozenTime) return new Date(_frozenTime);
  return new Date(Date.now() + _timeOffset);
}

// ── Method Call Assertions ────────────────────────────────────────────────────

export interface AssertCalledOptions {
  times?: number;
  returns?: unknown;
  with?: unknown[];
}

export interface CallRecord {
  args: unknown[];
  returnValue: unknown;
}

/**
 * assertCalled — asserts that a method on an object was called during fn execution.
 * Returns call records.
 */
export function assertCalled<T extends object>(
  object: T,
  method: keyof T,
  options: AssertCalledOptions,
  fn: () => void
): CallRecord[] {
  const calls: CallRecord[] = [];
  const original = object[method] as unknown as (...a: unknown[]) => unknown;

  let returnValue = options.returns;
  (object as any)[method] = (...args: unknown[]) => {
    const rv = returnValue !== undefined ? returnValue : original?.call(object, ...args);
    calls.push({ args, returnValue: rv });
    return rv;
  };

  try {
    fn();
  } finally {
    (object as any)[method] = original;
  }

  const expectedTimes = options.times ?? 1;
  if (calls.length !== expectedTimes) {
    throw new Error(
      `Expected ${String(method)} to be called ${expectedTimes} time(s), but was called ${calls.length} time(s)`
    );
  }

  if (options.with !== undefined) {
    for (const call of calls) {
      const matches = options.with.every((arg, i) => call.args[i] === arg);
      if (!matches) {
        throw new Error(
          `Expected ${String(method)} to be called with ${JSON.stringify(options.with)}, but was called with ${JSON.stringify(call.args)}`
        );
      }
    }
  }

  return calls;
}

/**
 * assertNotCalled — asserts that a method on an object was NOT called during fn execution.
 */
export function assertNotCalled<T extends object>(
  object: T,
  method: keyof T,
  fn: () => void
): void {
  assertCalled(object, method, { times: 0 }, fn);
}

/**
 * assertCalledOnInstanceOf — asserts that a method was called on instances of a class.
 */
export function assertCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  method: keyof T,
  options: AssertCalledOptions,
  fn: () => void
): CallRecord[] {
  const calls: CallRecord[] = [];
  const original = klass.prototype[method as string];
  const returnValue = options.returns;

  klass.prototype[method as string] = function (...args: unknown[]) {
    const rv =
      returnValue !== undefined
        ? returnValue
        : original?.call(this, ...args);
    calls.push({ args, returnValue: rv });
    return rv;
  };

  try {
    fn();
  } finally {
    klass.prototype[method as string] = original;
  }

  const expectedTimes = options.times ?? 1;
  if (calls.length !== expectedTimes) {
    throw new Error(
      `Expected ${String(method)} to be called ${expectedTimes} time(s) on instance of ${klass.name}, but was called ${calls.length} time(s)`
    );
  }

  return calls;
}

/**
 * assertNotCalledOnInstanceOf — asserts a method was NOT called on any instance of a class.
 */
export function assertNotCalledOnInstanceOf<T>(
  klass: new (...args: any[]) => T,
  method: keyof T,
  fn: () => void
): void {
  assertCalledOnInstanceOf(klass, method, { times: 0 }, fn);
}
