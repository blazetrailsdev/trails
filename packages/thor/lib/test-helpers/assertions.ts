import { expect } from "vitest";
import { isEmpty } from "@blazetrails/ruby-compat";

type ErrorClass = new (...args: never[]) => Error;

export async function assertRaises<K extends ErrorClass>(
  exp: K[],
  { match }: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<InstanceType<K>> {
  let error: unknown;
  try {
    await block?.();
  } catch (e) {
    error = e;
  }
  expect(error, `${exp.map((e) => e.name).join(", ")} expected`).toBeDefined();
  expect(exp.some((klass) => error instanceof klass)).toBe(true);
  if (match != null) expect((error as Error).message).toMatch(match);
  return error as InstanceType<K>;
}

export async function assertNothingRaised<T>(block: () => T | Promise<T>): Promise<T> {
  return await block();
}

export function assertPredicate<T>(actual: T, predicate: (value: T) => unknown): void {
  const result = predicate(actual);
  expect(result != null && result !== false).toBe(true);
}

export function assertNotPredicate<T>(actual: T, predicate: (value: T) => unknown): void {
  const result = predicate(actual);
  expect(result == null || result === false).toBe(true);
}

export function assertEmpty(obj: string | object): void {
  expect(isEmpty(obj)).toBe(true);
}
