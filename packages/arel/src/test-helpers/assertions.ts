/**
 * Minitest assertions with no vitest matcher twin.
 *
 * `parity:test --assertions` normalizes a trails callee whose name mirrors a
 * Rails assertion (`assertNotSame` → `assert_not_same`) onto the same canonical
 * kind as the Ruby side, which is the only way these two categories can be
 * expressed from a vitest test: `expect(a).not.toBe(b)` normalizes to
 * `notEqual`, never `notSame` (the mapping is deliberate — see
 * `scripts/test-compare/assertion-kinds.ts`), and vitest has no emptiness
 * matcher at all. They live here beside `uniq` and `mustBeLike` for the same
 * reason: Rails gets them from Minitest, so no single test file owns them.
 *
 * They raise directly rather than delegating to `expect`: this module ships in
 * `dist/`, where `dist-entry-modules.trails.test.ts` loads every module as an
 * ESM entry and a top-level `vitest` import throws outside the runner.
 *
 * @internal
 */
export function assertNotSame(unexpected: unknown, actual: unknown): void {
  if (Object.is(actual, unexpected)) {
    throw new Error(`Expected ${inspect(actual)} to not be the same as ${inspect(unexpected)}.`);
  }
}

/** @internal */
export function assertEmpty(actual: ArrayLike<unknown>, message?: string): void {
  if (actual.length !== 0) {
    throw new Error(`${message ? `${message}: ` : ""}Expected ${inspect(actual)} to be empty.`);
  }
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
