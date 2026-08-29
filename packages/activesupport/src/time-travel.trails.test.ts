import { describe, it, expect } from "vitest";

import { currentTimeInstant } from "./time-travel.js";

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
});
