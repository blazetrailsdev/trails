import { describe, it, expect } from "vitest";
import type { TestContext } from "vitest";
import { travelTo } from "../lib/testing/time-helpers.js";

import { currentTimeInstant } from "../lib/time-travel.js";

describe("TimeTravelTest", () => {
  it("the clock resolves finer than a millisecond, as Time.now does", () => {
    let subMillisecond = false;

    for (let i = 0; i < 1_000 && !subMillisecond; i++) {
      const millisecond = Date.now();
      const first = currentTimeInstant().epochNanoseconds;
      let later = first;
      while (later === first && Date.now() === millisecond) {
        later = currentTimeInstant().epochNanoseconds;
      }
      if (later !== first && Date.now() === millisecond) subMillisecond = true;
    }

    expect(subMillisecond).toBe(true);
  });

  it("a free travelTo stubs on the running test case", (context: TestContext) => {
    travelTo(new Date(2004, 10, 24));
    expect((context.testCase as unknown as { _simpleStubs?: unknown })._simpleStubs).toBeDefined();
  });
});
