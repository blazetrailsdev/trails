import { describe, expect, test } from "vitest";
import { HTML } from "./index.js";

describe("Sanitizer.isHtml5Support", () => {
  test("probes Nokogiri and memoizes the answer on the receiver", () => {
    expect(HTML.Sanitizer.isHtml5Support()).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(HTML.Sanitizer, "_html5Support")).toBe(true);
    expect(HTML.Sanitizer.bestSupportedVendor()).toBeUndefined();
  });
});
