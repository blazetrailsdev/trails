import { Deprecation } from "../deprecation.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import type { DeprecationBehaviorCallable } from "../deprecation.js";
import { ArgumentError } from "../hash-utils.js";
import { assert } from "./assertions.js";

/**
 * Mirrors: active_support/testing/deprecation.rb
 *
 * Ruby takes the block last, after the optional `match` and `deprecator`
 * positionals; the same order holds here, so an absent `match` is passed as the
 * deprecator and swapped below exactly as Rails swaps it. Blocks may be async,
 * so each helper awaits the block and returns a Promise.
 */

/**
 * Asserts that a matching deprecation warning was emitted by the given
 * deprecator during the execution of the yielded block. The `match` object may
 * be a `RegExp`, or `String` appearing in the message; omitted (or explicitly
 * `null`), any deprecation warning will match.
 *
 * Mirrors: testing/deprecation.rb:31-44.
 */
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

/**
 * Asserts that no deprecation warnings are emitted by the given deprecator
 * during the execution of the yielded block.
 *
 * Mirrors: testing/deprecation.rb:53-57.
 */
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

/**
 * Returns the return value of the block and an array of all the deprecation
 * warnings emitted by the given `deprecator` during the execution of the
 * yielded block.
 *
 * Mirrors: testing/deprecation.rb:68-77.
 */
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
