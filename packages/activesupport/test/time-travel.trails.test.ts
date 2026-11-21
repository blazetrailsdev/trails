import { describe, it, expect } from "vitest";
import type { TestContext } from "vitest";
import { travelTo } from "../lib/testing/time-helpers.js";

import { currentTimeInstant } from "../lib/time-travel.js";

describe("TimeTravelTest", () => {
  it("the clock resolves finer than a millisecond, as Time.now does", () => {
    let pairs = 0;
    let distinct = 0;

    for (let i = 0; i < 1_000; i++) {
      const millisecond = Date.now();
      const first = currentTimeInstant().epochNanoseconds;
      const second = currentTimeInstant().epochNanoseconds;
      if (Date.now() !== millisecond) continue;
      pairs++;
      if (first !== second) distinct++;
    }

    expect(pairs).toBeGreaterThan(0);
    expect(distinct).toBeGreaterThan(pairs / 2);
  });

  it("a free travelTo stubs on the running test case", (context: TestContext) => {
    travelTo(new Date(2004, 10, 24));
    expect((context.testCase as unknown as { _simpleStubs?: unknown })._simpleStubs).toBeDefined();
  });
});
