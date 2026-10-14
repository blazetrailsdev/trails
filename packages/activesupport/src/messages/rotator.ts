import { isEmpty } from "@blazetrails/ruby-compat";
import { Thrown } from "./serializer-with-fallback.js";

export type OnRotation = () => void;

export interface RotatableOptions {
  onRotation?: OnRotation | null;
}

export interface Rotatable {
  readMessage(message: string, options?: Record<string, unknown>): unknown;
}

export interface RotatorHost {
  args: unknown[];
  options: Record<string, unknown>;
  rotations: Rotatable[];
  _onRotation: OnRotation | null;
}

export function rotate<T extends RotatorHost>(this: T, ...args: unknown[]): T {
  return fallBackTo.call(this, buildRotation.call(this, args)) as T;
}

export function onRotation<T extends RotatorHost>(this: T, callback: OnRotation): T {
  this._onRotation = callback;
  return this;
}

export function fallBackTo<T extends RotatorHost>(this: T, fallback: Rotatable): T {
  this.rotations.push(fallback);
  return this;
}

/** @internal */
function buildRotation<T extends RotatorHost>(this: T, args: unknown[]): Rotatable {
  const trailing = args.length > 0 && isPlainOptions(args[args.length - 1]);
  const positional = trailing ? args.slice(0, -1) : args;
  const options = trailing ? (args[args.length - 1] as Record<string, unknown>) : {};
  const ctor = this.constructor as new (...ctorArgs: unknown[]) => Rotatable;

  return new ctor(...positional, ...this.args.slice(positional.length), {
    ...this.options,
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

export function readMessage(
  this: RotatorHost,
  super_: (...superArgs: unknown[]) => unknown,
  message: string,
  options: Record<string, unknown> = {},
): unknown {
  const { onRotation: perCall, ...rest } = options as RotatableOptions & Record<string, unknown>;
  const callback = perCall === undefined ? this._onRotation : perCall;

  if (isEmpty(this.rotations)) {
    return super_.call(this, message, rest);
  }

  const first = catchRotationError(() => super_.call(this, message, rest));
  if (!first.error) return first.value;

  for (const rotation of this.rotations) {
    const rotated = catchRotationError(() => rotation.readMessage(message, rest));
    if (!rotated.error) {
      callback?.();
      return rotated.value;
    }
  }

  throw first.error;
}
