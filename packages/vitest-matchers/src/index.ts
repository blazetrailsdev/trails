import { isEmpty, rbEqual, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { ExpectStatic } from "vitest";

type MatcherState = ReturnType<ExpectStatic["getState"]>;

export interface RubyMatchers<R = unknown> {
  toEqualRuby(exp: unknown): R;
  toBeRubyTruthy(): R;
  toBeRubyFalsy(): R;
  toBeWithinDelta(exp: number, delta?: number): R;
  toBeEmpty(): R;
  toBeExactInstanceOf(cls: unknown): R;
  toRespondTo(meth: string): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T> extends RubyMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends RubyMatchers {}
}

function result(
  state: MatcherState,
  pass: boolean,
  received: unknown,
  what: string,
): { pass: boolean; message: () => string } {
  return {
    pass,
    message: () =>
      `expected ${state.utils.printReceived(received)} ${state.isNot ? "not " : ""}${what}`,
  };
}

export const matchers = {
  toEqualRuby(this: MatcherState, act: unknown, exp: unknown) {
    return result(this, rbEqual(exp, act), act, `to == ${this.utils.printExpected(exp)}`);
  },
  toBeRubyTruthy(this: MatcherState, received: unknown) {
    return result(this, received != null && received !== false, received, "to be truthy");
  },
  toBeRubyFalsy(this: MatcherState, received: unknown) {
    return result(this, received == null || received === false, received, "to be falsy");
  },
  toBeWithinDelta(this: MatcherState, act: number, exp: number, delta = 0.001) {
    const n = Math.abs(exp - act);
    return result(this, delta >= n, act, `to be within ${delta} of ${exp}`);
  },
  toBeEmpty(this: MatcherState, received: object) {
    const pass = rbObjRespondTo(received, "isEmpty") || isEnumerable(received);
    return result(this, pass && isEmpty(received), received, "to be empty");
  },
  toBeExactInstanceOf(this: MatcherState, received: unknown, cls: unknown) {
    const pass = received != null && (received as object).constructor === cls;
    return result(this, pass, received, `to be an instance of ${String(cls)}`);
  },
  toRespondTo(this: MatcherState, received: unknown, meth: string) {
    return result(this, rbObjRespondTo(received, meth), received, `to respond to #${meth}`);
  },
};

function isEnumerable(value: unknown): boolean {
  return typeof value === "string" || (typeof value === "object" && value !== null);
}
