import { describe, expect, test, vi } from "vitest";
import { HTML, HTML4, Html } from "./index.js";
import { HTML5 } from "./namespaces.js";

describe("RailsApiTest", () => {
  test("html_module_name_alias", () => {
    expect(Html).toBe(HTML);
  });

  test("best_supported_vendor_when_html5_is_not_supported_returns_html4", () => {
    const stub = vi.spyOn(HTML.Sanitizer, "isHtml5Support").mockReturnValue(false);
    try {
      expect(HTML.Sanitizer.bestSupportedVendor()).toBe(HTML4.Sanitizer);
    } finally {
      stub.mockRestore();
    }
  });

  test.skipIf(!HTML.Sanitizer.isHtml5Support())(
    "best_supported_vendor_when_html5_is_supported_returns_html5",
    () => {
      const stub = vi.spyOn(HTML.Sanitizer, "isHtml5Support").mockReturnValue(true);
      try {
        expect(HTML.Sanitizer.bestSupportedVendor()).toBe(HTML5.Sanitizer);
      } finally {
        stub.mockRestore();
      }
    },
  );

  test("html4_sanitizer_alias_full", () => {
    expect(HTML.FullSanitizer).toBe(HTML4.FullSanitizer);
  });

  test("html4_sanitizer_alias_link", () => {
    expect(HTML.LinkSanitizer).toBe(HTML4.LinkSanitizer);
  });

  test("html4_sanitizer_alias_safe_list", () => {
    expect(HTML.SafeListSanitizer).toBe(HTML4.SafeListSanitizer);
  });

  test("html4_full_sanitizer", () => {
    expect(HTML.Sanitizer.fullSanitizer).toBe(HTML4.FullSanitizer);
    expect(HTML4.Sanitizer.fullSanitizer).toBe(HTML4.FullSanitizer);
  });

  test("html4_link_sanitizer", () => {
    expect(HTML.Sanitizer.linkSanitizer).toBe(HTML4.LinkSanitizer);
    expect(HTML4.Sanitizer.linkSanitizer).toBe(HTML4.LinkSanitizer);
  });

  test("html4_safe_list_sanitizer", () => {
    expect(HTML.Sanitizer.safeListSanitizer).toBe(HTML4.SafeListSanitizer);
    expect(HTML4.Sanitizer.safeListSanitizer).toBe(HTML4.SafeListSanitizer);
  });

  test("html4_white_list_sanitizer", () => {
    expect(HTML.Sanitizer.whiteListSanitizer).toBe(HTML4.SafeListSanitizer);
    expect(HTML4.Sanitizer.whiteListSanitizer).toBe(HTML4.SafeListSanitizer);
  });

  test.skipIf(!HTML.Sanitizer.isHtml5Support())("html5_full_sanitizer", () => {
    expect(HTML5.Sanitizer.fullSanitizer).toBe(HTML5.FullSanitizer);
  });

  test.skipIf(!HTML.Sanitizer.isHtml5Support())("html5_link_sanitizer", () => {
    expect(HTML5.Sanitizer.linkSanitizer).toBe(HTML5.LinkSanitizer);
  });

  test.skipIf(!HTML.Sanitizer.isHtml5Support())("html5_safe_list_sanitizer", () => {
    expect(HTML5.Sanitizer.safeListSanitizer).toBe(HTML5.SafeListSanitizer);
  });

  test.skipIf(!HTML.Sanitizer.isHtml5Support())("html5_white_list_sanitizer", () => {
    expect(HTML5.Sanitizer.whiteListSanitizer).toBe(HTML5.SafeListSanitizer);
  });
});
