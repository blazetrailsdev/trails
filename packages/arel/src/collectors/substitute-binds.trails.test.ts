import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("SubstituteBinds", () => {
  it("leaves preparable and retryable unset", () => {
    const collector = new Collectors.SubstituteBinds(
      { quote: (val: unknown) => String(val) },
      new Collectors.SQLString(),
    );

    expect(collector.preparable).toBeUndefined();
    expect(collector.retryable).toBeUndefined();
  });
});
