import { Deprecation } from "../deprecation.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import type { DeprecationBehaviorCallable } from "../deprecation.js";
import { ArgumentError } from "../hash-utils.js";
import { assert } from "./assertions.js";

export async function assertDeprecated<T>(
  match: RegExp | string | Deprecation | null | undefined,
  deprecator?: Deprecation | null,
  block?: () => T | Promise<T>,
): Promise<T> {
  if (match instanceof Deprecation) [match, deprecator] = [null, match];

  if (!deprecator) {
    throw new ArgumentError("No deprecator given");
  }

  const [result, warnings] = await collectDeprecations(deprecator, block!);
  assert(warnings.length > 0, "Expected a deprecation warning within the block but received none");
  if (match != null) {
    const matcher = match instanceof RegExp ? match : new RegExp(regexpEscape(match));
    assert(
      warnings.some((w) => matcher.test(w)),
      `No deprecation warning matched ${matcher}: ${warnings.join(", ")}`,
    );
  }
  return result;
}

export async function assertNotDeprecated<T>(
  deprecator: Deprecation,
  block: () => T | Promise<T>,
): Promise<T> {
  const [result, deprecations] = await collectDeprecations(deprecator, block);
  assert(
    deprecations.length === 0,
    `Expected no deprecation warning within the block but received ${deprecations.length}: \n  ${deprecations.join("\n  ")}`,
  );
  return result;
}

export async function collectDeprecations<T>(
  deprecator: Deprecation,
  block: () => T | Promise<T>,
): Promise<[T, string[]]> {
  const oldBehavior = deprecator.behavior;
  const deprecations: string[] = [];
  deprecator.behavior = ((message: string) => {
    deprecations.push(message);
  }) as DeprecationBehaviorCallable;
  try {
    const result = await block();
    return [result, deprecations];
  } finally {
    deprecator.behavior = oldBehavior;
  }
}
