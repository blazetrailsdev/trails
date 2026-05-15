import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("MultiParameterAttributesTest", () => {
  it("permitted multi-parameter attribute keys", () => {
    // Multi-parameter attributes use keys like "date(1i)", "date(2i)", "date(3i)"
    // In Rails these are used for date/time selects
    const params = new Parameters({
      "date(1i)": "2024",
      "date(2i)": "03",
      "date(3i)": "15",
    });
    const permitted = params.permit("date(1i)", "date(2i)", "date(3i)");
    expect(permitted.get("date(1i)")).toBe("2024");
    expect(permitted.get("date(2i)")).toBe("03");
    expect(permitted.get("date(3i)")).toBe("15");
  });
});
