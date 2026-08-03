import { Thrown } from "./serializer-with-fallback.js";

export type OnRotation = () => void;

export interface RotatableOptions {
  onRotation?: OnRotation | null;
}

export interface Rotatable {
  readMessage(message: string, options?: Record<string, unknown>): unknown;
}

interface RotatorState {
  args: unknown[];
  options: Record<string, unknown>;
  rotations: Rotatable[];
  onRotation: OnRotation | null;
}

const STATE = new WeakMap<object, RotatorState>();

function stateOf(host: object): RotatorState {
  let state = STATE.get(host);
  if (!state) {
    state = { args: [], options: {}, rotations: [], onRotation: null };
    STATE.set(host, state);
  }
  return state;
}

/**
 * Ruby's `Messages::Rotator#initialize` captures the constructor's positional
 * args and options so `rotate` can fill in the ones a rotation omits. A
 * prepended module cannot wrap a TypeScript constructor, so each rotatable
 * class calls this from its own constructor instead.
 */
export function initialize(
  host: object,
  args: unknown[],
  options: Record<string, unknown> = {},
): void {
  const { onRotation, ...rest } = options as RotatableOptions & Record<string, unknown>;
  STATE.set(host, { args, options: rest, rotations: [], onRotation: onRotation ?? null });
}

export function rotate<T extends object>(this: T, ...args: unknown[]): T {
  return fallBackTo.call(this, buildRotation.call(this, args)) as T;
}

export function onRotation<T extends object>(this: T, callback: OnRotation): T {
  stateOf(this).onRotation = callback;
  return this;
}

export function fallBackTo<T extends object>(this: T, fallback: Rotatable): T {
  stateOf(this).rotations.push(fallback);
  return this;
}

/** @internal */
function buildRotation<T extends object>(this: T, args: unknown[]): Rotatable {
  const state = stateOf(this);
  const trailing = args.length > 0 && isPlainOptions(args[args.length - 1]);
  const positional = trailing ? args.slice(0, -1) : args;
  const options = trailing ? (args[args.length - 1] as Record<string, unknown>) : {};
  const ctor = this.constructor as new (...ctorArgs: unknown[]) => Rotatable;

  return new ctor(...positional, ...state.args.slice(positional.length), {
    ...state.options,
    ...options,
  });
}

function isPlainOptions(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Buffer.isBuffer(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** @internal */
function catchRotationError<T>(block: () => T): { value?: T; error?: Thrown } {
  try {
    return { value: block() };
  } catch (error) {
    if (
      error instanceof Thrown &&
      (error.tag === "invalid_message_format" || error.tag === "invalid_message_serialization")
    ) {
      return { error };
    }
    throw error;
  }
}

/**
 * Ruby's `Messages::Rotator#read_message`. Shaped for `prepend()`, so the
 * wrapped implementation arrives as `super_`.
 */
export function readMessage(
  this: object,
  super_: (...superArgs: unknown[]) => unknown,
  message: string,
  options: Record<string, unknown> = {},
): unknown {
  const state = stateOf(this);
  const { onRotation: perCall, ...rest } = options as RotatableOptions & Record<string, unknown>;
  const callback = perCall === undefined ? state.onRotation : perCall;

  if (state.rotations.length === 0) {
    return super_.call(this, message, rest);
  }

  const first = catchRotationError(() => super_.call(this, message, rest));
  if (!first.error) return first.value;

  for (const rotation of state.rotations) {
    const rotated = catchRotationError(() => rotation.readMessage(message, rest));
    if (!rotated.error) {
      callback?.();
      return rotated.value;
    }
  }

  throw first.error;
}
